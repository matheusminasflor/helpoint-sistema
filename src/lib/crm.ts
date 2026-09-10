/**
 * Rótulos e cálculos puros do CRM do Comercial (Plano CRM-1). Sem React nem
 * Supabase — só o que dá para testar sem banco. `orderTotals` espelha a
 * conta feita pelo banco (`crm_recompute_order_totals` /
 * `crm_orders_apply_discount`, em
 * supabase/migrations/20260910010000_crm_comercial_base.sql): serve só para
 * mostrar o total na tela antes de salvar — quem grava o valor final é o banco.
 */

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  site: 'Site',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  outro: 'Outro',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Link enviado',
  paid: 'Pago',
  expired: 'Link vencido',
  cancelled: 'Cancelado',
};

export const ACTIVITY_LABELS: Record<string, string> = {
  note: 'Nota',
  stage_change: 'Mudança de etapa',
  task: 'Tarefa',
  order: 'Pedido',
  payment: 'Pagamento',
  system: 'Sistema',
};

/**
 * `4800` → `'R$ 4.800,00'`. `Intl.NumberFormat` separa "R$" do valor com um
 * espaço não separável (U+00A0) — troca por espaço normal para o texto se
 * comportar como qualquer outro na tela (quebra de linha, comparação em teste).
 */
export function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(n ?? 0)
    .replace(/\s/g, ' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Subtotal e total de um pedido a partir dos itens e do desconto — mesma
 * conta das triggers `crm_recompute_order_totals` (soma dos itens) e
 * `crm_orders_apply_discount` (total = subtotal − desconto, sem passar de
 * zero). Usada só para exibir antes de salvar; o valor gravado é o que o
 * banco calcular.
 */
export function orderTotals(
  items: { quantity: number; unit_price: number }[],
  discount: number,
): { subtotal: number; total: number } {
  const subtotal = round2(items.reduce((sum, item) => sum + round2(item.quantity * item.unit_price), 0));
  const total = Math.max(round2(subtotal - (discount || 0)), 0);
  return { subtotal, total };
}
