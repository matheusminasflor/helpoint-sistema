import { describe, expect, it } from 'vitest';
import { emptyPurchaseValue, pedidoSimplesVazio, totalDigitado, validarPedidoDeCompra, validarPedidoSimples } from '@/lib/pedido-de-compra';

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
});

describe('quem pede traz os três orçamentos (dono, 2026-10-29)', () => {
  it('com três, passa sem porquê', () => { expect(validarPedidoDeCompra(pedido(), '')).toBeNull(); });
  it('sem orçamento nenhum, não sai', () => {
    const v = pedido();
    v.quotes = v.quotes.map((q) => ({ ...q, supplier: '', amount: '' }));
    expect(validarPedidoDeCompra(v, 'qualquer')).toMatch(/no mínimo três/);
  });
  it('com menos de três, exige o porquê — e com ele, passa', () => {
    const v = pedido();
    v.quotes[2] = { ...v.quotes[2], supplier: '', amount: '', link: '' };
    expect(validarPedidoDeCompra(v, '')).toMatch(/porquê/);
    expect(validarPedidoDeCompra(v, 'fornecedor único')).toBeNull();
  });
  it('cada orçamento precisa de fornecedor, valor e link (ou anexo)', () => {
    const semValor = pedido(); semValor.quotes[1].amount = '';
    expect(validarPedidoDeCompra(semValor, '')).toMatch(/fornecedor e o valor/);
    const semLink = pedido(); semLink.quotes[0].link = '';
    expect(validarPedidoDeCompra(semLink, '')).toMatch(/link/);
    const fretePagoSemValor = pedido(); fretePagoSemValor.quotes[0].fretePago = true;
    expect(validarPedidoDeCompra(fretePagoSemValor, '')).toMatch(/frete/);
  });
  it('produto, setor e quantidade continuam obrigatórios', () => {
    expect(validarPedidoDeCompra({ ...pedido(), quantidade: '0' }, '')).toMatch(/quantidade/);
    expect(validarPedidoDeCompra({ ...pedido(), productName: '' }, '')).toMatch(/produto/);
  });
});

describe('Caixinha: o orçamento é opcional (2026-10-25)', () => {
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
