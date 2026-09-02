export type FinKind = 'payable' | 'receivable';
export type FinStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface FinEntry {
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
  const today = new Date().toISOString().slice(0, 10);
  return entry.due_date < today ? 'overdue' : 'pending';
}
