import { describe, expect, it } from 'vitest';
import { inicioDoPeriodo, melhorSequenciaDoMes, nivelDaChama, sequenciaDaSemana } from './chama-da-performance';

// Terça, 13/10/2026, 15h (relógio local).
const terca = new Date(2026, 9, 13, 15, 0);
const em = (dia: number, hora = 10) => new Date(2026, 9, dia, hora, 0).toISOString();

describe('o período (dono, 2026-10-13)', () => {
  it('a semana começa na segunda; o mês no dia 1', () => {
    expect(inicioDoPeriodo('semana', terca).getDate()).toBe(12);
    expect(inicioDoPeriodo('semana', new Date(2026, 9, 18, 9)).getDate()).toBe(12); // domingo
    expect(inicioDoPeriodo('mes', terca).getDate()).toBe(1);
  });
});

describe('a sequência', () => {
  it('a semana passada não conta: na terça só valem segunda e terça', () => {
    const entregas = [em(8), em(9), em(9, 11), em(12), em(13)].map((quando) => ({ quando, noPrazo: true }));
    expect(sequenciaDaSemana(entregas, terca)).toBe(2);
  });
  it('um atrasado zera; os no prazo depois dele recomeçam a conta', () => {
    const entregas = [
      { quando: em(12, 9), noPrazo: true }, { quando: em(12, 10), noPrazo: false },
      { quando: em(13, 9), noPrazo: true }, { quando: em(13, 11), noPrazo: true },
    ];
    expect(sequenciaDaSemana(entregas, terca)).toBe(2);
  });
  it('a melhor do mês zera a cada segunda e a cada atraso', () => {
    const entregas = [
      ...[em(5), em(6), em(7), em(8)].map((quando) => ({ quando, noPrazo: true })), // semana 1: 4
      { quando: em(12), noPrazo: true }, { quando: em(13), noPrazo: true },          // semana 2: 2
    ];
    expect(melhorSequenciaDoMes(entregas, terca)).toBe(4);
  });
});

describe('nivelDaChama: 3 / 6 / 10 seguidos no prazo', () => {
  it('acende nos três níveis', () => {
    expect(nivelDaChama(2).nivel).toBe(0);
    expect(nivelDaChama(3).nome).toBe('Acesa');
    expect(nivelDaChama(6).nome).toBe('Pegando fogo');
    expect(nivelDaChama(10).nome).toBe('Em chamas');
  });
  it('a frase diz o que falta', () => {
    expect(nivelDaChama(1).frase).toContain('Resolva 2');
    expect(nivelDaChama(4).frase).toContain('Mais 2');
  });
});
