// Caixinha e "quem compra" (dono, 2026-10-14; migration 20270104010000). "Quem compra" e os cartões moram em
// `compras_config`; as Caixinhas (INBRAS e MF, cada uma com responsável e valor semanal — 20270129010000) em
// `caixinhas`; os lançamentos em `caixinha_movimentos`, cada um da sua Caixinha. A saída de uma compra da
// Caixinha nasce no banco, quando a compra é registrada — daqui só entram a entrada do repasse e o gasto solto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

const BUCKET = 'fin-purchases';

export interface ComprasConfig {
  comprador_id: string | null;
  /** O cartão da INBRAS: dia em que a fatura fecha e dia em que vence (2026-10-14). */
  cartao_fecha_dia: number | null;
  cartao_vence_dia: number | null;
  /** O cartão da MF, com os seus dias (dono, 2026-10-16); em branco, a MF usa os da INBRAS. */
  cartao_mf_fecha_dia: number | null;
  cartao_mf_vence_dia: number | null;
}

export interface Caixinha {
  id: string;
  filial: 'INBRAS' | 'MF';
  responsavel_id: string | null;
  valor_semanal: number | null;
}

export interface MovimentoDaCaixinha {
  id: string;
  caixinha_id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
  recibo_path: string | null;
  purchase_request_id: string | null;
  /** A reposição (entrada) vira uma conta paga no Financeiro; a saída de compra aponta o pedido (R6: os dois viram link). */
  fin_entry_id: string | null;
  compra?: { solicitacao_id: string } | null;
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
        .select('comprador_id, cartao_fecha_dia, cartao_vence_dia, cartao_mf_fecha_dia, cartao_mf_vence_dia')
        .maybeSingle()) as unknown as ComprasConfig | null),
  });
}

/** As Caixinhas da empresa, INBRAS antes de MF. */
export function useCaixinhas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['caixinhas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Caixinha[]> =>
      ((unwrap(await supabase.from('caixinhas' as never)
        .select('id, filial, responsavel_id, valor_semanal')
        .order('filial')) ?? []) as unknown as Caixinha[])
        .map((c) => ({ ...c, valor_semanal: c.valor_semanal == null ? null : Number(c.valor_semanal) })),
  });
}

/** Quem decide pedido da Caixinha: o responsável dela e o administrador (a pergunta de `pode_decidir_compra`). */
export function useDecideACaixinha(caixinhaId?: string | null): boolean {
  const { user, role } = useAuth();
  const { data: caixinhas = [] } = useCaixinhas();
  if (role === 'owner' || role === 'admin') return true;
  return !!user?.id && caixinhas.some((c) => c.responsavel_id === user.id && (!caixinhaId || c.id === caixinhaId));
}

export function useSalvarComprasConfig() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ config, caixinhas }: { config: ComprasConfig; caixinhas: Caixinha[] }) => {
      expectRows(
        await supabase.from('compras_config' as never)
          .upsert({ tenant_id: tenantId, ...config, updated_at: new Date().toISOString() } as never)
          .select('tenant_id'),
        'a configuração de quem compra',
      );
      for (const c of caixinhas) {
        expectRows(
          await supabase.from('caixinhas' as never)
            .update({ responsavel_id: c.responsavel_id, valor_semanal: c.valor_semanal, updated_at: new Date().toISOString() } as never)
            .eq('id', c.id)
            .select('id'),
          `a Caixinha ${c.filial}`,
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras-config', tenantId] });
      qc.invalidateQueries({ queryKey: ['caixinhas', tenantId] });
      toast.success('Configuração salva.');
    },
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
        .select('id, caixinha_id, tipo, valor, descricao, data, recibo_path, purchase_request_id, fin_entry_id, created_by, created_at, compra:compras_solicitacoes!caixinha_movimentos_purchase_request_id_fkey(solicitacao_id)')
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })) ?? []) as unknown as MovimentoDaCaixinha[])
        .map((m) => ({ ...m, valor: Number(m.valor) })),
  });
}

export function useLancarNaCaixinha() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      caixinha_id: string;
      tipo: 'entrada' | 'saida'; valor: number; descricao: string; data: string; recibo?: File | null;
      /** O suprimento comprado (e quanto): entra no Estoque de Compras (20270118010000). */
      produto_id?: string | null; quantidade?: number | null;
    }) => {
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
            caixinha_id: input.caixinha_id,
            tipo: input.tipo, valor: input.valor, descricao: input.descricao.trim(), data: input.data,
            recibo_path, created_by: user?.id,
            produto_id: input.produto_id || null, quantidade: input.produto_id ? input.quantidade ?? null : null,
          } as never)
          .select('id'),
        'o lançamento no Caixinha',
      );
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['caixinha', tenantId] });
      if (v.produto_id) qc.invalidateQueries({ queryKey: ['estoque', tenantId] });
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
