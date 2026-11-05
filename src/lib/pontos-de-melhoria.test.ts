import { describe, expect, it } from 'vitest';
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { pontosDeMelhoria } from './pontos-de-melhoria';

const chamado = (id: number, parcial: Partial<ChamadoDoPeriodo>): ChamadoDoPeriodo => ({
  id: String(id), ticket_number: id, title: `Chamado ${id}`, status: 'open', priority: 'medium', category: 'Hardware', subcategory: null,
  created_at: '2026-11-01T12:00:00Z', sla_estourado: false, agendou_vencido: false, assignee: { email: id % 2 ? 'a@x' : 'b@x' }, ...parcial,
});
const varios = (de: number, n: number, parcial: Partial<ChamadoDoPeriodo>) => Array.from({ length: n }, (_, i) => chamado(de + i, parcial));

describe('pontos de melhoria da TI', () => {
  it('sem chamado, nenhum ponto', () => {
    expect(pontosDeMelhoria({ chamados: [], totalAnterior: 10 })).toEqual([]);
  });

  it('alta de 20% vira atenção, com a conta na frase', () => {
    const chamados = varios(1, 36, { category: 'Rede' });
    const [equipe] = pontosDeMelhoria({ chamados, totalAnterior: 30 });
    expect(equipe.cor).toBe('perigo');
    expect(equipe.texto).toBe('2 atendentes com cerca de 18 chamados cada um. O volume subiu 20% em relação ao período anterior: de 30 para 36.');
  });

  it('abaixo de 20%, ou sem período anterior, é só observação', () => {
    const chamados = varios(1, 33, { category: 'Rede' });
    expect(pontosDeMelhoria({ chamados, totalAnterior: 30 })[0].cor).toBe('info');
    expect(pontosDeMelhoria({ chamados, totalAnterior: null })[0].cor).toBe('info');
  });

  it('período anterior pequeno demais não vira alta', () => {
    const [equipe] = pontosDeMelhoria({ chamados: varios(1, 148, { category: 'Rede' }), totalAnterior: 13 });
    expect(equipe.cor).toBe('info');
    expect(equipe.texto).not.toContain('subiu');
  });

  it('assunto repetido soma pelo caminho e mostra os setores', () => {
    const chamados = [
      ...varios(1, 3, { category: 'Forteplus', subcategory: 'Correções e Ajustes', setor: 'financeiro' }),
      ...varios(4, 2, { category: 'Forteplus', subcategory: 'Correções e Ajustes', setor: 'ti' }),
      ...varios(6, 4, { category: 'Rede', setor: 'ti' }),
    ];
    const repetidos = pontosDeMelhoria({ chamados, totalAnterior: null }).filter((p) => p.selo === 'Repetição');
    expect(repetidos).toHaveLength(1);
    expect(repetidos[0].titulo).toBe('Forteplus › Correções e Ajustes');
    expect(repetidos[0].texto).toBe('5 chamados no período: 3 de Financeiro, 2 da TI.');
  });

  it('"Outros" não conta como assunto: vira revisar', () => {
    const chamados = [...varios(1, 4, { category: 'Hardware', subcategory: 'Outros' }), ...varios(5, 2, { category: 'Sem categoria' })];
    const pontos = pontosDeMelhoria({ chamados, totalAnterior: null });
    expect(pontos.some((p) => p.selo === 'Repetição')).toBe(false);
    expect(pontos.find((p) => p.id === 'sem-categoria')?.texto).toBe('6 chamados ficaram em "Outros" ou sem categoria (100% do total).');
  });

  it('setor só aparece com pelo menos 20% dos chamados', () => {
    const chamados = [...varios(1, 2, { setor: 'comercial', category: 'A' }), ...varios(3, 8, { category: 'B' })];
    expect(pontosDeMelhoria({ chamados, totalAnterior: null }).find((p) => p.id === 'setor')?.texto).toBe('2 dos 10 chamados vieram desse setor (20%).');
    const poucos = [...varios(1, 1, { setor: 'comercial', category: 'A' }), ...varios(2, 9, { category: 'B' })];
    expect(pontosDeMelhoria({ chamados: poucos, totalAnterior: null }).some((p) => p.id === 'setor')).toBe(false);
  });
});
