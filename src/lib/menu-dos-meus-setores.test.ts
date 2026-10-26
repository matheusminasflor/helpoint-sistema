import { describe, expect, it } from 'vitest';
import { separarOMenu } from './menu-dos-meus-setores';

const g = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('menu do celular: os meus setores em cima (rodada 2, decisão 3)', () => {
  const todos = g('inicio', 'ti', 'qualidade', 'rh', 'mkt', 'financeiro', 'compras', 'comercial', 'diretoria', 'config');

  it('a vendedora vê Início e Comercial em cima; o resto recolhido; Configurações no fim', () => {
    const m = separarOMenu(todos, ['comercial']);
    expect(ids(m.meus)).toEqual(['inicio', 'comercial', 'diretoria']);
    expect(ids(m.outros)).toEqual(['ti', 'qualidade', 'rh', 'mkt', 'financeiro', 'compras']);
    expect(ids(m.fim)).toEqual(['config']);
  });

  it('o módulo de chamado vira o grupo do menu (tickets é TI, marketing é mkt)', () => {
    expect(ids(separarOMenu(todos, ['tickets', 'marketing']).meus)).toEqual(['inicio', 'ti', 'mkt', 'diretoria']);
  });

  it('sem setor nenhum, tudo à vista como antes', () => {
    const m = separarOMenu(todos, []);
    expect(m.outros).toEqual([]);
    expect(ids(m.meus)).toEqual(ids(todos).filter((i) => i !== 'config'));
  });
});
