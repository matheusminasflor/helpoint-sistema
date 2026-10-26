import { describe, expect, it } from 'vitest';
import { notasDoCliente, type ItemDeNota } from './notas-do-cliente';

const item = (filial: string, documento: string, emissao: string, valor: number, produto = 'Shampoo', classe = 'venda'): ItemDeNota =>
  ({ filial, documento, serie: '1', emissao, classe, produto_nome: produto, quantidade: 2, valor_nota: valor });

describe('notas do cliente (R5, ficha do distribuidor)', () => {
  it('junta os itens da mesma nota e ordena da mais nova', () => {
    const notas = notasDoCliente([
      item('MF', '10', '2026-09-01', 100), item('MF', '11', '2026-10-01', 50, 'Mascara'), item('MF', '11', '2026-10-01', 30),
    ]);
    expect(notas.map((n) => [n.documento, n.valor, n.itens])).toEqual([['11', 80, 2], ['10', 100, 1]]);
    expect(notas[0].produtos).toEqual(['2× Mascara', '2× Shampoo']);
  });
  it('o mesmo número em filiais diferentes são duas notas', () => {
    expect(notasDoCliente([item('MF', '10', '2026-09-01', 100), item('INBRAS', '10', '2026-09-01', 40)])).toHaveLength(2);
  });
});
