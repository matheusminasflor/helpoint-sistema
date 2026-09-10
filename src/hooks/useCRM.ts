import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';
import type { Database, Json } from '@/integrations/supabase/types';
import type { CustomValues } from '@/lib/custom-fields';

/**
 * Hooks do CRM do Comercial (Plano CRM-1). O banco já está pronto e provado
 * (supabase/migrations/20260910010000_crm_comercial_base.sql): aqui é só
 * leitura/escrita seguindo as cinco regras de escrita do CLAUDE.md — erro
 * nunca engolido (`unwrap`), escrita provada (`expectRows` + `.select('id')`),
 * `queryKey` com `tenantId`.
 *
 * Mudar `stage_id` de um negócio já dispara, no banco, a linha do tempo e
 * `won_at`/`lost_at` (`crm_deals_on_stage_change`) — o front só faz o update.
 */

export type CRMStage = Database['public']['Tables']['crm_pipeline_stages']['Row'];
export type CRMContact = Database['public']['Tables']['crm_contacts']['Row'];
export type CRMDeal = Database['public']['Tables']['crm_deals']['Row'];
export type CRMDealActivity = Database['public']['Tables']['crm_deal_activities']['Row'];
export type CRMProduct = Database['public']['Tables']['crm_products']['Row'];
export type CRMOrder = Database['public']['Tables']['crm_orders']['Row'];
export type CRMOrderItem = Database['public']['Tables']['crm_order_items']['Row'];
export type CRMTask = Database['public']['Tables']['tasks']['Row'];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─────────────────────────────────────────────────────────────────────────
// Funis e etapas (E1: vários funis por empresa; ordem, cor e tipo editáveis)
// ─────────────────────────────────────────────────────────────────────────

export type CRMPipeline = Database['public']['Tables']['crm_pipelines']['Row'];
export type StageKind = 'open' | 'won' | 'lost';

export function useCRMPipelines() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-pipelines', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMPipeline[]> =>
      unwrap(
        await supabase.from('crm_pipelines').select('*').eq('tenant_id', tenantId!).order('position').order('created_at'),
      ),
  });
}

/** Etapas de todos os funis da empresa, ou só de um, em ordem. */
export function useCRMStages(pipelineId?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-stages', tenantId, pipelineId ?? 'all'],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMStage[]> => {
      let query = supabase.from('crm_pipeline_stages').select('*').eq('tenant_id', tenantId!).order('position');
      if (pipelineId) query = query.eq('pipeline_id', pipelineId);
      return unwrap(await query);
    },
  });
}

export interface PipelineInput {
  id?: string;
  name: string;
}

