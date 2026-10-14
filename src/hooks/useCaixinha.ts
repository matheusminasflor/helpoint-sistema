// Caixinha e "quem compra" (dono, 2026-10-14; migration 20270104010000). A configuração mora em
// `compras_config`; os lançamentos em `caixinha_movimentos`. A saída de uma compra da Caixinha nasce no banco,
// quando a compra é registrada — daqui só entram a entrada do repasse e o gasto solto (com recibo).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

const BUCKET = 'fin-purchases';

export interface ComprasConfig {
  comprador_id: string | null;
  caixinha_aprovador_id: string | null;
  caixinha_valor_semanal: number | null;
}

export interface MovimentoDaCaixinha {
  id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
  recibo_path: string | null;
  purchase_request_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function useComprasConfig() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-config', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ComprasConfig | null> =>
      (unwrap(await supabase.from('compras_config' as never)
        .select('comprador_id, caixinha_aprovador_id, caixinha_valor_semanal')
        .maybeSingle()) as unknown as ComprasConfig | null),
  });
}

/** Quem aprova a Caixinha: o aprovador dela e o administrador (a mesma pergunta de `pode_decidir_compra`). */
export function useDecideACaixinha(): boolean {
  const { user, role } = useAuth();
  const { data } = useComprasConfig();
  return role === 'owner' || role === 'admin' || (!!user?.id && data?.caixinha_aprovador_id === user.id);
}

export function useSalvarComprasConfig() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: ComprasConfig) => {
      expectRows(
        await supabase.from('compras_config' as never)
          .upsert({ tenant_id: tenantId, ...config, updated_at: new Date().toISOString() } as never)
          .select('tenant_id'),
        'a configuração de quem compra',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras-config', tenantId] }); toast.success('Configuração salva.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });
}

export function useMovimentosDaCaixinha() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['caixinha', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<MovimentoDaCaixinha[]> =>
      ((unwrap(await supabase.from('caixinha_movimentos' as never)
        .select('id, tipo, valor, descricao, data, recibo_path, purchase_request_id, created_by, created_at')
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })) ?? []) as unknown as MovimentoDaCaixinha[])
        .map((m) => ({ ...m, valor: Number(m.valor) })),
  });
}

export function useLancarNaCaixinha() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tipo: 'entrada' | 'saida'; valor: number; descricao: string; data: string; recibo?: File | null }) => {
      let recibo_path: string | null = null;
      if (input.recibo && tenantId) {
        const nome = input.recibo.name.replace(/[^\w.-]/g, '_');
        recibo_path = `${tenantId}/caixinha/${Date.now()}-${nome}`;
        const { error } = await supabase.storage.from(BUCKET).upload(recibo_path, input.recibo, { upsert: false });
        if (error) throw error;
      }
      expectRows(
        await supabase.from('caixinha_movimentos' as never)
          .insert({
            tipo: input.tipo, valor: input.valor, descricao: input.descricao.trim(), data: input.data,
            recibo_path, created_by: user?.id,
          } as never)
          .select('id'),
        'o lançamento no Caixinha',
      );
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['caixinha', tenantId] });
      toast.success(v.tipo === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApagarDaCaixinha() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('caixinha_movimentos' as never).delete().eq('id', id).select('id'), 'o lançamento');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixinha', tenantId] }); toast.success('Lançamento apagado.'); },
    onError: (e: Error) => toast.error(`Não apagou: ${e.message}`),
  });
}

export async function urlDoRecibo(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
