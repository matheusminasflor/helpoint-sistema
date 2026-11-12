import { describe, expect, it } from 'vitest';
import { agruparIndicadores, grupoDaLinha, grupoFechado } from '@/lib/grupos-dos-indicadores';

const nomes = new Map([['a', 'Venda ativa'], ['c', 'Contato inadimplente'], ['n', 'Indicador novo do gestor']]);

describe('grupos dos indicadores', () => {
  it('cada linha vai para o seu grupo', () => {
    expect(grupoDaLinha('valor_vendas', nomes)).toBe('resultado');
    expect(grupoDaLinha('pct_meta', nomes)).toBe('resultado');
    expect(grupoDaLinha('clientes_com_venda', nomes)).toBe('carteira');
    expect(grupoDaLinha('ind:a', nomes)).toBe('atividade');
    expect(grupoDaLinha('ind:c', nomes)).toBe('cobranca');
    expect(grupoDaLinha('aberto:c', nomes)).toBe('cobranca');
  });
  it('indicador novo cai em Ações', () => {
    expect(grupoDaLinha('ind:n', nomes)).toBe('acoes');
  });
  it('fecha só o grupo sem meta e sem registro', () => {
    expect(grupoFechado([{ metrica: 'ind:a', cor: 'sem_meta', realizado: 0 }])).toBe(true);
    expect(grupoFechado([{ metrica: 'ind:a', cor: 'sem_meta', realizado: 3 }])).toBe(false);
    expect(grupoFechado([{ metrica: 'ind:a', cor: 'vermelho', realizado: 0 }])).toBe(false);
  });
  it('agrupa na ordem dos grupos e some com o grupo vazio', () => {
    const g = agruparIndicadores([
      { metrica: 'ind:c', cor: 'sem_meta', realizado: 0 },
      { metrica: 'valor_vendas', cor: 'vermelho', realizado: 10 },
    ], nomes);
    expect(g.map((x) => x.id)).toEqual(['resultado', 'cobranca']);
  });
});
