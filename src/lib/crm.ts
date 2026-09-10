/**
 * Rótulos e cálculos puros do CRM do Comercial (Plano CRM-1). Sem React nem
 * Supabase — só o que dá para testar sem banco. `orderTotals` espelha a
 * conta feita pelo banco (`crm_recompute_order_totals` /
 * `crm_orders_apply_discount`, em
 * supabase/migrations/20260910010000_crm_comercial_base.sql): serve só para
 * mostrar o total na tela antes de salvar — quem grava o valor final é o banco.
 */

import { daysFromTodayISO, todayISO } from '@/lib/dates';

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

/**
 * Cores das etapas do funil (E1). O banco guarda só o NOME da cor
 * (`crm_pipeline_stages.color`, CHECK com esta lista); quem pinta é o front,
 * por classes do tema (`bg-stage-*`, tokens `--stage-*` em index.css) — a regra
 * `helpoint/cor-fixa` não deixa paleta fixa nem hex solto.
 * `dot` pinta a bolinha e o cabeçalho; `soft` é o fundo suave da coluna.
 */
export const STAGE_COLORS: Record<string, { label: string; dot: string; soft: string }> = {
  slate:  { label: 'Cinza',    dot: 'bg-stage-slate', soft: 'bg-stage-slate/10' },
  blue:   { label: 'Azul',     dot: 'bg-stage-blue', soft: 'bg-stage-blue/10' },
  teal:   { label: 'Verde-água', dot: 'bg-stage-teal', soft: 'bg-stage-teal/10' },
  green:  { label: 'Verde',    dot: 'bg-stage-green', soft: 'bg-stage-green/10' },
  amber:  { label: 'Âmbar',    dot: 'bg-stage-amber', soft: 'bg-stage-amber/10' },
  red:    { label: 'Vermelho', dot: 'bg-stage-red', soft: 'bg-stage-red/10' },
  violet: { label: 'Violeta',  dot: 'bg-stage-violet', soft: 'bg-stage-violet/10' },
  pink:   { label: 'Rosa',     dot: 'bg-stage-pink', soft: 'bg-stage-pink/10' },
};

export const STAGE_KIND_LABELS: Record<string, string> = {
  open: 'Em andamento',
  won: 'Ganho',
  lost: 'Perdido',
};

// ─── Indicadores de venda (E4) ──────────────────────────────────────────────

export type SalesRange = '30d' | '90d' | 'month' | 'year';

export const SALES_RANGES: { value: SalesRange; label: string }[] = [
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'year', label: 'Este ano' },
];

/** Início e fim (locais, `AAAA-MM-DD` — regra 4) de cada faixa dos indicadores. */
export function rangeDates(range: SalesRange): { from: string; to: string } {
  const to = todayISO();
  if (range === '30d') return { from: daysFromTodayISO(-30), to };
  if (range === '90d') return { from: daysFromTodayISO(-90), to };
  if (range === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  return { from: `${to.slice(0, 4)}-01-01`, to };
}
