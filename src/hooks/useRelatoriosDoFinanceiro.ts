// Os relatórios do Financeiro de Compras e da Caixinha (dono, 2026-10-14). Compras: as compras REGISTRADAS no
// período (a data é a da compra feita) e as pagas aguardando a nota, com as contas a pagar de cada uma — é delas que
// sai "em aberto" ou "liquidado". Caixinha: os lançamentos do período, com o setor da compra quando a saída veio de um pedido.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { instantesDoIntervalo, type Intervalo } from '@/lib/periodo-do-relatorio';
import type { CompraDoRelatorio } from '@/lib/compras-do-relatorio';

export { resumoPorFilial, situacaoDaCompra, type CompraDoRelatorio, type ContaDaCompra } from '@/lib/compras-do-relatorio';

export function useComprasDoRelatorio(intervalo: Intervalo) {
  const { tenantId } = useAuth();
  const { desde, antes } = instantesDoIntervalo(intervalo);
  // Registradas (pela data da compra feita) e, desde 2026-10-19 (dono), as já pagas que aguardam a nota (aprovadas
  // com `pagamento_em`, pela data do pagamento).
  const doPeriodo = async (status: 'completed' | 'approved', coluna: 'executed_at' | 'pagamento_em') =>
    ((unwrap(await supabase.from('compras_solicitacoes')
      .select('id, ticket_id, product_name, department, estimated_amount, executed_at, pagamento_em, forma_pagamento, parcelas, filial, caixinha, purchase_file_path, '
        + 'cotacao:compras_orcamentos!compras_solicitacoes_approved_quote_fkey(supplier), contas:fin_entries(status, amount, parcela, due_date)')
      .eq('status', status)
      .gte(coluna, desde)
      .lt(coluna, antes)) ?? []) as unknown as Omit<CompraDoRelatorio, 'data' | 'aguardandoNota'>[])
      .map((c) => ({ ...c, data: c[coluna]!, aguardandoNota: status === 'approved' }));
  return useQuery({
    queryKey: ['relatorio-compras', tenantId, desde, antes],
    enabled: !!tenantId,
    queryFn: async (): Promise<CompraDoRelatorio[]> => {
      const [registradas, semNota] = await Promise.all([doPeriodo('completed', 'executed_at'), doPeriodo('approved', 'pagamento_em')]);
      return [...registradas, ...semNota].sort((a, b) => a.data.localeCompare(b.data));
    },
  });
}

export interface LancamentoDoRelatorio {
  id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
  recibo_path: string | null;
  compra: { department: string | null } | null;
  /** De qual Caixinha (INBRAS ou MF, 20270129010000). */
  caixinha_id: string;
}

export function useCaixinhaDoRelatorio(intervalo: Intervalo) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['relatorio-caixinha', tenantId, intervalo.de, intervalo.ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<LancamentoDoRelatorio[]> =>
      ((unwrap(await supabase.from('caixinha_movimentos' as never)
        .select('id, tipo, valor, descricao, data, recibo_path, caixinha_id, compra:compras_solicitacoes(department)')
        .gte('data', intervalo.de)
        .lte('data', intervalo.ate)
        .order('data', { ascending: true })) ?? []) as unknown as LancamentoDoRelatorio[])
        .map((l) => ({ ...l, valor: Number(l.valor) })),
  });
}

/** Para o PDF: o arquivo da nota ou do recibo (o mesmo cofre das compras). */
export async function baixarAnexo(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from('fin-purchases').download(path);
  if (error) return null;
  return data;
}
