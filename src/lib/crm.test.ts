import { describe, it, expect } from 'vitest';
import { formatBRL, orderTotals, proposalUrl, proposalWhatsAppText, whatsAppLink, SOURCE_LABELS, ORDER_STATUS_LABELS } from './crm';

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
    // A mesma lista do CHECK `crm_orders_status_check` (migration 20260914010000).
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual(['accepted', 'cancelled', 'draft', 'expired', 'paid', 'proposal_sent', 'sent']);
  });
});

describe('proposta (CRM-1c)', () => {
  it('soma o frete depois do desconto, como o banco', () => {
    expect(orderTotals([{ quantity: 2, unit_price: 100 }], 50, 30)).toEqual({ subtotal: 200, total: 180 });
    expect(orderTotals([], 0, 30)).toEqual({ subtotal: 0, total: 30 });
  });

  it('monta o link público sem barra dobrada', () => {
    expect(proposalUrl('https://app.helpoint.com.br/', 'abc123')).toBe('https://app.helpoint.com.br/proposta/abc123');
  });

  it('escreve a mensagem do WhatsApp com valor, link e validade em português', () => {
    const text = proposalWhatsAppText({ contactName: 'Ana', companyName: 'Minasflor', number: 7, total: 180, url: 'https://x/proposta/t', validUntil: '2026-09-18' });
    expect(text).toContain('proposta nº 7 da Minasflor: R$ 180,00');
    expect(text).toContain('https://x/proposta/t');
    expect(text).toContain('Válida até 18/09/2026');
  });

  it('o link do WhatsApp ganha o 55 do Brasil quando o cadastro tem so DDD, e nao dobra quando ja tem', () => {
    expect(whatsAppLink('(31) 99999-0000', 'oi lá')).toBe('https://wa.me/5531999990000?text=oi%20l%C3%A1');
    expect(whatsAppLink('3133330000', 'x')).toMatch(/^https:\/\/wa\.me\/553133330000\?/);
    expect(whatsAppLink('+55 31 99999-0000', 'x')).toMatch(/^https:\/\/wa\.me\/5531999990000\?/);
    expect(whatsAppLink('', 'x')).toBe('https://wa.me/?text=x');
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
