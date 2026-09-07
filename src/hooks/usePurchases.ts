import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseAmount } from '@/lib/finance-import';
import { unwrap } from '@/lib/supabase-result';
import type {
  BudgetSettings,
  DepartmentBudget,
  NewPurchaseInput,
  PurchaseProduct,
  PurchaseQuote,
  PurchaseRequest,
} from '@/types/purchases';

const BUCKET = 'fin-purchases';

async function uploadPurchaseFile(tenantId: string, ticketId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${tenantId}/${ticketId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function getPurchaseFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------- Produtos

export function usePurchaseProducts(search = '', options: { includeInactive?: boolean } = {}) {
  const { tenantId } = useAuth();
  const { includeInactive = false } = options;
  return useQuery({
    queryKey: ['fin-purchase-products', tenantId, search, includeInactive],
    enabled: !!tenantId,
    queryFn: async (): Promise<PurchaseProduct[]> => {
      let query = supabase.from('fin_purchase_products').select('*').order('name');
      if (!includeInactive) query = query.eq('is_active', true);
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
      const { data, error } = await query.limit(includeInactive ? 500 : 20);
      if (error) throw error;
      return (data || []) as unknown as PurchaseProduct[];
    },
  });
}

export function useCreatePurchaseProduct() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; category?: string }) => {
      if (!tenantId) throw new Error('Empresa não identificada. Recarregue a página e tente novamente.');
      if (!input.name.trim()) throw new Error('Informe o nome do produto.');

      const { data, error } = await supabase
        .from('fin_purchase_products')
        .insert({
          tenant_id: tenantId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          category: input.category?.trim() || null,
          created_by: user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PurchaseProduct;
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['fin-purchase-products'] });
      toast.success(`Produto "${product.name}" cadastrado`);
    },
    onError: (e: Error) => toast.error(`Não foi possível cadastrar o produto: ${e.message}`),
  });
}

export function useUpdatePurchaseProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string | null; category?: string | null; is_active?: boolean }) => {
      const { error } = await supabase
        .from('fin_purchase_products')
        .update(patch as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-purchase-products'] });
      toast.success('Produto atualizado');
    },
    onError: (e: Error) => toast.error(`Não foi possível atualizar o produto: ${e.message}`),
  });
}

export interface ProductPurchaseHistory {
  product_id: string | null;
  product_name: string;
  supplier: string | null;
  amount: number | null;
  purchased_at: string | null;
  count: number;
}

/**
 * Último fornecedor e preço pago por produto, derivados do orçamento aprovado
 * mais recente de cada solicitação aprovada/concluída.
 */
export function usePurchaseHistoryByProduct() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-purchase-history-by-product', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Map<string, ProductPurchaseHistory>> => {
      const { data: requests, error } = await supabase
        .from('fin_purchase_requests')
        .select('id, product_id, product_name, approved_quote_id, approved_at, status')
        .in('status', ['approved', 'completed'])
        .not('approved_quote_id', 'is', null)
        .order('approved_at', { ascending: false });
      if (error) throw error;

      const rows = (requests || []) as unknown as Array<{
        id: string; product_id: string | null; product_name: string;
        approved_quote_id: string | null; approved_at: string | null;
      }>;
      if (!rows.length) return new Map();

      const quotes = unwrap(await supabase
        .from('fin_purchase_quotes')
        .select('id, supplier, amount')
        .in('id', rows.map(r => r.approved_quote_id!).filter(Boolean)));

      const quoteMap = new Map(
        ((quotes || []) as unknown as Array<{ id: string; supplier: string; amount: number }>)
          .map(q => [q.id, q]),
      );

      const result = new Map<string, ProductPurchaseHistory>();
      for (const r of rows) {
        const key = r.product_id || r.product_name.toLowerCase();
        const quote = r.approved_quote_id ? quoteMap.get(r.approved_quote_id) : undefined;
        const existing = result.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        result.set(key, {
          product_id: r.product_id,
          product_name: r.product_name,
          supplier: quote?.supplier ?? null,
          amount: quote ? Number(quote.amount) : null,
          purchased_at: r.approved_at,
          count: 1,
        });
      }
      return result;
    },
  });
}


// ------------------------------------------------------------ Solicitações

export function usePurchaseRequestByTicket(ticketId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-purchase-request', tenantId, ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<PurchaseRequest | null> => {
      const { data, error } = await supabase
        .from('fin_purchase_requests')
        .select('*')
        .eq('ticket_id', ticketId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const request = data as unknown as PurchaseRequest;
      const quotes = unwrap(await supabase
        .from('fin_purchase_quotes')
        .select('*')
        .eq('request_id', request.id)
        .order('position'));
      return { ...request, quotes: (quotes || []) as unknown as PurchaseQuote[] };
    },
  });
}