/** Cria ou renomeia um funil. O primeiro de cada empresa nasce pelo banco (`seed_crm_stages`). */
export function useSavePipeline() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PipelineInput): Promise<string> => {
      if (input.id) {
        expectRows(await supabase.from('crm_pipelines').update({ name: input.name }).eq('id', input.id).select('id'), 'o funil');
        return input.id;
      }
      const { count } = unwrap(
        await supabase.from('crm_pipelines').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
      ) as unknown as { count: number | null };
      const rows = expectRows(
        await supabase
          .from('crm_pipelines')
          .insert({ tenant_id: tenantId!, name: input.name, position: (count ?? 0) + 1 })
          .select('id'),
        'o funil',
      );
      return rows[0].id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipelines', tenantId] });
      toast.success('Funil salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export interface StageInput {
  id?: string;
  pipeline_id: string;
  name: string;
  color: string;
  kind: StageKind;
  position: number;
}

/**
 * Salva a lista inteira de etapas de um funil: nome, cor, tipo e ordem.
 * Existentes viram `update`, novas viram `insert`, cada um provado com
 * `.select('id')`. Quem vira "em andamento" grava primeiro: o banco só aceita
 * um "ganho" e um "perdido" por funil, então o papel sai de uma etapa antes
 * de entrar em outra.
 */
export function useSaveStages() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stages: StageInput[]) => {
      const ordered = [...stages].sort((a, b) => (a.kind === 'open' ? 0 : 1) - (b.kind === 'open' ? 0 : 1));
      for (const stage of ordered) {
        const row = { name: stage.name, color: stage.color, kind: stage.kind, position: stage.position };
        if (stage.id) {
          expectRows(await supabase.from('crm_pipeline_stages').update(row).eq('id', stage.id).select('id'), 'a etapa');
        } else {
          expectRows(
            await supabase
              .from('crm_pipeline_stages')
              .insert({ ...row, tenant_id: tenantId!, pipeline_id: stage.pipeline_id })
              .select('id'),
            'a etapa',
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-stages', tenantId] });
      toast.success('Etapas salvas.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Apaga uma etapa; se ela tem negócios, `moveTo` diz para onde eles vão (regra no banco: `crm_delete_stage`). */
export function useDeleteStage() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, moveTo }: { id: string; moveTo?: string }) =>
      unwrap(await supabase.rpc('crm_delete_stage', { p_stage: id, p_move_to: moveTo })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-stages', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-deals', tenantId] });
      toast.success('Etapa apagada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/**
 * Negócios que caíram numa etapa de fechamento (ganho/perdido) nos últimos
 * `days` dias — para os contadores recolhidos das colunas "Ganho"/"Perdido"
 * no Funil. `useCRMDeals` não serve aqui: ela só devolve negócio aberto.
 */
export function useClosedDeals(stageId: string | undefined, days = 30) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-closed-deals', tenantId, stageId, days],
    enabled: !!tenantId && !!stageId,
    queryFn: async (): Promise<CRMDealWithRelations[]> => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return unwrap(
        await supabase
          .from('crm_deals')
          .select('*, contact:crm_contacts(id, name, company), owner:profiles!crm_deals_owner_id_fkey(id, full_name)')
          .eq('stage_id', stageId!)
          .gte('updated_at', cutoff.toISOString())
          .order('updated_at', { ascending: false }),
      ) as unknown as CRMDealWithRelations[];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Contatos
// ─────────────────────────────────────────────────────────────────────────

export function useCRMContacts(search?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-contacts', tenantId, search ?? ''],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMContact[]> => {
      let query = supabase.from('crm_contacts').select('*').eq('tenant_id', tenantId!);
      const term = search?.trim();
      if (term) {
        const like = `%${term}%`;
        query = query.or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`);
      }
      return unwrap(await query.order('name'));
    },
  });
}

export function useContact(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-contact', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<CRMContact> =>
      unwrap(await supabase.from('crm_contacts').select('*').eq('id', id!).single()),
  });
}

export interface CRMContactDeal {
  id: string;
  title: string;
  value: number;
  created_at: string;
  stage: { name: string; kind: string } | null;
}

/** Negócios de um contato — para a lista dentro do diálogo de edição do contato. */
export function useContactDeals(contactId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-contact-deals', tenantId, contactId],
    enabled: !!tenantId && !!contactId,
    queryFn: async (): Promise<CRMContactDeal[]> =>
      unwrap(
        await supabase
          .from('crm_deals')
          .select('id, title, value, created_at, stage:crm_pipeline_stages(name, kind)')
          .eq('contact_id', contactId!)
          .order('created_at', { ascending: false }),
      ) as unknown as CRMContactDeal[],
  });
}

export interface ContactInput {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  document?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  source?: string;
  owner_id?: string | null;
  /** Campos personalizados `{chave: valor}` (E2); ausente = não mexe. */
  custom?: CustomValues;
}

export function useSaveContact() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      const payload = {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        document: input.document ?? null,
        company: input.company ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        notes: input.notes ?? null,
        source: input.source ?? 'manual',
        owner_id: input.owner_id ?? null,
        ...(input.custom !== undefined ? { custom: input.custom as Json } : {}),
      };
      if (input.id) {
        return expectRows(
          await supabase.from('crm_contacts').update(payload).eq('id', input.id).select('id'),
          'o contato',
        );
      }
      return expectRows(
        await supabase
          .from('crm_contacts')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user?.id })
          .select('id'),
        'o contato',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contact'] });
      toast.success('Contato salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Negócios
// ─────────────────────────────────────────────────────────────────────────

export interface CRMDealWithRelations extends CRMDeal {
  contact: Pick<CRMContact, 'id' | 'name' | 'company'> | null;
  owner: { id: string; full_name: string | null } | null;
}

/** Todos os negócios abertos (nem ganhos, nem perdidos) — o funil. */
export function useCRMDeals() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-deals', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMDealWithRelations[]> =>
      unwrap(
        await supabase
          .from('crm_deals')
          .select('*, contact:crm_contacts(id, name, company), owner:profiles!crm_deals_owner_id_fkey(id, full_name)')
          .eq('tenant_id', tenantId!)
          .is('won_at', null)
          .is('lost_at', null)
          .order('position'),
      ) as unknown as CRMDealWithRelations[],
  });
}

export interface CRMDealDetail extends CRMDeal {
  contact: CRMContact;
  stage: CRMStage;
  owner: { id: string; full_name: string | null } | null;
}

export function useDeal(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-deal', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<CRMDealDetail> =>
      unwrap(
        await supabase
          .from('crm_deals')
          .select('*, contact:crm_contacts(*), stage:crm_pipeline_stages(*), owner:profiles!crm_deals_owner_id_fkey(id, full_name)')
          .eq('id', id!)
          .single(),
      ) as unknown as CRMDealDetail,
  });
}

export interface DealInput {
  id?: string;
  contact_id: string;
  stage_id?: string;
  title: string;
  value: number;
  owner_id?: string | null;
  source?: string;
  expected_close_date?: string | null;
  /** Campos personalizados `{chave: valor}` (E2); ausente = não mexe. */
  custom?: CustomValues;
}

export function useSaveDeal() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DealInput) => {
      if (input.id) {
        const { id, custom, ...rest } = input;
        const patch = { ...rest, ...(custom !== undefined ? { custom: custom as Json } : {}) };
        return expectRows(await supabase.from('crm_deals').update(patch).eq('id', id).select('id'), 'o negócio');
      }

      let stageId = input.stage_id;
      if (!stageId) {
        // Sem etapa informada: a primeira etapa aberta do funil padrão.
        const openStage = unwrap(
          await supabase
            .from('crm_pipeline_stages')
            .select('id, crm_pipelines!inner(is_default)')
            .eq('tenant_id', tenantId!)
            .eq('kind', 'open')
            .eq('crm_pipelines.is_default', true)
            .order('position')
            .limit(1)
            .single(),
        );
        stageId = openStage.id;
      }

      return expectRows(
        await supabase
          .from('crm_deals')
          .insert({
            contact_id: input.contact_id,
            stage_id: stageId,
            title: input.title,
            value: input.value,
            owner_id: input.owner_id ?? user?.id ?? null,
            source: input.source ?? 'manual',
            expected_close_date: input.expected_close_date ?? null,
            custom: (input.custom ?? {}) as Json,
            tenant_id: tenantId!,
            created_by: user?.id,
          })
          .select('id'),
        'o negócio',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal'] });
      toast.success('Negócio salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Arrastar entre colunas do funil: só `stage_id`/`position` — a linha do tempo é do banco. */
export function useMoveDeal() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['crm-deals', tenantId];
  return useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) =>
      expectRows(
        await supabase.from('crm_deals').update({ stage_id, position }).eq('id', id).select('id'),
        'o negócio',
      ),
    onMutate: async ({ id, stage_id, position }) => {
      const previous = queryClient.getQueryData<CRMDealWithRelations[]>(queryKey);
      queryClient.setQueryData<CRMDealWithRelations[]>(queryKey, (old) =>
        old?.map((deal) => (deal.id === id ? { ...deal, stage_id, position } : deal)),
      );
      return { previous };
    },
    onError: (e, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(errorMessage(e));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['crm-deal-activities'] });
    },
  });
}

/** "Marcar como ganho" / "Marcar como perdido": muda a etapa e, se perdido, grava o motivo. */
export function useSetDealStage() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage_id, lost_reason }: { id: string; stage_id: string; lost_reason?: string | null }) =>
      expectRows(
        await supabase.from('crm_deals').update({ stage_id, lost_reason: lost_reason ?? null }).eq('id', id).select('id'),
        'o negócio',
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-deal', tenantId, variables.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal-activities'] });
      toast.success('Negócio atualizado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Linha do tempo e tarefas do negócio
// ─────────────────────────────────────────────────────────────────────────

export interface CRMDealActivityWithAuthor extends CRMDealActivity {
  author: { id: string; full_name: string | null } | null;
}

export function useDealActivities(dealId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-deal-activities', tenantId, dealId],
    enabled: !!tenantId && !!dealId,
    queryFn: async (): Promise<CRMDealActivityWithAuthor[]> =>
      unwrap(
        await supabase
          .from('crm_deal_activities')
          .select('*, author:profiles(id, full_name)')
          .eq('deal_id', dealId!)
          .order('created_at'),
      ) as unknown as CRMDealActivityWithAuthor[],
  });
}

export function useAddNote(dealId: string) {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) =>
      expectRows(
        await supabase
          .from('crm_deal_activities')
          .insert({ tenant_id: tenantId!, deal_id: dealId, author_id: user?.id, kind: 'note', content })
          .select('id'),
        'a nota',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deal-activities', tenantId, dealId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDealTasks(dealId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-deal-tasks', tenantId, dealId],
    enabled: !!tenantId && !!dealId,
    queryFn: async (): Promise<CRMTask[]> =>
      unwrap(
        await supabase
          .from('tasks')
          .select('*')
          .eq('source_type', 'crm_deal')
          .eq('source_id', dealId!)
          .order('due_date'),
      ),
  });
}

export interface DealTaskInput {
  deal_id: string;
  user_id: string;
  user_name: string;
  title: string;
  due_date?: string | null;
}

/** Cria a tarefa (`tasks`) e registra na linha do tempo do negócio (`kind: 'task'`). */
export function useAddDealTask() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DealTaskInput) => {
      const rows = expectRows(
        await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId!,
            user_id: input.user_id,
            title: input.title,
            due_date: input.due_date ?? null,
            source_type: 'crm_deal',
            source_id: input.deal_id,
          })
          .select('id'),
        'a tarefa',
      );
      expectRows(
        await supabase
          .from('crm_deal_activities')
          .insert({
            tenant_id: tenantId!,
            deal_id: input.deal_id,
            author_id: user?.id,
            kind: 'task',
            content: `Tarefa "${input.title}" para ${input.user_name}`,
          })
          .select('id'),
        'a atividade da tarefa',
      );
      return rows;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-deal-tasks', tenantId, variables.deal_id] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal-activities', tenantId, variables.deal_id] });
      toast.success('Tarefa criada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Mesmos valores de `status`/`completed_at` usados em `FocusMode.tsx` para concluir uma tarefa. */
export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(
        await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
        'a tarefa',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deal-tasks'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────

export function useCRMProducts(onlyActive = true) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-products', tenantId, onlyActive],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMProduct[]> => {
      let query = supabase.from('crm_products').select('*').eq('tenant_id', tenantId!);
      if (onlyActive) query = query.eq('is_active', true);
      return unwrap(await query.order('name'));
    },
  });
}

export interface ProductInput {
  id?: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  unit?: string;
  price: number;
  is_active?: boolean;
}

export function useSaveProduct() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const payload = {
        name: input.name,
        sku: input.sku ?? null,
        description: input.description ?? null,
        unit: input.unit ?? 'un',
        price: input.price,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('crm_products').update(payload).eq('id', input.id).select('id'),
          'o produto',
        );
      }
      return expectRows(
        await supabase.from('crm_products').insert({ ...payload, tenant_id: tenantId! }).select('id'),
        'o produto',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-products'] });
      toast.success('Produto salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Pedidos
// ─────────────────────────────────────────────────────────────────────────

export interface CRMOrderWithRelations extends CRMOrder {
  contact: Pick<CRMContact, 'id' | 'name' | 'company'> | null;
  deal: { id: string; title: string } | null;
}

/** Todos os pedidos da empresa — para `ComercialPedidos`. */
export function useCRMOrders() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-orders', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMOrderWithRelations[]> =>
      unwrap(
        await supabase
          .from('crm_orders')
          .select('*, contact:crm_contacts(id, name, company), deal:crm_deals(id, title)')
          .eq('tenant_id', tenantId!)
          .order('created_at', { ascending: false }),
      ) as unknown as CRMOrderWithRelations[],
  });
}

export function useDealOrders(dealId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-deal-orders', tenantId, dealId],
    enabled: !!tenantId && !!dealId,
    queryFn: async (): Promise<CRMOrder[]> =>
      unwrap(
        await supabase.from('crm_orders').select('*').eq('deal_id', dealId!).order('created_at', { ascending: false }),
      ),
  });
}

export interface CRMOrderDetail extends CRMOrder {
  items: CRMOrderItem[];
}

export function useOrder(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-order', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<CRMOrderDetail> => {
      const order = unwrap(await supabase.from('crm_orders').select('*').eq('id', id!).single());
      const items = unwrap(
        await supabase.from('crm_order_items').select('*').eq('order_id', id!).order('position'),
      );
      return { ...order, items };
    },
  });
}

export interface OrderItemInput {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
}

export interface CreateOrderInput {
  deal_id?: string | null;
  contact_id: string;
  discount: number;
  notes?: string | null;
  items: OrderItemInput[];
}

export function useCreateOrder() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      // `number` é NOT NULL na tabela, mas preenchido por trigger
      // (`crm_orders_set_number`) quando o insert não manda — o codegen do
      // Supabase não vê triggers, só marca a coluna como obrigatória.
      const payload = {
        tenant_id: tenantId!,
        deal_id: input.deal_id ?? null,
        contact_id: input.contact_id,
        discount: input.discount,
        notes: input.notes ?? null,
        created_by: user?.id,
      } as Database['public']['Tables']['crm_orders']['Insert'];
      const [order] = expectRows(
        await supabase.from('crm_orders').insert(payload).select('id'),
        'o pedido',
      );
      if (input.items.length > 0) {
        expectRows(
          await supabase
            .from('crm_order_items')
            .insert(input.items.map((item) => ({ ...item, order_id: order.id, tenant_id: tenantId! })))
            .select('id'),
          'os itens do pedido',
        );
      }
      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deal-orders'] });
      queryClient.invalidateQueries({ queryKey: ['crm-orders'] });
      toast.success('Pedido criado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Apaga e reinsere os itens do pedido — o banco recalcula subtotal/total. */
export function useUpdateOrderItems(orderId: string) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: OrderItemInput[]) => {
      // Zero linhas apagadas é estado válido (pedido sem itens ainda) — não
      // é o caso de escrita sem efeito que a regra 2 cobre; por isso o erro
      // é conferido direto, sem `expectRows`.
      const { error: deleteError } = await supabase.from('crm_order_items').delete().eq('order_id', orderId);
      if (deleteError) throw deleteError;

      if (items.length > 0) {
        expectRows(
          await supabase
            .from('crm_order_items')
            .insert(items.map((item) => ({ ...item, order_id: orderId, tenant_id: tenantId! })))
            .select('id'),
          'os itens do pedido',
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-order', tenantId, orderId] });
      toast.success('Pedido atualizado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSetOrderDiscount() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, discount }: { id: string; discount: number }) =>
      expectRows(await supabase.from('crm_orders').update({ discount }).eq('id', id).select('id'), 'o pedido'),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-order', tenantId, variables.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCancelOrder() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('crm_orders').update({ status: 'cancelled' }).eq('id', id).select('id'), 'o pedido'),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['crm-order', tenantId, id] });
      queryClient.invalidateQueries({ queryKey: ['crm-orders'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal-orders'] });
      toast.success('Pedido cancelado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export interface GeneratePaymentLinkInput {
  order_id: string;
  kind: 'temporary' | 'permanent';
  expires_in_hours?: number;
}

/**
 * A edge function `stripe-create-checkout` ainda não existe (é do
 * planejador, na sequência): qualquer erro dela mostra a mensagem fixa
 * abaixo, sem inventar fallback.
 */
export function useGeneratePaymentLink() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GeneratePaymentLinkInput) => {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout', { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-order', tenantId, variables.order_id] });
    },
    onError: async (error) => {
      // A função devolve o motivo no corpo ({ error }); o supabase-js só expõe
      // "non-2xx" na mensagem. Sem Stripe configurado, a frase amigável.
      let reason = '';
      if (error instanceof FunctionsHttpError) {
        try {
          const body = (await error.context.json()) as { error?: string };
          reason = body?.error ?? '';
        } catch {
          reason = '';
        }
      }
      toast.error(
        !reason || reason === 'stripe_not_configured'
          ? 'Pagamento ainda não configurado nesta empresa.'
          : `Não foi possível gerar o link: ${reason}`,
      );
    },
  });
}
