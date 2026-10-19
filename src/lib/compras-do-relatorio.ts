// O que o Relatório de compras do Financeiro calcula de cada compra (puro, sem banco): situação e o quadro por filial.
import type { FormaPagamento, FilialDaCompra } from '@/types/purchases';

export interface ContaDaCompra { status: 'pending' | 'paid' | 'overdue' | 'cancelled'; amount: number; parcela: number; due_date: string }

export interface CompraDoRelatorio {
  id: string;
  ticket_id: string;
  product_name: string;
  department: string | null;
  estimated_amount: number | null;
  executed_at: string | null;
  pagamento_em: string | null;
  /** A data do relatório: a da compra registrada, ou a do pagamento quando ainda aguarda a nota. */
  data: string;
  aguardandoNota: boolean;
  forma_pagamento: FormaPagamento | null;
  parcelas: number | null;
  filial: FilialDaCompra | null;
  caixinha: boolean;
  purchase_file_path: string | null;
  cotacao: { supplier: string } | null;
  contas: ContaDaCompra[];
}

/** Em aberto: alguma conta da compra ainda por pagar. Pago com o caixa (Caixinha) já saiu: liquidado. */
export function situacaoDaCompra(c: CompraDoRelatorio): { aberta: boolean; emAberto: number } {
  if (c.caixinha || c.forma_pagamento === 'caixinha') return { aberta: false, emAberto: 0 };
  const abertas = c.contas.filter((k) => k.status === 'pending' || k.status === 'overdue');
  return { aberta: abertas.length > 0, emAberto: abertas.reduce((s, k) => s + Number(k.amount), 0) };
}

/** O quadro por filial: total, em aberto, liquidado e aguardando a nota de cada uma (as sem filial em "Sem filial"). */
export function resumoPorFilial(compras: CompraDoRelatorio[]) {
  const porFilial = new Map<string, { filial: string; compras: number; total: number; emAberto: number; aguardandoNota: number }>();
  for (const c of compras) {
    const filial = c.filial ?? 'Sem filial';
    const r = porFilial.get(filial) ?? { filial, compras: 0, total: 0, emAberto: 0, aguardandoNota: 0 };
    const valor = Number(c.estimated_amount ?? 0);
    r.compras += 1;
    r.total += valor;
    r.emAberto += situacaoDaCompra(c).emAberto;
    if (c.aguardandoNota) r.aguardandoNota += valor;
    porFilial.set(filial, r);
  }
  return [...porFilial.values()].sort((a, b) => a.filial.localeCompare(b.filial));
}
