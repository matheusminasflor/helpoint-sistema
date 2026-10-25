import { describe, expect, it } from 'vitest';
import { emptyPurchaseValue, pedidoSimplesVazio, totalDigitado, validarPedidoSimples, validatePurchaseFields } from '@/lib/pedido-de-compra';

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

describe('pedir compra: o orçamento é opcional (2026-10-25)', () => {
  const base = { ...pedidoSimplesVazio('ti'), productName: 'Cadeira' };
  it('sem orçamento, passa', () => { expect(validarPedidoSimples(base)).toBeNull(); });
  it('orçamento começado precisa de fornecedor e valor', () => {
    expect(validarPedidoSimples({ ...base, quotes: [{ ...base.quotes[0], supplier: 'Loja A' }] })).toMatch(/fornecedor e o valor/);
    expect(validarPedidoSimples({ ...base, quotes: [{ ...base.quotes[0], supplier: 'Loja A', amount: '12,50' }] })).toBeNull();
  });
  it('produto, setor e quantidade continuam obrigatórios', () => {
    expect(validarPedidoSimples({ ...base, productName: '' })).toMatch(/produto/);
    expect(validarPedidoSimples({ ...base, setor: '' })).toMatch(/setor/);
  });
});
