import { todayISO } from '@/lib/dates';

export type FinKind = 'payable' | 'receivable';
export type FinStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface FinEntry {
  /** O boleto da compra (dono, 2026-10-15; 20270121010000): o Financeiro abre daqui para pagar. */
  anexo_path?: string | null;
  id: string;
  tenant_id: string;
  kind: FinKind;
  description: string;
  category: string | null;
  counterparty: string | null;
  document_number: string | null;
  amount: number;
  due_date: string;
  settled_at: string | null;
  status: FinStatus;
  payment_method: string | null;
  cost_center: string | null;
  /** Primeiro dia do mês de referência (competência). */
  competence: string;
  /** 'manual' ou o nome do arquivo importado. */
  source: string;
  import_id: string | null;
  external_id: string | null;
  /** Filial da compra (INBRAS/MF/BY.MF), quando a conta veio de uma compra (2026-10-14). */
  filial?: 'INBRAS' | 'MF' | 'BY.MF' | null;
  /** A compra que gerou a conta: não se exclui à mão (20270127030000). */
  purchase_request_id?: string | null;
  /** A parcela (1 = única ou primeira) — cartão parcelado vira uma conta por fatura. */
  parcela?: number;
  /** A conta fixa que gerou este lançamento (20270212050000). */
  conta_fixa_id?: string | null;
  /** Dia da cobrança no cartão de crédito: o banco põe o vencimento no dia da fatura da filial. */
  data_no_cartao?: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinImport {
  id: string;
  tenant_id: string;
  kind: FinKind;
  file_name: string;
  format: string;
  competence: string | null;
  row_count: number;
  total_amount: number;
  imported_by: string | null;
  created_at: string;
}

export type FinEntryInput = Omit<
  FinEntry,
  'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'created_by' | 'import_id'
> & { import_id?: string | null };

export const FIN_STATUS_LABEL: Record<FinStatus, string> = {
  pending: 'Pendente',
  paid: 'Liquidado',
  overdue: 'Atrasado',
  cancelled: 'Cancelado',
};

/** Par claro/escuro com contraste aprovado (mesmo padrão dos demais selos). */
export const FIN_STATUS_BADGE: Record<FinStatus, string> = {
  pending: 'badge-info',
  paid: 'badge-success',
  overdue: 'badge-danger',
  cancelled: 'badge-neutral',
};

export const KIND_LABEL: Record<FinKind, string> = {
  payable: 'Contas a pagar',
  receivable: 'Contas a receber',
};

/** A forma de pagamento em lista fixa (dono, 2026-10-28): antes era texto livre e cada um escrevia de um jeito. */
export const FORMAS_DE_PAGAMENTO = ['Boleto', 'Pix', 'Cartão de crédito', 'Débito automático', 'Transferência', 'Dinheiro'] as const;
export const CARTAO_DE_CREDITO = 'Cartão de crédito';
/** Os cartões da empresa, um por filial — os dias de fechamento e vencimento ficam em Compras › Configurações. */
export const CARTOES = ['INBRAS', 'MF'] as const;

/** A conta fixa (20270212050000): o modelo que gera o lançamento de cada mês ou ano sozinho, 10 dias antes. */
export interface ContaFixa {
  id: string;
  kind: FinKind;
  description: string;
  counterparty: string | null;
  category: string | null;
  cost_center: string | null;
  notes: string | null;
  amount: number;
  payment_method: string | null;
  filial: 'INBRAS' | 'MF' | 'BY.MF' | null;
  frequencia: 'mensal' | 'anual';
  primeiro_dia: string;
  ate: string | null;
  geradas: number;
  encerrada_em: string | null;
}

/** O dia da próxima ocorrência ainda não gerada (o mesmo cálculo do banco: conta a partir do 1º dia, sem escorregar). */
export function proximoDiaDaContaFixa(c: Pick<ContaFixa, 'primeiro_dia' | 'frequencia' | 'geradas' | 'ate'>): string | null {
  const [a, m, d] = c.primeiro_dia.slice(0, 10).split('-').map(Number);
  const meses = c.frequencia === 'anual' ? 12 * c.geradas : c.geradas;
  const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
  const dia = new Date(a, m - 1 + meses, Math.min(d, ultimo));
  const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
  return c.ate && iso > c.ate ? null : iso;
}

export const KIND_PARTY_LABEL: Record<FinKind, string> = {
  payable: 'Fornecedor',
  receivable: 'Cliente',
};

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function competenceLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
}

/** Situação efetiva: pendente com vencimento passado conta como atrasado. */
export function effectiveStatus(entry: Pick<FinEntry, 'status' | 'due_date'>): FinStatus {
  if (entry.status !== 'pending') return entry.status;
  const today = todayISO();
  return entry.due_date < today ? 'overdue' : 'pending';
}
