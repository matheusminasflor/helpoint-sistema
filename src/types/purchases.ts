export type PurchaseStatus = 'pending_approval' | 'approved' | 'rejected' | 'completed';

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Reprovada',
  completed: 'Concluída',
};

export const PURCHASE_STATUS_BADGE: Record<PurchaseStatus, string> = {
  pending_approval: 'badge-warning',
  approved: 'badge-info',
  rejected: 'badge-danger',
  completed: 'badge-success',
};

export interface PurchaseProduct {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}


export interface PurchaseQuote {
  id: string;
  tenant_id: string;
  request_id: string;
  supplier: string;
  amount: number;
  link: string | null;
  file_path: string | null;
  notes: string | null;
  position: number;
}

export interface PurchaseRequest {
  id: string;
  tenant_id: string;
  ticket_id: string;
  product_id: string | null;
  product_name: string;
  product_link: string | null;
  department: string | null;
  estimated_amount: number | null;
  status: PurchaseStatus;
  approved_quote_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  purchase_report: string | null;
  purchase_file_path: string | null;
  executed_by: string | null;
  executed_at: string | null;
  created_by: string | null;
  created_at: string;
  quotes?: PurchaseQuote[];
}

export interface BudgetSettings {
  tenant_id: string;
  mode: 'none' | 'per_department';
}

export interface DepartmentBudget {
  id: string;
  tenant_id: string;
  department: string;
  monthly_limit: number;
}

export interface NewQuoteInput {
  supplier: string;
  amount: string;
  link?: string;
  file?: File | null;
  notes?: string;
}

export interface NewPurchaseInput {
  product_id?: string | null;
  product_name: string;
  product_link?: string | null;
  department?: string | null;
  quotes: NewQuoteInput[];
}

export const formatBRLAmount = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