export function usePurchaseRequests(status?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-purchase-requests', tenantId, status ?? 'all'],
    enabled: !!tenantId,
    queryFn: async (): Promise<PurchaseRequest[]> => {
      let query = supabase.from('fin_purchase_requests').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseRequest[];
    },
  });
}

/** Cria a solicitação de compra ligada a um chamado já criado. */
export function useCreatePurchaseRequest() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, input }: { ticketId: string; input: NewPurchaseInput }) => {
      const amounts = input.quotes
        .map(q => parseAmount(q.amount) ?? NaN)
        .filter(n => Number.isFinite(n) && n > 0);
      const estimated = amounts.length ? Math.min(...amounts) : null;

      const { data, error } = await supabase
        .from('fin_purchase_requests')
        .insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          product_id: input.product_id ?? null,
          product_name: input.product_name.trim(),
          product_link: input.product_link?.trim() || null,
          department: input.department ?? null,
          estimated_amount: estimated,
          created_by: user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;

      const request = data as unknown as PurchaseRequest;

      const quotes = [];
      for (let i = 0; i < input.quotes.length; i++) {
        const q = input.quotes[i];
        const amount = parseAmount(q.amount) ?? NaN;
        if (!q.supplier.trim() || !Number.isFinite(amount) || amount <= 0) continue;
        let filePath: string | null = null;
        if (q.file && tenantId) {
          try {
            filePath = await uploadPurchaseFile(tenantId, ticketId, q.file);
          } catch {
            toast.warning(`Não foi possível anexar o arquivo do orçamento ${i + 1}.`);
          }
        }
        quotes.push({
          tenant_id: tenantId,
          request_id: request.id,
          supplier: q.supplier.trim(),
          amount,
          link: q.link?.trim() || null,
          notes: q.notes?.trim() || null,
          file_path: filePath,
          position: i + 1,
        });
      }

      if (quotes.length) {
        const { error: qErr } = await supabase.from('fin_purchase_quotes').insert(quotes as never);
        if (qErr) throw qErr;
      }

      return request;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-purchase-requests'] });
      qc.invalidateQueries({ queryKey: ['fin-purchase-request'] });
    },
  });
}

function useInvalidatePurchase() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fin-purchase-request'] });
    qc.invalidateQueries({ queryKey: ['fin-purchase-requests'] });
    qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
  };
}

async function addSystemComment(ticketId: string, userId: string | undefined, content: string) {
  if (!userId) return;
  const ticket = unwrap(await supabase
    .from('tickets')
    .select('tenant_id')
    .eq('id', ticketId)
    .maybeSingle());
  if (!ticket) return;
  await supabase.from('ticket_comments').insert({
    tenant_id: (ticket as { tenant_id: string }).tenant_id,
    ticket_id: ticketId,
    author_id: userId,
    content,
    is_internal: true,
  } as never);
}


export function useApprovePurchase() {
  const { user } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, quote }: { request: PurchaseRequest; quote: PurchaseQuote }) => {
      const { error } = await supabase
        .from('fin_purchase_requests')
        .update({
          status: 'approved',
          approved_quote_id: quote.id,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
          estimated_amount: quote.amount,
          rejection_reason: null,
        } as never)
        .eq('id', request.id);
      if (error) throw error;

      await supabase
        .from('tickets')
        .update({ status: 'in_progress' } as never)
        .eq('id', request.ticket_id);

      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: request.tenant_id,
        user_id: request.created_by,
        type: 'purchase_decided',
        reference_type: 'ticket',
        reference_id: request.ticket_id,
        title: 'Compra aprovada',
        message: `A compra de "${request.product_name}" foi aprovada.`,
      });
      if (notifyError) console.error(notifyError);

      await addSystemComment(
        request.ticket_id,
        user?.id,
        `Compra aprovada. Orçamento escolhido: ${quote.supplier} — R$ ${Number(quote.amount).toFixed(2)}.`,
      );
    },
    onSuccess: () => { invalidate(); toast.success('Compra aprovada'); },
    onError: (e: Error) => toast.error(`Erro ao aprovar: ${e.message}`),
  });
}

