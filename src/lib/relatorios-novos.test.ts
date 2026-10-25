import { describe, expect, it } from 'vitest';
import { agrupar, diasEntre, maisLentoPorGrupo, projetarCaixa, situacaoDoRetorno } from './relatorios-novos';

describe('relatórios da etapa 5', () => {
  it('agrupa e soma, o maior primeiro', () => {
    expect(agrupar([{ f: 'A', v: 10 }, { f: 'B', v: 30 }, { f: 'A', v: 5 }], (l) => l.f, (l) => l.v))
      .toEqual([{ grupo: 'B', total: 30, linhas: 1 }, { grupo: 'A', total: 15, linhas: 2 }]);
  });
  it('o mais lento é o de maior média, sem contar quem não tem número', () => {
    expect(maisLentoPorGrupo([{ g: 'Ana', d: 1 }, { g: 'Ana', d: 3 }, { g: 'Bia', d: 2.5 }, { g: null, d: 9 }, { g: 'Bia', d: null }],
      (l) => l.g, (l) => l.d)).toEqual({ grupo: 'Bia', media: 2.5 });
  });
  it('a projeção parte do saldo e põe o vencido na primeira semana', () => {
    const p = projetarCaixa(1000, [
      { semana: '2026-10-19', entra: 200, sai: 100, entra_vencido: 0, sai_vencido: 300 },
      { semana: '2026-10-26', entra: 0, sai: 900, entra_vencido: 0, sai_vencido: 0 },
    ]);
    expect(p.map((s) => s.saldo)).toEqual([800, -100]);
  });
  it('retorno: atrasado, hoje, próximo', () => {
    expect(situacaoDoRetorno('2026-10-24', '2026-10-25')).toBe('atrasado');
    expect(situacaoDoRetorno('2026-10-25', '2026-10-25')).toBe('hoje');
    expect(situacaoDoRetorno('2026-10-26', '2026-10-25')).toBe('proximo');
  });
  it('dias de uma ausência, inclusive', () => { expect(diasEntre('2026-10-30', '2026-11-02')).toBe(4); });
});
