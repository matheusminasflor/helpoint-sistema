import { describe, expect, it } from 'vitest';
import { paradaDaCompra } from './parada-da-compra';
import type { PurchaseRequestRow } from '@/hooks/usePurchases';

const agora = Date.parse('2026-10-25T12:00:00Z');
const compra = (c: Partial<PurchaseRequestRow>) => ({ created_at: '2026-10-20T12:00:00Z', approved_at: null, pagamento_em: null, ...c }) as PurchaseRequestRow;

describe('compra parada (selo do quadro, 2026-10-24)', () => {
  it('esperando decisão conta da abertura, vermelha a partir de 3 dias', () => {
    expect(paradaDaCompra(compra({ status: 'pending_approval' }), agora)).toEqual({ dias: 5, limite: 3 });
  });
  it('paga e sem nota conta do pagamento, com o limite de 15 dias', () => {
    expect(paradaDaCompra(compra({ status: 'approved', approved_at: '2026-10-21T12:00:00Z', pagamento_em: '2026-10-23T12:00:00Z' }), agora))
      .toEqual({ dias: 2, limite: 15 });
  });
  it('aguardando o fornecedor não para até a previsão; passou, já é vermelha (2026-10-27)', () => {
    const kit = (previsao: string) => compra({ status: 'approved', approved_at: '2026-10-14T12:00:00Z', fornecedor_previsao: previsao });
    expect(paradaDaCompra(kit('2026-10-30'), agora)).toBeNull();
    expect(paradaDaCompra(kit('2026-10-25'), agora)).toBeNull();
    const vencida = paradaDaCompra(kit('2026-10-23'), agora);
    expect(vencida?.dias).toBeGreaterThanOrEqual(vencida!.limite);
    expect(vencida?.rotulo).toBe('fornecedor atrasado há');
  });
  it('comprada não para', () => {
    expect(paradaDaCompra(compra({ status: 'completed' }), agora)).toBeNull();
  });
});