export function useRejectPurchase() {
  const { user } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, reason }: { request: PurchaseRequest; reason: string }) => {
      const { error } = await supabase
        .from('fin_purchase_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason.trim(),
          rejected_by: user?.id ?? null,
          rejected_at: new Date().toISOString(),
        } as never)
        .eq('id', request.id);
      if (error) throw error;

      await supabase
        .from('tickets')
        .update({ status: 'rejected', resolution_notes: `Compra reprovada: ${reason.trim()}` } as never)
        .eq('id', request.ticket_id);

      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: request.tenant_id,
        user_id: request.created_by,
        type: 'purchase_decided',
        reference_type: 'ticket',
        reference_id: request.ticket_id,
        title: 'Compra reprovada',
        message: `A compra de "${request.product_name}" foi reprovada. Motivo: ${reason.trim()}`,
      });
      if (notifyError) console.error(notifyError);

      await addSystemComment(request.ticket_id, user?.id, `Compra reprovada. Motivo: ${reason.trim()}`);
    },
    onSuccess: () => { invalidate(); toast.success('Compra reprovada'); },
    onError: (e: Error) => toast.error(`Erro ao reprovar: ${e.message}`),
  });
}

export function useCompletePurchase() {
  const { user, tenantId } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, report, file }: { request: PurchaseRequest; report: string; file?: File | null }) => {
      let filePath: string | null = null;
      if (file && tenantId) filePath = await uploadPurchaseFile(tenantId, request.ticket_id, file);

      const { error } = await supabase
        .from('fin_purchase_requests')
        .update({
          status: 'completed',
          purchase_report: report.trim(),
          purchase_file_path: filePath,
          executed_by: user?.id ?? null,
          executed_at: new Date().toISOString(),
        } as never)
        .eq('id', request.id);
      if (error) throw error;

      await supabase
        .from('tickets')
        .update({
          status: 'closed',
          resolution_notes: report.trim(),
          resolved_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        } as never)
        .eq('id', request.ticket_id);

      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: request.tenant_id,
        user_id: request.created_by,
        type: 'purchase_decided',
        reference_type: 'ticket',
        reference_id: request.ticket_id,
        title: 'Compra concluída',
        message: `A compra de "${request.product_name}" foi concluída.`,
      });
      if (notifyError) console.error(notifyError);

      await addSystemComment(request.ticket_id, user?.id, `Laudo de compra registrado: ${report.trim()}`);
    },
    onSuccess: () => { invalidate(); toast.success('Compra concluída e chamado encerrado'); },
    onError: (e: Error) => toast.error(`Erro ao concluir: ${e.message}`),
  });
}

// ------------------------------------------------------------- Teto de gasto

export function useBudgetSettings() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-budget-settings', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<BudgetSettings> => {
      const { data, error } = await supabase
        .from('fin_budget_settings')
        .select('*')
        .eq('tenant_id', tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BudgetSettings) ?? { tenant_id: tenantId!, mode: 'none' };
    },
  });
}

export function useSaveBudgetSettings() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: 'none' | 'per_department') => {
      const { error } = await supabase
        .from('fin_budget_settings')
        .upsert({ tenant_id: tenantId, mode } as never, { onConflict: 'tenant_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-budget-settings'] });
      toast.success('Configuração de teto atualizada');
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  });
}

export function useDepartmentBudgets() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-department-budgets', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<DepartmentBudget[]> => {
      const { data, error } = await supabase.from('fin_department_budgets').select('*').order('department');
      if (error) throw error;
      return (data || []) as unknown as DepartmentBudget[];
    },
  });
}

export function useSaveDepartmentBudget() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ department, monthly_limit }: { department: string; monthly_limit: number }) => {
      const { error } = await supabase
        .from('fin_department_budgets')
        .upsert({ tenant_id: tenantId, department, monthly_limit } as never, { onConflict: 'tenant_id,department' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-department-budgets'] });
      toast.success('Teto mensal atualizado');
    },
    onError: (e: Error) => toast.error(`Erro ao salvar teto: ${e.message}`),
  });
}

/** Total já aprovado/concluído no mês corrente para o setor informado. */
export function useDepartmentMonthlySpend(department: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-department-spend', tenantId, department],
    enabled: !!tenantId && !!department,
    queryFn: async (): Promise<number> => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data, error } = await supabase
        .from('fin_purchase_requests')
        .select('estimated_amount, status, approved_at')
        .eq('department', department!)
        .in('status', ['approved', 'completed'])
        .gte('approved_at', start);
      if (error) throw error;
      return (data || []).reduce((sum, r) => sum + Number((r as { estimated_amount: number | null }).estimated_amount || 0), 0);
    },
  });
}

// -------------------------------------------------- Painel de solicitações

export interface PurchaseRequestFilters {
  status?: string;
  department?: string;
  from?: string;
  to?: string;
}

export interface PurchaseRequestRow extends PurchaseRequest {
  ticket?: { id: string; ticket_number: number; title: string; status: string } | null;
}

