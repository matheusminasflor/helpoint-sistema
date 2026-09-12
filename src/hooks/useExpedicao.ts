import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Expedição (EXP-1, ADR-009): a fila de pedidos pagos, a separação por
 * bipagem e o estoque por lote. Regra nenhuma aqui — quem escolhe o lote
 * (FEFO/FIFO), dá baixa e confere o que falta é o banco (`exp_scan`).
 */

export type QueueRow = Database['public']['Functions']['exp_queue']['Returns'][number];
export type Shipment = Database['public']['Tables']['exp_shipments']['Row'];
export type ShipmentItem = Database['public']['Tables']['exp_shipment_items']['Row'];
export type Lot = Database['public']['Tables']['exp_lots']['Row'];
export type LotBalance = Database['public']['Views']['exp_lot_balances']['Row'];
export type ProductBalance = Database['public']['Views']['exp_product_balances']['Row'];

export interface ScanResult {
  product: string; unit: string;
  picked: number; quantity: number; remaining: number;
  lot: string | null; expires_on: string | null;
  complete: boolean;
}

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  a_separar: 'A separar',
  pending: 'A separar',
  picking: 'Separando',
  packed: 'Pronto para despachar',
  shipped: 'Despachado',
  cancelled: 'Cancelado',
};

export function useExpedicaoQueue() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['exp-queue', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<QueueRow[]> => unwrap(await supabase.rpc('exp_queue')),
  });
}

export function useShipment(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['exp-shipment', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async () => {
      const shipment = unwrap(await supabase
        .from('exp_shipments')
        .select('*, order:crm_orders(id, number, notes, contact:crm_contacts(id, name, company, city, state, carrier, whatsapp, phone))')
        .eq('id', id!)
        .single());
      const items = unwrap(await supabase
        .from('exp_shipment_items')
        .select('*, product:crm_products(id, name, sku, barcode, unit, track_lots), lot:exp_lots(id, code, expires_on)')
        .eq('shipment_id', id!)
        .order('position'));
      return { ...shipment, items };
    },
  });
}

/** Abre a separação de um pedido pago (ou devolve a que já existe). */
export function useStartShipment() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string): Promise<string> => unwrap(await supabase.rpc('exp_start', { p_order: orderId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exp-queue', tenantId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** A bipagem: código de barras, SKU ou código do lote. O banco escolhe o lote e dá baixa. */
export function useScan(shipmentId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; quantity?: number }): Promise<ScanResult> =>
      unwrap(await supabase.rpc('exp_scan', { p_shipment: shipmentId!, p_code: input.code, p_quantity: input.quantity ?? 1 })) as unknown as ScanResult,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exp-shipment', tenantId, shipmentId] });
      qc.invalidateQueries({ queryKey: ['exp-queue', tenantId] });
      qc.invalidateQueries({ queryKey: ['exp-balances', tenantId] });
    },
  });
}

export function useShipOrder(shipmentId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { carrier?: string; tracking?: string }) => {
      unwrap(await supabase.rpc('exp_ship', { p_shipment: shipmentId!, p_carrier: input.carrier ?? null, p_tracking: input.tracking ?? null }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exp-shipment', tenantId, shipmentId] });
      qc.invalidateQueries({ queryKey: ['exp-queue', tenantId] });
      toast.success('Pedido despachado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

// ── Estoque ────────────────────────────────────────────────────────────────

export function useProductBalances() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['exp-balances', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProductBalance[]> =>
      unwrap(await supabase.from('exp_product_balances').select('*').order('name')),
  });
}

export function useLotBalances(productId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['exp-lots', tenantId, productId],
    enabled: !!tenantId && !!productId,
    queryFn: async (): Promise<LotBalance[]> =>
      unwrap(await supabase.from('exp_lot_balances').select('*').eq('product_id', productId!).order('expires_on', { nullsFirst: false })),
  });
}

export interface LotEntryInput {
  product_id: string;
  code: string;
  expires_on?: string | null;
  received_on?: string | null;
  quantity: number;
  notes?: string | null;
}

/** Entrada de lote: cria (ou reaproveita) o lote e lança a movimentação de entrada. */
export function useReceiveLot() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LotEntryInput) => {
      const existing = unwrap(await supabase.from('exp_lots').select('id')
        .eq('product_id', input.product_id).eq('code', input.code.trim()).maybeSingle());
      const lotId = existing?.id ?? expectRows(await supabase.from('exp_lots').insert({
        tenant_id: tenantId!,
        product_id: input.product_id,
        code: input.code.trim(),
        expires_on: input.expires_on || null,
        received_on: input.received_on || undefined,
        notes: input.notes || null,
      }).select('id'), 'a criação do lote')[0].id;
      expectRows(await supabase.from('exp_stock_moves').insert({
        tenant_id: tenantId!,
        product_id: input.product_id,
        lot_id: lotId,
        kind: 'in',
        quantity: input.quantity,
        reason: 'Entrada de lote',
      }).select('id'), 'a entrada de estoque');
      return lotId;
    },
    onSuccess: (_id, input) => {
      qc.invalidateQueries({ queryKey: ['exp-balances', tenantId] });
      qc.invalidateQueries({ queryKey: ['exp-lots', tenantId, input.product_id] });
      toast.success('Entrada registrada.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** Ajuste de saldo (perda, quebra, contagem): movimentação assinada, sem apagar histórico. */
export function useAdjustStock() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { product_id: string; lot_id?: string | null; quantity: number; reason: string }) => {
      expectRows(await supabase.from('exp_stock_moves').insert({
        tenant_id: tenantId!,
        product_id: input.product_id,
        lot_id: input.lot_id || null,
        kind: 'adjust',
        quantity: input.quantity,
        reason: input.reason,
      }).select('id'), 'o ajuste de estoque');
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['exp-balances', tenantId] });
      qc.invalidateQueries({ queryKey: ['exp-lots', tenantId, input.product_id] });
      toast.success('Ajuste registrado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

// ── Configuração: qual lote sai primeiro ───────────────────────────────────

export type PickingRule = 'fefo' | 'fifo' | 'manual';

export function usePickingRule() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['exp-picking', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PickingRule> => {
      const row = unwrap(await supabase.from('tenants').select('settings').eq('id', tenantId!).single());
      const s = row.settings as { expedicao?: { picking?: PickingRule } } | null;
      return s?.expedicao?.picking ?? 'fefo';
    },
  });
}

export function useSavePickingRule() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (picking: PickingRule) => {
      // `settings` é jsonb: lê, mexe só no ramo `expedicao` e grava de volta.
      const row = unwrap(await supabase.from('tenants').select('settings').eq('id', tenantId!).single());
      const current = (row.settings ?? {}) as Record<string, Json>;
      const expedicao = { ...((current.expedicao ?? {}) as Record<string, Json>), picking };
      expectRows(
        await supabase.from('tenants').update({ settings: { ...current, expedicao } as Json }).eq('id', tenantId!).select('id'),
        'a regra de separação',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exp-picking', tenantId] });
      toast.success('Regra de separação salva.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
