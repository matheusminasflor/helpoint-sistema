import { describe, it, expect } from 'vitest';
import { formatBRL, orderTotals, SOURCE_LABELS, ORDER_STATUS_LABELS } from './crm';

describe('formatBRL', () => {
  it('formata inteiro em reais', () => {
    expect(formatBRL(4800)).toBe('R$ 4.800,00');
  });

  it('formata zero e valores nulos como R$ 0,00', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('rótulos', () => {
  it('cobre todas as origens do banco (crm_contacts.source / crm_deals.source)', () => {
    // A mesma lista do CHECK `crm_contacts_source_check` (migration 20260913010000).
    expect(Object.keys(SOURCE_LABELS).sort()).toEqual(['facebook', 'importacao', 'indicacao', 'instagram', 'manual', 'outro', 'site', 'whatsapp']);
  });

  it('cobre todos os status de pedido (crm_orders.status)', () => {
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual(['cancelled', 'draft', 'expired', 'paid', 'sent']);
  });
});

describe('orderTotals', () => {
  it('soma quantidade × preço unitário de cada item', () => {
    expect(orderTotals([{ quantity: 2, unit_price: 100 }, { quantity: 1, unit_price: 50 }], 0)).toEqual({
      subtotal: 250,
      total: 250,
    });
  });

  it('aplica o desconto sobre o subtotal', () => {
    expect(orderTotals([{ quantity: 1, unit_price: 1000 }], 200)).toEqual({ subtotal: 1000, total: 800 });
  });

  it('nunca deixa o total negativo, mesmo com desconto maior que o subtotal', () => {
    expect(orderTotals([{ quantity: 1, unit_price: 100 }], 500)).toEqual({ subtotal: 100, total: 0 });
  });

  it('lista vazia dá subtotal e total zero', () => {
    expect(orderTotals([], 0)).toEqual({ subtotal: 0, total: 0 });
  });

  it('arredonda para duas casas, como o `round(quantity * unit_price, 2)` do banco', () => {
    expect(orderTotals([{ quantity: 3, unit_price: 10.555 }], 0)).toEqual({ subtotal: 31.67, total: 31.67 });
  });
});
