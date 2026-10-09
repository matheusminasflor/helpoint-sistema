import { describe, expect, it } from 'vitest';
import { emptyPurchaseValue, totalDigitado, validatePurchaseFields } from './PurchaseRequestFields';

const pedido = () => {
  const v = emptyPurchaseValue('ti');
  v.productName = 'Cadeira';
  v.quantidade = '4';
  v.quotes = v.quotes.map((q, i) => ({ ...q, supplier: `Loja ${i}`, amount: '100', prazoDias: '5', link: 'https://x' }));
  return v;
};

describe('pedido de compra (dono, 2026-10-09)', () => {
  it('total = unitario x quantidade + frete pago', () => {
    expect(totalDigitado({ supplier: 'A', amount: '90', fretePago: true, frete: '30' }, '4')).toBe(390);
    expect(totalDigitado({ supplier: 'A', amount: '12,50', fretePago: false, frete: '30' }, '2')).toBe(25);
  });

  it('pedido completo passa', () => {
    expect(validatePurchaseFields(pedido())).toBeNull();
  });

  it('exige quantidade, prazo e o valor do frete pago', () => {
    const semQtd = { ...pedido(), quantidade: '0' };
    expect(validatePurchaseFields(semQtd)).toMatch(/quantidade/);
    const semPrazo = pedido();
    semPrazo.quotes[1].prazoDias = '';
    expect(validatePurchaseFields(semPrazo)).toMatch(/prazo/);
    const fretePagoSemValor = pedido();
    fretePagoSemValor.quotes[0].fretePago = true;
    expect(validatePurchaseFields(fretePagoSemValor)).toMatch(/frete/);
  });
});
