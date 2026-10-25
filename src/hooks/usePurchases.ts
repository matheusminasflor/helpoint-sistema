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
import { formatQuantidade, rotuloDoPagamento, type FormaPagamento, type FilialDaCompra } from '@/types/purchases';
import type { CompraFeita } from '@/lib/gasto-de-compras';
import { formatDateBR } from '@/types/financeiro';

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

/** Suprimento (2026-10-15): o item controla estoque, na unidade, com o mínimo que avisa Compras. */
type Suprimento = { suprimento?: boolean; unidade?: string; estoque_minimo?: number };

export function useCreatePurchaseProduct() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; category?: string } & Suprimento) => {
      if (!tenantId) throw new Error('Empresa não identificada. Recarregue a página e tente novamente.');
      if (!input.name.trim()) throw new Error('Informe o nome do produto.');

      const { data, error } = await supabase
        .from('compras_produtos')
        .insert({
          tenant_id: tenantId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          category: input.category?.trim() || null,
          suprimento: input.suprimento ?? false, unidade: input.unidade || 'un', estoque_minimo: input.estoque_minimo ?? 0,
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
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string | null; category?: string | null; is_active?: boolean } & Partial<Suprimento>) => {
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
  /** O TOTAL da última compra (quantidade × unitário + frete). */
  amount: number | null;
  /** O preço da UNIDADE na última compra (defeito 7, 2026-10-24: o Catálogo mostrava o total como "Último preço"). */
  unitario: number | null;
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
        .select('id, product_id, product_name, approved_quote_id, approved_at, status, quantidade, quantidade_aprovada')
        .in('status', ['approved', 'completed'])
        .not('approved_quote_id', 'is', null)
        .order('approved_at', { ascending: false });
      if (error) throw error;

      const rows = (requests || []) as unknown as Array<{
        id: string; product_id: string | null; product_name: string;
        approved_quote_id: string | null; approved_at: string | null;
        quantidade: number | null; quantidade_aprovada: number | null;
      }>;
      if (!rows.length) return new Map();

      const quotes = unwrap(await supabase
        .from('compras_orcamentos')
        .select('id, supplier, amount, valor_unitario')
        .in('id', rows.map(r => r.approved_quote_id!).filter(Boolean)));

      const quoteMap = new Map(
        ((quotes || []) as unknown as Array<{ id: string; supplier: string; amount: number; valor_unitario: number | null }>)
          .map(q => [q.id, q]),
      );
      // Orçamento de antes de 2026-10-09 não tem o unitário: o total dividido pela quantidade (com o frete dentro).
      const unitarioDe = (q: { amount: number; valor_unitario: number | null }, r: { quantidade: number | null; quantidade_aprovada: number | null }) => {
        if (q.valor_unitario != null) return Number(q.valor_unitario);
        const qtd = Number(r.quantidade_aprovada ?? r.quantidade ?? 1) || 1;
        return Math.round((Number(q.amount) / qtd) * 100) / 100;
      };

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
          unitario: quote ? unitarioDe(quote, r) : null,
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
          // Unitário, frete e prazo (2026-10-09); o total é o banco que calcula (`compras_orcamento_total`).
          valor_unitario: amount,
          frete: q.fretePago ? (parseAmount(q.frete ?? '') ?? 0) : 0,
          prazo_entrega_dias: q.prazoDias?.trim() ? Number(q.prazoDias) : null,
          recomendado: input.recomendado === i,
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
          quantidade: input.quantidade,
          caixinha_id: input.caixinha_id ?? null,
          motivo_recomendacao: input.recomendado != null ? input.motivoRecomendacao?.trim() || null : null,
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
      { request, quote, quantidade, formaPagamento, parcelas, formaPagamento2, parcelas2, filial, fewQuotesReason, overBudgetReason, approvalNotes }:
      {
        request: PurchaseRequest; quote: PurchaseQuote; quantidade: number; formaPagamento: FormaPagamento | null; parcelas?: number | null; filial: FilialDaCompra | null;
        /** A 2ª forma, obrigatória (2026-10-15): o comprador usa se a 1ª não der certo. */
        formaPagamento2?: FormaPagamento | null; parcelas2?: number | null;
        fewQuotesReason?: string; overBudgetReason?: string; approvalNotes?: string;
      },
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
            // Quantas quem aprova libera (2026-10-09). O total aprovado o banco calcula
            // (`compras_calcula_total_aprovado`): unitário × quantidade aprovada + frete.
            quantidade_aprovada: quantidade,
            // Obrigatórias em toda aprovação (2026-10-14); o banco recusa sem elas (20270102010000).
            forma_pagamento: formaPagamento,
            parcelas: formaPagamento === 'cartao' ? parcelas ?? 1 : null,
            forma_pagamento_2: formaPagamento2 ?? null,
            parcelas_2: formaPagamento2 === 'cartao' ? parcelas2 ?? 1 : null,
            filial,
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
        `Compra aprovada. Orçamento escolhido: ${quote.supplier}, ${formatQuantidade(quantidade)} de ${formatQuantidade(request.quantidade)} unidade(s) pedida(s).${formaPagamento && filial ? ` Pagamento: ${rotuloDoPagamento(formaPagamento, parcelas)}${formaPagamento2 ? ` (2ª opção: ${rotuloDoPagamento(formaPagamento2, parcelas2)})` : ''} · Filial: ${filial}.` : request.caixinha ? ' Sai do Caixinha.' : ''}`,
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

/** `valor_unitario` é o preço por unidade; o total (`amount`) o banco recalcula com a quantidade e o frete. */
export interface OrcamentoEditado {
  id?: string; supplier: string; valor_unitario: number; frete: number; prazo_entrega_dias: number | null;
  link?: string | null; notes?: string | null; file?: File | null;
}

/** Quem pediu corrige a quantidade e os orçamentos e reenvia para aprovação. */
export function useResubmitPurchase() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, quantidade, quotes, removidos, response }: {
      request: PurchaseRequest; quantidade: number; quotes: OrcamentoEditado[]; removidos: string[]; response: string;
    }) => {
      if (!tenantId) throw new Error('Sem empresa');
      if (quantidade !== Number(request.quantidade)) {
        expectRows(await supabase.from('compras_solicitacoes').update({ quantidade } as never)
          .eq('id', request.id).select('id'), 'mudar a quantidade');
      }
      for (const id of removidos) {
        expectRows(await supabase.from('compras_orcamentos').delete().eq('id', id).select('id'), 'tirar o orçamento');
      }
      let posicao = 0;
      for (const q of quotes) {
        posicao += 1;
        const file_path = q.file ? await uploadPurchaseFile(tenantId, request.ticket_id, q.file) : undefined;
        const campos = {
          supplier: q.supplier.trim(), valor_unitario: q.valor_unitario, frete: q.frete, prazo_entrega_dias: q.prazo_entrega_dias,
          // `amount` vai só porque a coluna é obrigatória no insert; o banco o troca pelo total.
          amount: q.valor_unitario, link: q.link || null, notes: q.notes || null, position: posicao,
          ...(file_path ? { file_path } : {}),
        };
        expectRows(q.id
          ? await supabase.from('compras_orcamentos').update(campos as never).eq('id', q.id).select('id')
          : await supabase.from('compras_orcamentos')
              .insert({ ...campos, tenant_id: tenantId, request_id: request.id } as never).select('id'),
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
      { request, report, file, semNotaMotivo }:
      {
        request: PurchaseRequest; report: string; file?: File | null;
        /** Não veio nota (dono, 2026-10-15): o arquivo é o recibo, e aqui o porquê. */
        semNotaMotivo?: string | null;
      },
    ) => {
      let filePath: string | null = null;
      if (file && tenantId) filePath = await uploadPurchaseFile(tenantId, request.ticket_id, file);

      // Paga antes (20270121010000): a nota chega e encerra; a conta já nasceu no pagamento. A compra aprovada antes do
      // pagamento novo ainda gera a conta aqui, no banco.
      expectRows(
        await supabase
          .from('compras_solicitacoes')
          .update({
            status: 'completed',
            purchase_report: report.trim(),
            purchase_file_path: filePath,
            sem_nota_motivo: semNotaMotivo?.trim() || null,
            executed_by: user?.id ?? null,
            executed_at: new Date().toISOString(),
          } as never)
          .eq('id', request.id)
          .select('id'),
        'o registro da compra',
      );

      // O chamado vira Resolvido com o laudo, e quem pediu recebe "Compra realizada" (com e-mail):
      // o banco, quando a compra vira `completed` (20261221010000).
      await addSystemComment(request.ticket_id, user?.id,
        `Compra registrada: ${report.trim()}${semNotaMotivo?.trim() ? `\nSem nota fiscal (recibo anexado): ${semNotaMotivo.trim()}` : ''}`);
    },
    onSuccess: () => { invalidate(); toast.success('Compra registrada e pedido encerrado. Quem pediu foi avisado.'); },
    onError: (e: Error) => toast.error(`Erro ao registrar: ${e.message}`),
  });
}

