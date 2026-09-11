/**
 * Rótulos e cálculos puros do CRM do Comercial (Plano CRM-1). Sem React nem
 * Supabase — só o que dá para testar sem banco. `orderTotals` espelha a
 * conta feita pelo banco (`crm_recompute_order_totals` /
 * `crm_orders_apply_discount`, em
 * supabase/migrations/20260910010000_crm_comercial_base.sql): serve só para
 * mostrar o total na tela antes de salvar — quem grava o valor final é o banco.
 */

import { daysFromTodayISO, todayISO } from '@/lib/dates';
import { formatDateBR } from '@/types/financeiro';

export { formatDateBR };

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  site: 'Site',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  indicacao: 'Indicação',
  importacao: 'Importação',
  outro: 'Outro',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  proposal_sent: 'Proposta enviada',
  accepted: 'Aceita',
  sent: 'Link enviado',
  paid: 'Pago',
  expired: 'Link vencido',
  cancelled: 'Cancelado',
};

/** Status em que o pedido ainda pode ser editado (itens, frete, desconto). */
export const ORDER_EDITABLE_STATUSES = new Set(['draft', 'proposal_sent']);

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
 * Subtotal e total de um pedido a partir dos itens, do desconto e do frete —
 * mesma conta das triggers `crm_recompute_order_totals` (soma dos itens) e
 * `crm_orders_apply_discount` (total = subtotal − desconto + frete, sem passar
 * de zero). Usada só para exibir antes de salvar; o valor gravado é o que o
 * banco calcular.
 */
export function orderTotals(
  items: { quantity: number; unit_price: number }[],
  discount: number,
  shipping = 0,
): { subtotal: number; total: number } {
  const subtotal = round2(items.reduce((sum, item) => sum + round2(item.quantity * item.unit_price), 0));
  const total = Math.max(round2(subtotal - (discount || 0) + (shipping || 0)), 0);
  return { subtotal, total };
}

/** `/proposta/<token>` na origem dada — o link que o cliente recebe (CRM-1c). */
export function proposalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/proposta/${token}`;
}

/**
 * A mensagem pronta para o WhatsApp quando o vendedor envia a proposta. Texto
 * simples: o cliente vê no celular. `validUntil` é `AAAA-MM-DD` ou nulo.
 */
export function proposalWhatsAppText(p: {
  contactName: string;
  companyName: string;
  number: number;
  total: number;
  url: string;
  validUntil?: string | null;
}): string {
  const lines = [
    `Olá, ${p.contactName}! Segue a proposta nº ${p.number} da ${p.companyName}: ${formatBRL(p.total)}.`,
    `Veja os itens e o total aqui: ${p.url}`,
  ];
  if (p.validUntil) lines.push(`Válida até ${formatDateBR(p.validUntil)}.`);
  lines.push('Qualquer dúvida, é só responder por aqui.');
  return lines.join('\n');
}

/**
 * Número do WhatsApp no formato internacional. O cadastro grava "só números,
 * com DDD" (10 ou 11 dígitos): ganha o 55 do Brasil. Já com 55 (12 ou 13
 * dígitos, como vem da importação) fica como está. O auditor pegou o link
 * saindo sem o 55 — `wa.me/31…` é a Holanda.
 */
export function whatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Link `wa.me` com a mensagem; sem número, abre o WhatsApp para escolher o contato. */
export function whatsAppLink(raw: string, text: string): string {
  return `https://wa.me/${whatsAppNumber(raw)}?text=${encodeURIComponent(text)}`;
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
