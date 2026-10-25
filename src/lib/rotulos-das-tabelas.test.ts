import { describe, expect, it } from 'vitest';
import { nomesDasColunas, rotularTabela } from './rotulos-das-tabelas';

const tabela = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.querySelector('table') as HTMLTableElement;
};

describe('rótulos das tabelas no celular', () => {
  it('cada célula ganha o nome da coluna, contando colSpan, e a coluna sem nome fica sem rótulo', () => {
    const t = tabela(`<table><thead><tr><th>Produto</th><th colspan="2">Quantidade e preço</th><th></th></tr></thead>
      <tbody><tr><td>Shampoo</td><td>2</td><td>R$ 10</td><td><button>Editar</button></td></tr>
             <tr><td colspan="3">Total</td><td>R$ 20</td></tr></tbody></table>`);
    expect(nomesDasColunas(t)).toEqual(['Produto', 'Quantidade e preço', 'Quantidade e preço', '']);
    rotularTabela(t);
    const [l1, l2] = Array.from(t.tBodies[0].rows);
    expect(Array.from(l1.cells).map((c) => c.getAttribute('data-label'))).toEqual(['Produto', 'Quantidade e preço', 'Quantidade e preço', null]);
    // A célula que ocupa três colunas leva o nome da primeira; a seguinte cai na quarta (sem nome).
    expect(Array.from(l2.cells).map((c) => c.getAttribute('data-label'))).toEqual(['Produto', null]);
  });

  it('tabela sem cabeçalho não ganha rótulo', () => {
    const t = tabela('<table><tbody><tr><td>a</td></tr></tbody></table>');
    rotularTabela(t);
    expect(t.querySelector('td')?.hasAttribute('data-label')).toBe(false);
  });
});
