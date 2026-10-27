import type { PurchaseRequestRow } from '@/hooks/usePurchases';
import { toLocalISODate } from '@/lib/dates';

/**
 * Há quantos dias a compra está parada na etapa dela, e o limite a partir do qual fica vermelha (etapa 4 · Compras,
 * 2026-10-24): esperando decisão ou em ajuste, 3 dias; aprovada e não paga, 3 dias; paga e sem nota, 15 (o aviso
 * automático de 15 dias). Comprada com nota não para. Aguardando o fornecedor (2026-10-27) não para até a previsão;
 * passou, conta do dia seguinte a ela e já é vermelha.
 */
export function paradaDaCompra(p: PurchaseRequestRow, agora = Date.now()): { dias: number; limite: number; rotulo?: string } | null {
  if (p.status === 'approved' && !p.pagamento_em && p.fornecedor_previsao) {
    if (p.fornecedor_previsao >= toLocalISODate(new Date(agora))) return null;
    const dias = Math.floor((agora - Date.parse(`${p.fornecedor_previsao}T00:00:00`)) / 86_400_000);
    return { dias, limite: 1, rotulo: 'fornecedor atrasado há' };
  }
  const desde = p.status === 'pending_approval' ? p.created_at
    : p.status === 'adjustment_requested' ? ((p as { updated_at?: string }).updated_at ?? p.created_at)
    : p.status === 'approved' ? (p.pagamento_em ?? p.approved_at)
    : null;
  if (!desde) return null;
  const dias = Math.floor((agora - Date.parse(desde)) / 86_400_000);
  return { dias, limite: p.status === 'approved' && p.pagamento_em ? 15 : 3 };
}