export interface CompraParaPagarJunto {
  id: string;
  ticket_id: string;
  ticket_number: number;
  product_name: string;
  valor: number | null;
  forma_pagamento: FormaPagamento | null;
  fornecedor: string | null;
}

/**
 * As outras compras aprovadas, fora da Caixinha, que podem entrar no mesmo pagamento desta — qualquer uma que o
 * comprador escolher (dono, 2026-10-15: "juntar as compras que eu quiser"), com o fornecedor à vista para conferir.
 */
export function useComprasParaPagarJunto(request: PurchaseRequest | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-pagar-junto', tenantId, request?.id],
    enabled: !!tenantId && !!request && request.status === 'approved' && !request.caixinha && !request.pago_junto_com,
    queryFn: async (): Promise<CompraParaPagarJunto[]> => {
      const outras = (unwrap(await supabase.from('compras_solicitacoes')
        .select('id, ticket_id, product_name, approved_quote_id, estimated_amount, forma_pagamento, tickets!inner(ticket_number)')
        .eq('status', 'approved').eq('caixinha' as never, false as never).neq('id', request!.id)
        .is('pago_junto_com' as never, null as never)
        .is('pagamento_em' as never, null as never)) ?? []) as unknown as Array<{
          id: string; ticket_id: string; product_name: string; approved_quote_id: string | null;
          estimated_amount: number | null; forma_pagamento: FormaPagamento | null; tickets: { ticket_number: number };
        }>;
      const ids = outras.map((o) => o.approved_quote_id).filter((x): x is string => !!x);
      const quotes = ids.length
        ? (unwrap(await supabase.from('compras_orcamentos').select('id, supplier').in('id', ids)) ?? []) as Array<{ id: string; supplier: string | null }>
        : [];
      const fornecedor = new Map(quotes.map((q) => [q.id, q.supplier]));
      return outras.map((o) => ({
        id: o.id, ticket_id: o.ticket_id, ticket_number: o.tickets.ticket_number, product_name: o.product_name,
        valor: o.estimated_amount != null ? Number(o.estimated_amount) : null,
        forma_pagamento: o.forma_pagamento,
        fornecedor: o.approved_quote_id ? fornecedor.get(o.approved_quote_id) ?? null : null,
      })).sort((a, b) => a.ticket_number - b.ticket_number);
    },
  });
}

