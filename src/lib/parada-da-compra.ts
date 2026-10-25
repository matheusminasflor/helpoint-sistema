import type { PurchaseRequestRow } from '@/hooks/usePurchases';

/**
 * Há quantos dias a compra está parada na etapa dela, e o limite a partir do qual fica vermelha (etapa 4 · Compras,
 * 2026-10-24): esperando decisão ou em ajuste, 3 dias; aprovada e não paga, 3 dias; paga e sem nota, 15 (o aviso
 * automático de 15 dias). Comprada com nota não para.
 */
export function paradaDaCompra(p: PurchaseRequestRow, agora = Date.now()): { dias: number; limite: number } | null {
  const desde = p.status === 'pending_approval' ? p.created_at
    : p.status === 'adjustment_requested' ? ((p as { updated_at?: string }).updated_at ?? p.created_at)
    : p.status === 'approved' ? (p.pagamento_em ?? p.approved_at)
    : null;
  if (!desde) return null;
  const dias = Math.floor((agora - Date.parse(desde)) / 86_400_000);
  return { dias, limite: p.status === 'approved' && p.pagamento_em ? 15 : 3 };
}
