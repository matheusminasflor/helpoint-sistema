// Estoque de suprimentos (dono, 2026-10-15; migration 20270118010000). Só os itens do Catálogo marcados como
// suprimento. A entrada da compra registrada e da saída da Caixinha nasce no banco; daqui entram a retirada
// (data e hora, quem retirou, motivo) e a entrada manual de ajuste. O saldo não fica negativo (o banco recusa) e
// cruzar o mínimo avisa Compras.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

export interface Suprimento {
  id: string;
  name: string;
  unidade: string;
  estoque_minimo: number;
  is_active: boolean;
}

export interface MovimentoDoEstoque {
  id: string;
  produto_id: string;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  quando: string;
  retirado_por: string | null;
  motivo: string | null;
  purchase_request_id: string | null;
  caixinha_movimento_id: string | null;
  created_by: string | null;
}

export function useSuprimentos() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['suprimentos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Suprimento[]> =>
      ((unwrap(await supabase.from('compras_produtos')
        .select('id, name, unidade, estoque_minimo, is_active')
        .eq('suprimento' as never, true as never)
        .order('name')) ?? []) as unknown as Suprimento[])
        .map((p) => ({ ...p, estoque_minimo: Number(p.estoque_minimo) })),
  });
}

export function useMovimentosDoEstoque() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['estoque', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<MovimentoDoEstoque[]> =>
      ((unwrap(await supabase.from('estoque_movimentos' as never)
        .select('id, produto_id, tipo, quantidade, quando, retirado_por, motivo, purchase_request_id, caixinha_movimento_id, created_by')
        .order('quando', { ascending: false })
        .limit(1000)) ?? []) as unknown as MovimentoDoEstoque[])
        .map((m) => ({ ...m, quantidade: Number(m.quantidade) })),
  });
}

export function useLancarNoEstoque() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number; quando: string;
      retirado_por?: string | null; motivo: string;
    }) => {
      expectRows(
        await supabase.from('estoque_movimentos' as never)
          .insert({
            produto_id: input.produto_id, tipo: input.tipo, quantidade: input.quantidade, quando: input.quando,
            retirado_por: input.retirado_por || null, motivo: input.motivo.trim(), created_by: user?.id,
          } as never)
          .select('id'),
        'o lançamento no estoque',
      );
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['estoque', tenantId] });
      toast.success(v.tipo === 'saida' ? 'Retirada registrada.' : 'Entrada registrada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApagarDoEstoque() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('estoque_movimentos' as never).delete().eq('id', id).select('id'), 'o lançamento');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estoque', tenantId] }); toast.success('Lançamento apagado.'); },
    onError: (e: Error) => toast.error(`Não apagou: ${e.message}`),
  });
}