/**
 * Pagar primeiro, nota depois (dono, 2026-10-15; 20270121010000): "Comprei no cartão", "Paguei no Pix", "Enviar o
 * boleto ao Financeiro" ou "Paguei pela Caixinha". A conta a pagar nasce aqui, sem nota. As compras escolhidas para
 * o mesmo pagamento vão primeiro (apontam para esta e ficam pagas); o pagamento desta é que gera a conta, com a soma.
 */
export function useRegistrarPagamento() {
  const { user, tenantId } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, file, vencimento, juntas }: {
      request: PurchaseRequest; file?: File | null; vencimento?: string | null; juntas: CompraParaPagarJunto[];
    }) => {
      if (!tenantId) throw new Error('Sem empresa.');
      const path = file ? await uploadPurchaseFile(tenantId, request.ticket_id, file) : null;
      const boleto = request.forma_pagamento === 'boleto';
      const agora = new Date().toISOString();
      const comoPagou = request.caixinha || request.forma_pagamento === 'caixinha' ? 'pela Caixinha'
        : request.forma_pagamento ? rotuloDoPagamento(request.forma_pagamento, request.parcelas) : 'pagamento';
      for (const j of juntas) {
        expectRows(
          await supabase.from('compras_solicitacoes').update({ pago_junto_com: request.id } as never).eq('id', j.id).select('id'),
          `a compra #${j.ticket_number} no mesmo pagamento`,
        );
        expectRows(
          await supabase.from('compras_solicitacoes')
            .update({ pagamento_em: agora, pagamento_path: path, payment_due_date: boleto ? vencimento : null } as never)
            .eq('id', j.id).select('id'),
          `o pagamento da compra #${j.ticket_number}`,
        );
        await addSystemComment(j.ticket_id, user?.id,
          `Paga junto com a compra "${request.product_name}" (${comoPagou}). Quando a nota chegar, anexe e registre para encerrar.`);
      }
      expectRows(
        await supabase.from('compras_solicitacoes')
          .update({ pagamento_em: agora, pagamento_path: path, payment_due_date: boleto ? vencimento : null } as never)
          .eq('id', request.id).select('id'),
        'o pagamento da compra',
      );
      const junto = juntas.length ? `, junto com ${juntas.map((j) => `#${j.ticket_number}`).join(', ')} (uma conta só)` : '';
      await addSystemComment(request.ticket_id, user?.id, boleto
        ? `Boleto enviado ao Financeiro, vence em ${formatDateBR(vencimento ?? null)}${junto}. Quando for pago, você é avisado para anexar a nota.`
        : `Compra paga (${comoPagou})${junto}. Quando a nota chegar, anexe e registre para encerrar.`);
    },
    onSuccess: (_d, { request }) => {
      invalidate();
      toast.success(request.forma_pagamento === 'boleto'
        ? 'Boleto enviado ao Financeiro. Você é avisado quando for pago.'
        : 'Pagamento registrado. Quando a nota chegar, registre para encerrar.');
    },
    onError: (e: Error) => toast.error(`Não registrou: ${e.message}`),
  });
}

