import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseAmount } from '@/lib/finance-import';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';
import { temposDeDecisao } from '@/lib/tempo-de-decisao';
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
      let query = supabase.from('compras_produtos').select('*').order('name');
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
        .from('compras_produtos')
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
        .from('compras_produtos')
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
        .from('compras_solicitacoes')
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
        .from('compras_orcamentos')
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


export interface CompraDoHistorico {
  id: string;
  ticket_id: string;
  data: string | null;
  fornecedor: string | null;
  valor: number | null;
  setor: string | null;
}

/** A chave que junta as compras do mesmo item: o produto do catálogo, ou o nome digitado. */
export const chaveDoItem = (r: { product_id: string | null; product_name: string }) =>
  r.product_id || r.product_name.trim().toLowerCase();

/**
 * Todas as compras já aprovadas de cada item, da mais recente para a mais antiga — o histórico que a
 * Diretoria vê ao lado do pedido pendente (dono, 2026-10-03). Primo de `usePurchaseHistoryByProduct`,
 * que guarda só a última.
 */
export function useHistoricoDeCompras() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-historico-por-item', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Map<string, CompraDoHistorico[]>> => {
      // O orçamento aprovado vem junto, pela chave estrangeira (o PostgREST faz a junção).
      const rows = (unwrap(await supabase
        .from('compras_solicitacoes')
        .select('id, ticket_id, product_id, product_name, approved_at, department, cotacao:compras_orcamentos!compras_solicitacoes_approved_quote_fkey(supplier, amount)')
        .in('status', ['approved', 'completed'])
        .order('approved_at', { ascending: false })) ?? []) as unknown as Array<{
          id: string; ticket_id: string; product_id: string | null; product_name: string;
          approved_at: string | null; department: string | null;
          cotacao: { supplier: string; amount: number } | null;
        }>;
      const mapa = new Map<string, CompraDoHistorico[]>();
      for (const r of rows) {
        const q = r.cotacao;
        const lista = mapa.get(chaveDoItem(r)) ?? [];
        lista.push({
          id: r.id, ticket_id: r.ticket_id, data: r.approved_at,
          fornecedor: q?.supplier ?? null, valor: q ? Number(q.amount) : null, setor: r.department,
        });
        mapa.set(chaveDoItem(r), lista);
      }
      return mapa;
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
        .from('compras_solicitacoes')
        .select('*')
        .eq('ticket_id', ticketId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const request = data as unknown as PurchaseRequest;
      const quotes = unwrap(await supabase
        .from('compras_orcamentos')
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
      let query = supabase.from('compras_solicitacoes').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseRequest[];
    },
  });
}

/** Cria a solicitação de compra ligada a um chamado já criado. */
/** Os campos do chamado que `compras_abrir_pedido` grava — os mesmos que `useCreateTicket` mandava. */
export interface ChamadoDoPedido {
  title: string;
  description: string;
  category_id?: string;
  category?: string;
  subcategory?: string;
  priority?: string;
  due_date?: string;
  assigned_to?: string;
}

/**
 * Pede uma compra: chamado, pedido e orçamentos numa transação só (`compras_abrir_pedido`,
 * LEVA P). Eram três chamadas do navegador, e quem não é de Compras levava 42501 na terceira
 * — o chamado e o pedido ficavam gravados, sem orçamento. Agora ou nasce tudo, ou nada.
 *
 * Os anexos sobem ANTES, porque arquivo não passa por SQL. Ainda não há chamado para nomear a
 * pasta, então cada pedido ganha uma própria; a policy do bucket só confere a empresa.
 * ponytail: se a função falhar depois do upload, o anexo fica no bucket sem dono. É só
 * espaço — nada o lê sem o `file_path` gravado; se um dia pesar, limpar o que nenhum
 * orçamento aponta.
 */
