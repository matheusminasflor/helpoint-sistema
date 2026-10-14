// Os relatórios do Financeiro de Compras e da Caixinha (dono, 2026-10-14). Compras: as compras REGISTRADAS no
// período (a data é a da compra feita), com as contas a pagar de cada uma — é delas que sai "em aberto" ou
// "liquidado". Caixinha: os lançamentos do período, com o setor da compra quando a saída veio de um pedido.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { instantesDoIntervalo, type Intervalo } from '@/lib/periodo-do-relatorio';
import type { FormaPagamento, FilialDaCompra } from '@/types/purchases';

export interface ContaDaCompra { status: 'pending' | 'paid' | 'overdue' | 'cancelled'; amount: number; parcela: number; due_date: string }

export interface CompraDoRelatorio {
  id: string;
  ticket_id: string;
  product_name: string;
  department: string | null;
  estimated_amount: number | null;
  executed_at: string;
  forma_pagamento: FormaPagamento | null;
  parcelas: number | null;
  filial: FilialDaCompra | null;
  caixinha: boolean;
  purchase_file_path: string | null;
  cotacao: { supplier: string } | null;
  contas: ContaDaCompra[];
}

export function useComprasDoRelatorio(intervalo: Intervalo) {
  const { tenantId } = useAuth();
  const { desde, antes } = instantesDoIntervalo(intervalo);
  return useQuery({
    queryKey: ['relatorio-compras', tenantId, desde, antes],
    enabled: !!tenantId,
    queryFn: async (): Promise<CompraDoRelatorio[]> =>
      ((unwrap(await supabase.from('compras_solicitacoes')
        .select('id, ticket_id, product_name, department, estimated_amount, executed_at, forma_pagamento, parcelas, filial, caixinha, purchase_file_path, '
          + 'cotacao:compras_orcamentos!compras_solicitacoes_approved_quote_fkey(supplier), contas:fin_entries(status, amount, parcela, due_date)')
        .eq('status', 'completed')
        .gte('executed_at', desde)
        .lt('executed_at', antes)
        .order('executed_at', { ascending: true })) ?? []) as unknown as CompraDoRelatorio[]),
  });
}

/** Em aberto: alguma conta da compra ainda por pagar. Pago com o caixa (Caixinha) já saiu: liquidado. */
export function situacaoDaCompra(c: CompraDoRelatorio): { aberta: boolean; emAberto: number } {
  if (c.caixinha || c.forma_pagamento === 'caixinha') return { aberta: false, emAberto: 0 };
  const abertas = c.contas.filter((k) => k.status === 'pending' || k.status === 'overdue');
  return { aberta: abertas.length > 0, emAberto: abertas.reduce((s, k) => s + Number(k.amount), 0) };
}

export interface LancamentoDoRelatorio {
  id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
  recibo_path: string | null;
  compra: { department: string | null } | null;
}

export function useCaixinhaDoRelatorio(intervalo: Intervalo) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['relatorio-caixinha', tenantId, intervalo.de, intervalo.ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<LancamentoDoRelatorio[]> =>
      ((unwrap(await supabase.from('caixinha_movimentos' as never)
        .select('id, tipo, valor, descricao, data, recibo_path, compra:compras_solicitacoes(department)')
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