/** O comprador troca para a 2ª forma aprovada (e volta), com o motivo; quem aprovou é avisado (no banco). */
export function useTrocarFormaDePagamento() {
  const { user } = useAuth();
  const invalidate = useInvalidatePurchase();
  return useMutation({
    mutationFn: async ({ request, motivo }: { request: PurchaseRequest; motivo: string }) => {
      expectRows(
        await supabase.from('compras_solicitacoes').update({
          forma_pagamento: request.forma_pagamento_2,
          parcelas: request.parcelas_2 ?? null,
          forma_pagamento_2: request.forma_pagamento,
          parcelas_2: request.parcelas ?? null,
          troca_motivo: motivo.trim(),
        } as never).eq('id', request.id).select('id'),
        'a troca da forma de pagamento',
      );
      await addSystemComment(request.ticket_id, user?.id,
        `Forma de pagamento trocada: ${rotuloDoPagamento(request.forma_pagamento!, request.parcelas)} → ${rotuloDoPagamento(request.forma_pagamento_2!, request.parcelas_2)}. Motivo: ${motivo.trim()}`);
    },
    onSuccess: () => { invalidate(); toast.success('Forma de pagamento trocada. Quem aprovou foi avisado.'); },
    onError: (e: Error) => toast.error(`Não trocou: ${e.message}`),
  });
}

// ------------------------------------------------------------- Reajuste depois de aprovada

/** Reajuste do valor unitário e do frete depois de aprovada (dono, 2026-10-19; 20270128060000). */
export interface ReajusteDaCompra {
  id: string;
  valor_unitario_de: number | null; valor_unitario_para: number;
  frete_de: number | null; frete_para: number;
  /** Só para menos (dono, 2026-10-21; 20270129120000). Nulo nos reajustes de antes. */
  quantidade_de: number | null; quantidade_para: number | null;
  total_de: number; total_para: number;
  motivo: string;
  status: 'aplicado' | 'aguardando' | 'recusado';
  pedido_em: string;
  decisao_obs: string | null;
  quem: { full_name: string | null } | null;
}