export function useAbrirPedidoDeCompra() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ chamado, input }: { chamado: ChamadoDoPedido; input: NewPurchaseInput }) => {
      if (!tenantId) throw new Error('Empresa não identificada.');
      const pasta = crypto.randomUUID();
      const orcamentos = [];
      for (let i = 0; i < input.quotes.length; i++) {
        const q = input.quotes[i];
        const amount = parseAmount(q.amount) ?? NaN;
        if (!q.supplier.trim() || !Number.isFinite(amount) || amount <= 0) continue;
        let filePath: string | null = null;
        if (q.file) {
          try {
            filePath = await uploadPurchaseFile(tenantId, pasta, q.file);
          } catch {
            toast.warning(`Não foi possível anexar o arquivo do orçamento ${i + 1}.`);
          }
        }
        orcamentos.push({
          supplier: q.supplier.trim(),
          // Aponta para o cadastro quando o fornecedor foi escolhido de lá. É
          // por esta coluna que a conta a pagar pega o nome do cadastro em vez
          // do texto digitado (leva I) — nula significa "fora do cadastro".
          supplier_id: q.supplierId ?? null,
          amount,
          link: q.link?.trim() || null,
          notes: q.notes?.trim() || null,
          file_path: filePath,
        });
      }

      const ticketId = unwrap(await supabase.rpc('compras_abrir_pedido', {
        p_chamado: chamado as never,
        p_pedido: {
          product_id: input.product_id ?? null,
          product_name: input.product_name.trim(),
          product_link: input.product_link?.trim() || null,
          department: input.department ?? null,
        } as never,
        p_orcamentos: orcamentos as never,
      }));
      return { id: ticketId as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-purchase-requests'] });
      qc.invalidateQueries({ queryKey: ['fin-purchase-request'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

function useInvalidatePurchase() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fin-purchase-request'] });
    qc.invalidateQueries({ queryKey: ['fin-purchase-requests'] });
    // A área da Diretoria, o registro de decisões, o histórico e o contador do menu.
    qc.invalidateQueries({ queryKey: ['fin-purchase-requests-panel'] });
    qc.invalidateQueries({ queryKey: ['compras-decisoes'] });
    qc.invalidateQueries({ queryKey: ['compras-historico-por-item'] });
    qc.invalidateQueries({ queryKey: ['fin-purchase-counters'] });
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
  expectRows(
    await supabase.from('ticket_comments').insert({
      tenant_id: (ticket as { tenant_id: string }).tenant_id,
      ticket_id: ticketId,
      author_id: userId,
      content,
      is_internal: true,
    } as never).select('id'),
    'o comentário de sistema no chamado',
  );
}


export function useApprovePurchase() {
  const { user } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async (
      { request, quote, fewQuotesReason, overBudgetReason, approvalNotes }:
      { request: PurchaseRequest; quote: PurchaseQuote; fewQuotesReason?: string; overBudgetReason?: string; approvalNotes?: string },
    ) => {
      // A regra dos tres orcamentos vive no banco (trigger
      // `fin_compra_exige_tres_orcamentos`): com menos de tres e sem motivo
      // escrito, o UPDATE e recusado. O motivo viaja junto para a tela nao
      // precisar adivinhar a politica — e para a recusa virar uma frase, e nao
      // um erro cru do Postgres.
      //
      // Vai sempre, mesmo vazio: mandar so quando ha texto deixava o motivo da
      // aprovacao ANTERIOR no lugar, e ele satisfazia a regra sozinho — a
      // segunda aprovacao passava sem ninguem escrever nada. (O banco tambem
      // apaga; os dois lados concordam.)
      expectRows(
        await supabase
          .from('compras_solicitacoes')
          .update({
            status: 'approved',
            approved_quote_id: quote.id,
            approved_by: user?.id ?? null,
            approved_at: new Date().toISOString(),
            estimated_amount: quote.amount,
            rejection_reason: null,
            few_quotes_reason: fewQuotesReason?.trim() || null,
            // Mesma razão de `few_quotes_reason` ir sempre, inclusive vazio: o
            // motivo da aprovação ANTERIOR satisfaria a regra sozinho, e a
            // segunda aprovação passaria sem ninguém escrever nada. O banco
            // também apaga; os dois lados concordam.
            over_budget_reason: overBudgetReason?.trim() || null,
            // Observação opcional de quem aprova: vai para o registro de decisões (20261130010000).
            approval_notes: approvalNotes?.trim() || null,
          } as never)
          .eq('id', request.id)
          .select('id'),
        'a aprovação da compra',
      );

      // O chamado segue a compra no banco ("Aprovada · aguardando compra"), e o aviso da decisão
      // também é de lá, para quem pediu e para Compras (`compras_chamado_segue_a_compra` e
      // `compras_registra_decisao`, 20261221010000). Antes era uma segunda escrita daqui, que podia
      // não acompanhar — e o aviso dependia de o status mudar.
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
      expectRows(
        await supabase
          .from('compras_solicitacoes')
          .update({
            status: 'rejected',
            rejection_reason: reason.trim(),
            rejected_by: user?.id ?? null,
            rejected_at: new Date().toISOString(),
          } as never)
          .eq('id', request.id)
          .select('id'),
        'a reprovação da compra',
      );

      // O chamado vira "Reprovado" com o motivo, e quem pediu é avisado: o banco (20261221010000).
      await addSystemComment(request.ticket_id, user?.id, `Compra reprovada. Motivo: ${reason.trim()}`);
    },
    onSuccess: () => { invalidate(); toast.success('Compra reprovada'); },
    onError: (e: Error) => toast.error(`Erro ao reprovar: ${e.message}`),
  });
}

// ------------------------------------------------------------ Ajuste e registro de decisões
// Decisões do dono, 2026-10-03 (20261130010000): quem decide pode "solicitar ajustes" com o porquê; a
// compra volta para quem pediu, que corrige só os orçamentos e reenvia. Toda decisão fica em
// `compras_decisoes` (o banco grava sozinho, pela mudança de status) e o banco avisa os dois lados.

export function useRequestAdjustment() {
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, reason }: { request: PurchaseRequest; reason: string }) => {
      expectRows(await supabase.from('compras_solicitacoes')
        .update({ status: 'adjustment_requested', adjustment_reason: reason.trim() })
        .eq('id', request.id).select('id'), 'o pedido de ajuste');
    },
    onSuccess: () => { invalidate(); toast.success('Ajuste solicitado. Quem pediu a compra foi avisado.'); },
    onError: (e) => toast.error(`Erro ao pedir ajuste: ${mensagemDeErro(e)}`),
  });
}