export function usePurchaseRequestsPanel(filters: PurchaseRequestFilters = {}) {
  const { tenantId } = useAuth();
  const { status, department, from, to } = filters;
  return useQuery({
    queryKey: ['fin-purchase-requests-panel', tenantId, status ?? 'all', department ?? 'all', from ?? '', to ?? ''],
    enabled: !!tenantId,
    queryFn: async (): Promise<PurchaseRequestRow[]> => {
      let query = supabase
        .from('fin_purchase_requests')
        .select('*, ticket:tickets(id, ticket_number, title, status)')
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      if (department) query = query.eq('department', department);
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseRequestRow[];
    },
  });
}

/** Contadores de pendências: aguardando aprovação e aprovadas aguardando execução. */
export function usePurchaseCounters() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-purchase-counters', tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ pendingApproval: number; pendingExecution: number }> => {
      const [pending, approved] = await Promise.all([
        supabase.from('fin_purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('fin_purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      ]);
      return {
        pendingApproval: pending.count ?? 0,
        pendingExecution: approved.count ?? 0,
      };
    },
  });
}

// ------------------------------------------------------- Indicadores

export interface PurchaseIndicators {
  monthTotal: number;
  byDepartment: { department: string; total: number }[];
  topProducts: { name: string; count: number; total: number }[];
  suppliers: { supplier: string; count: number; total: number }[];
  avgApprovalHours: number | null;
  pendingApproval: number;
}

/** Indicadores de compras do ano corrente (mês corrente para o gasto x teto). */
export function usePurchaseIndicators() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fin-purchase-indicators', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PurchaseIndicators> => {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data, error } = await supabase
        .from('fin_purchase_requests')
        .select('id, product_name, department, estimated_amount, status, created_at, approved_at, approved_quote_id')
        .gte('created_at', yearStart);
      if (error) throw error;

      const rows = (data || []) as unknown as Array<{
        id: string; product_name: string; department: string | null;
        estimated_amount: number | null; status: string;
        created_at: string; approved_at: string | null; approved_quote_id: string | null;
      }>;

      const quoteIds = rows.map(r => r.approved_quote_id).filter(Boolean) as string[];
      let quoteMap = new Map<string, { supplier: string; amount: number }>();
      if (quoteIds.length) {
        const quotes = unwrap(await supabase
          .from('fin_purchase_quotes')
          .select('id, supplier, amount')
          .in('id', quoteIds));
        quoteMap = new Map(
          ((quotes || []) as unknown as Array<{ id: string; supplier: string; amount: number }>)
            .map(q => [q.id, { supplier: q.supplier, amount: Number(q.amount) }]),
        );
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const settled = rows.filter(r => r.status === 'approved' || r.status === 'completed');

      const byDept = new Map<string, number>();
      let monthTotal = 0;
      for (const r of settled) {
        const when = r.approved_at ? new Date(r.approved_at) : new Date(r.created_at);
        if (when >= monthStart) {
          const amount = Number(r.estimated_amount || 0);
          monthTotal += amount;
          const dept = r.department || 'Sem setor';
          byDept.set(dept, (byDept.get(dept) || 0) + amount);
        }
      }

      const products = new Map<string, { count: number; total: number }>();
      const suppliers = new Map<string, { count: number; total: number }>();
      let approvalHoursSum = 0;
      let approvalCount = 0;

      for (const r of settled) {
        const key = r.product_name.trim();
        const amount = Number(r.estimated_amount || 0);
        const p = products.get(key) || { count: 0, total: 0 };
        products.set(key, { count: p.count + 1, total: p.total + amount });

        const quote = r.approved_quote_id ? quoteMap.get(r.approved_quote_id) : undefined;
        if (quote) {
          const s = suppliers.get(quote.supplier) || { count: 0, total: 0 };
          suppliers.set(quote.supplier, { count: s.count + 1, total: s.total + quote.amount });
        }

        if (r.approved_at) {
          const hours = (new Date(r.approved_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;
          if (Number.isFinite(hours) && hours >= 0) { approvalHoursSum += hours; approvalCount += 1; }
        }
      }

      return {
        monthTotal,
        byDepartment: [...byDept.entries()].map(([department, total]) => ({ department, total }))
          .sort((a, b) => b.total - a.total),
        topProducts: [...products.entries()].map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.count - a.count).slice(0, 8),
        suppliers: [...suppliers.entries()].map(([supplier, v]) => ({ supplier, ...v }))
          .sort((a, b) => b.total - a.total).slice(0, 8),
        avgApprovalHours: approvalCount ? approvalHoursSum / approvalCount : null,
        pendingApproval: rows.filter(r => r.status === 'pending_approval').length,
      };
    },
  });
}