export function useReajustesDaCompra(requestId: string | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-reajustes', tenantId, requestId],
    enabled: !!tenantId && !!requestId,
    queryFn: async (): Promise<ReajusteDaCompra[]> =>
      ((unwrap(await supabase.from('compras_reajustes' as never)
        .select('id, valor_unitario_de, valor_unitario_para, frete_de, frete_para, quantidade_de, quantidade_para, total_de, total_para, motivo, status, pedido_em, decisao_obs, quem:profiles!compras_reajustes_pedido_por_fkey(full_name)')
        .eq('request_id', requestId!).order('pedido_em')) ?? []) as unknown as ReajusteDaCompra[])
        .map((r) => ({ ...r, total_de: Number(r.total_de), total_para: Number(r.total_para),
          valor_unitario_para: Number(r.valor_unitario_para), frete_para: Number(r.frete_para) })),
  });
}

export function useReajustarCompra() {
  const invalidate = useInvalidatePurchase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; valorUnitario: number; frete: number; quantidade: number; motivo: string }) =>
      unwrap(await supabase.rpc('compras_reajustar' as never, {
        p_compra: input.requestId, p_valor_unitario: input.valorUnitario, p_frete: input.frete, p_motivo: input.motivo.trim(),
        p_quantidade: input.quantidade,
      } as never)) as unknown as 'aplicado' | 'aguardando',
    onSuccess: (status) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['compras-reajustes'] });
      toast.success(status === 'aplicado'
        ? 'Compra reajustada. Quem aprova foi avisado, e a conta em aberto já foi corrigida.'
        : 'Reajuste de mais de 10%: foi para o aprovador decidir. Até lá vale o valor aprovado.');
    },
    onError: (e: Error) => toast.error(`Não reajustou: ${mensagemDeErro(e)}`),
  });
}

export function useDecidirReajuste() {
  const invalidate = useInvalidatePurchase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reajusteId: string; aprova: boolean; obs: string }) =>
      unwrap(await supabase.rpc('compras_decidir_reajuste' as never, {
        p_reajuste: input.reajusteId, p_aprova: input.aprova, p_obs: input.obs.trim() || null,
      } as never)),
    onSuccess: (_d, v) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['compras-reajustes'] });
      toast.success(v.aprova ? 'Reajuste aprovado.' : 'Reajuste recusado.');
    },
    onError: (e: Error) => toast.error(mensagemDeErro(e)),
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
  /** O fornecedor do orçamento que quem pediu recomenda (2026-10-09). */
  recomendado?: { supplier: string } | null;
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
        .select('*, ticket:tickets(id, ticket_number, title, status, description), recomendado:compras_orcamentos!compras_solicitacoes_orcamento_recomendado_id_fkey(supplier)')
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
  pendingApproval: number;
}

/** Indicadores de compras do ano corrente (mês corrente para o gasto x teto). */
/**
 * As compras FEITAS (registradas como compradas) desde o começo do ano passado — a base do gasto por período
 * e mês a mês dos Indicadores de Compras (dono, 2026-10-13). O valor é o total aprovado (`estimated_amount`,
 * o mesmo que vira conta a pagar).
 */
export function useComprasFeitas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['compras-feitas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CompraFeita[]> => {
      const desde = new Date(new Date().getFullYear() - 1, 0, 1).toISOString();
      const rows = (unwrap(await supabase.from('compras_solicitacoes')
        .select('executed_at, department, estimated_amount')
        .eq('status', 'completed')
        .gte('executed_at', desde)) ?? []) as unknown as { executed_at: string | null; department: string | null; estimated_amount: number | null }[];
      return rows.filter((r) => r.executed_at).map((r) => ({ quando: r.executed_at!, setor: r.department, valor: Number(r.estimated_amount ?? 0) }));
    },
  });
}

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
        // O tempo de decisão saiu daqui (defeito 8, 2026-10-24): é o de `useTemposDeDecisao`, o mesmo de Aprovar compras.
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