export interface OrcamentoEditado { id?: string; supplier: string; amount: number; link?: string | null; notes?: string | null; file?: File | null }

/** Quem pediu corrige os orçamentos e reenvia para aprovação. */
export function useResubmitPurchase() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, quotes, removidos, response }: {
      request: PurchaseRequest; quotes: OrcamentoEditado[]; removidos: string[]; response: string;
    }) => {
      if (!tenantId) throw new Error('Sem empresa');
      for (const id of removidos) {
        expectRows(await supabase.from('compras_orcamentos').delete().eq('id', id).select('id'), 'tirar o orçamento');
      }
      let posicao = 0;
      for (const q of quotes) {
        posicao += 1;
        const file_path = q.file ? await uploadPurchaseFile(tenantId, request.ticket_id, q.file) : undefined;
        const campos = {
          supplier: q.supplier.trim(), amount: q.amount, link: q.link || null, notes: q.notes || null, position: posicao,
          ...(file_path ? { file_path } : {}),
        };
        expectRows(q.id
          ? await supabase.from('compras_orcamentos').update(campos).eq('id', q.id).select('id')
          : await supabase.from('compras_orcamentos')
              .insert({ ...campos, tenant_id: tenantId, request_id: request.id }).select('id'),
          'gravar o orçamento');
      }
      expectRows(await supabase.from('compras_solicitacoes')
        .update({ status: 'pending_approval', adjustment_response: response.trim() || null })
        .eq('id', request.id).select('id'), 'reenviar a compra');
    },
    onSuccess: () => { invalidate(); toast.success('Compra reenviada para aprovação.'); },
    onError: (e) => toast.error(`Erro ao reenviar: ${mensagemDeErro(e)}`),
  });
}

export interface DecisaoDaCompra {
  id: string;
  decisao: 'aprovada' | 'recusada' | 'ajuste' | 'reenviada' | 'concluida';
  observacao: string | null;
  created_at: string;
  quem: { full_name: string | null; email: string } | null;
}

export function useDecisoesDaCompra(requestId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-decisoes', tenantId, requestId],
    enabled: !!tenantId && !!requestId,
    queryFn: async (): Promise<DecisaoDaCompra[]> =>
      // `decisao` é text no banco com CHECK dos 5 valores — o tipo gerado não sabe disso.
      (unwrap(await supabase.from('compras_decisoes')
        .select('id, decisao, observacao, created_at, quem:user_id(full_name, email)')
        .eq('request_id', requestId!)
        .order('created_at', { ascending: true })) ?? []) as DecisaoDaCompra[],
  });
}

