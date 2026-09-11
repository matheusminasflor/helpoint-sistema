import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Configuração do Comercial da CRM-1b: segmentos, tabelas de preço (e suas
 * exceções por produto), portões por etapa e o assistente de primeira
 * abertura. Regra nenhuma aqui — o preço da tabela, a tabela do contato e o
 * portão são do banco (migration 20260913010000); estes hooks só leem e
 * gravam pelas cinco regras de escrita.
 */

export type CRMSegment = Database['public']['Tables']['crm_segments']['Row'];
export type CRMPriceTable = Database['public']['Tables']['crm_price_tables']['Row'];
export type CRMPriceTableItem = Database['public']['Tables']['crm_price_table_items']['Row'];
export type ProductWithPrice = Database['public']['Functions']['crm_products_with_price']['Returns'][number];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─────────────────────────────────────────────────────────────────────────
// Segmentos
// ─────────────────────────────────────────────────────────────────────────

export function useCRMSegments(includeInactive = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-segments', tenantId, includeInactive],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMSegment[]> => {
      let query = supabase.from('crm_segments').select('*').eq('tenant_id', tenantId!).order('position').order('created_at');
      if (!includeInactive) query = query.eq('is_active', true);
      return unwrap(await query);
    },
  });
}

export interface SegmentInput {
  id?: string;
  name: string;
  pipeline_id?: string | null;
  price_table_id?: string | null;
  is_active?: boolean;
}

export function useSaveSegment() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SegmentInput) => {
      const patch = {
        name: input.name,
        pipeline_id: input.pipeline_id ?? null,
        price_table_id: input.price_table_id ?? null,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        return expectRows(await supabase.from('crm_segments').update(patch).eq('id', input.id).select('id'), 'o segmento');
      }
      const counted = await supabase.from('crm_segments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!);
      if (counted.error) throw counted.error;
      return expectRows(
        await supabase.from('crm_segments').insert({ ...patch, tenant_id: tenantId!, position: (counted.count ?? 0) + 1 }).select('id'),
        'o segmento',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-segments', tenantId] });
      toast.success('Segmento salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Apagar de verdade: os contatos do segmento ficam sem segmento (FK `on delete set null`). */
export function useDeleteSegment() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => expectRows(await supabase.from('crm_segments').delete().eq('id', id).select('id'), 'o segmento'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-segments', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast.success('Segmento apagado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Tabelas de preço
// ─────────────────────────────────────────────────────────────────────────

export function usePriceTables(includeInactive = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-price-tables', tenantId, includeInactive],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMPriceTable[]> => {
      let query = supabase.from('crm_price_tables').select('*').eq('tenant_id', tenantId!).order('position').order('created_at');
      if (!includeInactive) query = query.eq('is_active', true);
      return unwrap(await query);
    },
  });
}

export interface PriceTableInput {
  id?: string;
  name: string;
  percent: number;
  is_default?: boolean;
  is_active?: boolean;
}

/** Cria ou edita. Marcar como padrão tira o padrão da outra antes (o banco só aceita uma). */
export function useSavePriceTable() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PriceTableInput) => {
      if (input.is_default) {
        const cleared = await supabase.from('crm_price_tables').update({ is_default: false }).eq('tenant_id', tenantId!).eq('is_default', true).select('id');
        if (cleared.error) throw cleared.error;
      }
      const patch = { name: input.name, percent: input.percent, is_default: input.is_default ?? false, is_active: input.is_active ?? true };
      if (input.id) {
        return expectRows(await supabase.from('crm_price_tables').update(patch).eq('id', input.id).select('id'), 'a tabela de preço');
      }
      const counted = await supabase.from('crm_price_tables').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!);
      if (counted.error) throw counted.error;
      return expectRows(
        await supabase.from('crm_price_tables').insert({ ...patch, tenant_id: tenantId!, position: (counted.count ?? 0) + 1 }).select('id'),
        'a tabela de preço',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-price-tables', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-products-priced', tenantId] });
      toast.success('Tabela de preço salva.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeletePriceTable() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => expectRows(await supabase.from('crm_price_tables').delete().eq('id', id).select('id'), 'a tabela de preço'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-price-tables', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-segments', tenantId] });
      toast.success('Tabela apagada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Exceções (preço fixo por produto) de uma tabela. */
export function usePriceTableItems(tableId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-price-table-items', tenantId, tableId],
    enabled: !!tenantId && !!tableId,
    queryFn: async (): Promise<CRMPriceTableItem[]> =>
      unwrap(await supabase.from('crm_price_table_items').select('*').eq('price_table_id', tableId!)),
  });
}

export function useSavePriceTableItem() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { price_table_id: string; product_id: string; price: number }) =>
      expectRows(
        await supabase
          .from('crm_price_table_items')
          .upsert({ ...input, tenant_id: tenantId! }, { onConflict: 'price_table_id,product_id' })
          .select('id'),
        'a exceção de preço',
      ),
    onSuccess: (_rows, input) => {
      queryClient.invalidateQueries({ queryKey: ['crm-price-table-items', tenantId, input.price_table_id] });
      queryClient.invalidateQueries({ queryKey: ['crm-products-priced', tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeletePriceTableItem() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; price_table_id: string }) =>
      expectRows(await supabase.from('crm_price_table_items').delete().eq('id', input.id).select('id'), 'a exceção de preço'),
    onSuccess: (_rows, input) => {
      queryClient.invalidateQueries({ queryKey: ['crm-price-table-items', tenantId, input.price_table_id] });
      queryClient.invalidateQueries({ queryKey: ['crm-products-priced', tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** O catálogo já com o preço da tabela — `null` = preço base. Uma consulta (`crm_products_with_price`). */
export function useProductsWithPrice(tableId: string | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-products-priced', tenantId, tableId ?? 'base'],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProductWithPrice[]> =>
      unwrap(await supabase.rpc('crm_products_with_price', { p_table: tableId ?? undefined })),
  });
}

/** Que tabela vale para um contato (dele → do segmento → padrão da empresa → nenhuma). */
export function useResolvePriceTable(contactId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-resolve-price-table', tenantId, contactId],
    enabled: !!tenantId && !!contactId,
    queryFn: async (): Promise<string | null> => unwrap(await supabase.rpc('crm_resolve_price_table', { p_contact: contactId! })),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Portões por etapa
// ─────────────────────────────────────────────────────────────────────────

export function useSaveStageGate() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { stage_id: string; required_fields: string[] }) =>
      expectRows(
        await supabase.from('crm_pipeline_stages').update({ required_fields: input.required_fields }).eq('id', input.stage_id).select('id'),
        'a etapa',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-stages', tenantId] });
      toast.success('Campos exigidos salvos.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Assistente de primeira abertura
// ─────────────────────────────────────────────────────────────────────────

export interface SetupSegment {
  name: string;
  price_table?: string;
  requires_document?: boolean;
}

export interface SetupPriceTable {
  name: string;
  percent: number;
  is_default?: boolean;
}

/** `crm_setup`: tabelas → segmentos → um funil por segmento. Sem segmentos = funil de exemplo. */
export function useCRMSetup() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { segments: SetupSegment[]; priceTables: SetupPriceTable[] }) =>
      unwrap(
        await supabase.rpc('crm_setup', {
          p_segments: input.segments as unknown as Json,
          p_price_tables: input.priceTables as unknown as Json,
        }),
      ),
    onSuccess: () => {
      for (const key of ['crm-pipelines', 'crm-stages', 'crm-segments', 'crm-price-tables']) {
        queryClient.invalidateQueries({ queryKey: [key, tenantId] });
      }
      toast.success('Comercial configurado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
