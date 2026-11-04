import { describe, expect, it } from 'vitest';
import { separarOMenu } from './menu-dos-meus-setores';

const g = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('menu: os meus setores em cima, os outros recolhidos', () => {
  const todos = g('inicio', 'trabalho', 'empresa', 'ti', 'qualidade', 'rh', 'mkt', 'financeiro', 'compras', 'comercial', 'diretoria', 'config');

  it('a vendedora vê o Comercial; o resto recolhido; Diretoria e Configurações no fim', () => {
    const m = separarOMenu(todos, ['comercial']);
    expect(ids(m.topo)).toEqual(['inicio', 'trabalho', 'empresa']);
    expect(ids(m.meus)).toEqual(['comercial']);
    expect(ids(m.outros)).toEqual(['ti', 'qualidade', 'rh', 'mkt', 'financeiro', 'compras']);
    expect(ids(m.fim)).toEqual(['diretoria', 'config']);
  });

  it('o módulo de chamado vira o grupo do menu (tickets é TI, marketing é mkt)', () => {
    expect(ids(separarOMenu(todos, ['tickets', 'marketing']).meus)).toEqual(['ti', 'mkt']);
  });

  it('sem setor nenhum, todos os setores à vista', () => {
    const m = separarOMenu(todos, []);
    expect(m.outros).toEqual([]);
    expect(ids(m.meus)).toEqual(['ti', 'qualidade', 'rh', 'mkt', 'financeiro', 'compras', 'comercial']);
  });
});