export function useCompletePurchase() {
  const { user, tenantId } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async (
      { request, report, file, dueDate }:
      { request: PurchaseRequest; report: string; file?: File | null; dueDate?: string | null },
    ) => {
      let filePath: string | null = null;
      if (file && tenantId) filePath = await uploadPurchaseFile(tenantId, request.ticket_id, file);

      expectRows(
        await supabase
          .from('compras_solicitacoes')
          .update({
            status: 'completed',
            purchase_report: report.trim(),
            purchase_file_path: filePath,
            // O prazo que quem executou informou. Nulo = à vista, e o trigger
            // usa o dia de hoje no Brasil. Antes da leva I não havia onde
            // informar, e toda conta a prazo nascia vencida no dia seguinte.
            payment_due_date: dueDate || null,
            executed_by: user?.id ?? null,
            executed_at: new Date().toISOString(),
          } as never)
          .eq('id', request.id)
          .select('id'),
        'a conclusão da compra',
      );

      // O chamado vira Resolvido com o laudo, e quem pediu recebe "Compra realizada" (com e-mail):
      // o banco, quando a compra vira `completed` (20261221010000).
      await addSystemComment(request.ticket_id, user?.id, `Laudo de compra registrado: ${report.trim()}`);

      // A conta a pagar nasce por trigger no banco (D8) — mas **nem sempre**:
      // compra sem valor nenhum nao gera conta, de proposito. Afirmar que ela
      // entrou no Financeiro sem olhar fazia o oposto do que a frase pretende:
      // ninguem lancava a despesa a mao porque o sistema disse que ja estava la.
      //
      // Sem filtro de status, e sem mandar lancar nada: lista vazia aqui pode
      // ser "nao existe conta" ou "a RLS do Financeiro nao me deixa ver" — quem
      // executa a compra nao precisa ter o modulo. Mandar lancar a despesa na
      // duvida e como se pagaria duas vezes a mesma compra.
      const contas = unwrap(
        await supabase
          .from('fin_entries')
          .select('id')
          .eq('purchase_request_id', request.id),
      );
      return { contaVista: contas.length > 0 };
    },
    onSuccess: ({ contaVista }) => {
      invalidate();
      toast.success(
        contaVista
          ? 'Compra concluída. O chamado foi encerrado e a conta a pagar entrou no Financeiro.'
          : 'Compra concluída e chamado encerrado. Confira a conta a pagar no Financeiro antes de lançar qualquer coisa à mão.',
      );
    },
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
      // Regra 2: a policy exige gestor com o Financeiro. Sem `.select()` a
      // recusa vinha como 200 com zero linhas e a tela dava "Teto atualizado"
      // — esconder o botao nao prova a gravacao, so esconde a recusa.
      expectRows(
        await supabase
          .from('fin_budget_settings')
          .upsert({ tenant_id: tenantId, mode } as never, { onConflict: 'tenant_id' })
          .select('tenant_id'),
        'a configuração de teto',
      );
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
      expectRows(
        await supabase
          .from('fin_department_budgets')
          .upsert({ tenant_id: tenantId, department, monthly_limit } as never, { onConflict: 'tenant_id,department' })
          .select('id'),
        'o teto do setor',
      );
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
      // O primeiro dia do mês LOCAL, e não `new Date().toISOString()` cortado:
      // a conta tem de ser a mesma do trigger `fin_compra_respeita_teto`, que
      // usa o mês de America/Sao_Paulo. Regra 4 das cinco.
      const start = `${todayISO().slice(0, 7)}-01T00:00:00`;
      const { data, error } = await supabase
        .from('compras_solicitacoes')
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
  ticket?: { id: string; ticket_number: number; title: string; status: string; description: string | null } | null;
}

export function usePurchaseRequestsPanel(filters: PurchaseRequestFilters = {}) {
  const { tenantId } = useAuth();
  const { status, department, from, to } = filters;
  return useQuery({
    queryKey: ['fin-purchase-requests-panel', tenantId, status ?? 'all', department ?? 'all', from ?? '', to ?? ''],
    enabled: !!tenantId,
    queryFn: async (): Promise<PurchaseRequestRow[]> => {
      let query = supabase
        .from('compras_solicitacoes')
        .select('*, ticket:tickets(id, ticket_number, title, status, description)')
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
        supabase.from('compras_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('compras_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
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
  /** Produtos distintos comprados no ano — o número do cartão, sem o corte. */
  totalProdutos: number;
  /** Fornecedores distintos usados no ano — idem. */
  totalFornecedores: number;
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
        .from('compras_solicitacoes')
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
          .from('compras_orcamentos')
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
        // Quantos produtos distintos foram comprados, ANTES do corte da lista.
        // O cartão "Produtos comprados no ano" mostrava `topProducts.length`, que
        // é o tamanho do top 8 — então travava em 8 com 30 produtos comprados, e
        // parava de crescer sem nunca dizer que estava cortado.
        totalProdutos: products.size,
        totalFornecedores: suppliers.size,
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

/**
 * Quanto quem aprova está levando (dono, 2026-10-09): os pedidos e as decisões dos últimos 180 dias, para
 * `temposDeDecisao` medir a média e quanto cada pendente já espera. O prazo de Compras fica parado
 * enquanto a compra aguarda a decisão — este é o único lugar onde esse tempo aparece.
 */
export function useTemposDeDecisao() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-tempos-de-decisao', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const desde = new Date(Date.now() - 180 * 86_400_000).toISOString();
      const [pedidos, decisoes] = await Promise.all([
        supabase.from('compras_solicitacoes').select('id, created_at').gte('created_at', desde),
        supabase.from('compras_decisoes').select('request_id, decisao, created_at').gte('created_at', desde),
      ]);
      return temposDeDecisao(unwrap(pedidos) ?? [], unwrap(decisoes) ?? []);
    },
  });
}
