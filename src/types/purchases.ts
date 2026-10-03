// `adjustment_requested`: quem decide pediu ajuste e a compra voltou para quem pediu (20261130010000).
export type PurchaseStatus = 'pending_approval' | 'adjustment_requested' | 'approved' | 'rejected' | 'completed';

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  pending_approval: 'Aguardando aprovação',
  adjustment_requested: 'Ajuste solicitado',
  approved: 'Aprovada',
  rejected: 'Reprovada',
  completed: 'Concluída',
};

export const PURCHASE_STATUS_BADGE: Record<PurchaseStatus, string> = {
  pending_approval: 'badge-warning',
  adjustment_requested: 'badge-warning',
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
  /** O nome como foi escrito no orçamento — é o que vale no histórico. */
  supplier: string;
  /**
   * Aponta para o cadastro de fornecedores da empresa (`suppliers`), quando o
   * fornecedor está lá. Nulo = nome digitado e fora do cadastro. Quando aponta,
   * é do cadastro que sai o nome na conta a pagar.
   */
  supplier_id: string | null;
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
  /** O que quem decide pediu para ajustar (obrigatório ao pedir ajuste). */
  adjustment_reason: string | null;
  /** O que o solicitante respondeu ao reenviar depois do ajuste. */
  adjustment_response: string | null;
  /** Observação opcional de quem aprovou. */
  approval_notes: string | null;
  /** Por que a compra foi aprovada com menos de três orçamentos (L8). */
  few_quotes_reason: string | null;
  /**
   * Por que foi aprovada acima do teto mensal do setor (leva I). O banco exige
   * quando estoura e apaga quando a aprovação é desfeita — o mesmo desenho de
   * `few_quotes_reason`.
   */
  over_budget_reason: string | null;
  /**
   * Vencimento informado no laudo de compra. Nulo = à vista. É daqui que sai o
   * vencimento da conta a pagar; antes da leva I a conta nascia sempre vencendo
   * no dia da conclusão.
   */
  payment_due_date: string | null;
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
  /** Preenchido quando o fornecedor foi escolhido do cadastro da empresa. */
  supplierId?: string | null;
  amount: string;
  link?: string;
  file?: File | null;
  notes?: string;
}

export interface NewPurchaseInput {
  product_id?: string | null;
  product_name: string;
  product_link?: string | null;
  /**
   * O setor que vira o centro de custo da conta a pagar. Escolhido pelo
   * solicitante (leva I) — antes era lido de `user_metadata.department`, que
   * nada neste sistema escreve, e chegava sempre nulo.
   */
  department?: string | null;
  quotes: NewQuoteInput[];
}

export const formatBRLAmount = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
