import { describe, expect, it } from 'vitest';
import { ateHojeComOAnterior, instantesDoIntervalo, intervaloDoPeriodo, periodoAnterior } from './periodo-do-relatorio';

describe('período dos relatórios', () => {
  it('semana: de segunda a domingo, inclusive quando hoje é domingo', () => {
    expect(intervaloDoPeriodo('semana', '2026-10-14')).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
    expect(intervaloDoPeriodo('semana', '2026-10-18')).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
    expect(intervaloDoPeriodo('semana', '2026-10-12')).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
  });
  it('mês: do dia 1 ao último', () => {
    expect(intervaloDoPeriodo('mes', '2026-02-10')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });
  it('personalizado: datas trocadas se desviram, e sem fim vale um dia só', () => {
    expect(intervaloDoPeriodo('personalizado', '2026-10-14', { de: '2026-10-20', ate: '2026-10-01' }))
      .toEqual({ de: '2026-10-01', ate: '2026-10-20' });
    expect(intervaloDoPeriodo('personalizado', '2026-10-14', { de: '2026-10-05' })).toEqual({ de: '2026-10-05', ate: '2026-10-05' });
  });
  it('instantes: do começo do primeiro dia ao começo do dia seguinte ao último, no horário do Brasil', () => {
    expect(instantesDoIntervalo({ de: '2026-10-01', ate: '2026-10-31' }))
      .toEqual({ desde: '2026-10-01T00:00:00-03:00', antes: '2026-11-01T00:00:00-03:00' });
  });
});

describe('periodoAnterior (etapa 5)', () => {
  it('o mês de antes, inteiro', () => {
    expect(periodoAnterior('mes', { de: '2026-03-01', ate: '2026-03-31' })).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });
  it('a semana de antes', () => {
    expect(periodoAnterior('semana', { de: '2026-10-19', ate: '2026-10-25' })).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
  });
  it('o personalizado: o mesmo tamanho, colado antes', () => {
    expect(periodoAnterior('personalizado', { de: '2026-10-11', ate: '2026-10-20' })).toEqual({ de: '2026-10-01', ate: '2026-10-10' });
  });
});

describe('ateHojeComOAnterior (etapa 5)', () => {
  it('o mês corrente vai até hoje, e o anterior até o mesmo dia', () => {
    expect(ateHojeComOAnterior('mes', { de: '2026-10-01', ate: '2026-10-31' }, '2026-10-25'))
      .toEqual({ atual: { de: '2026-10-01', ate: '2026-10-25' }, anterior: { de: '2026-09-01', ate: '2026-09-25' } });
  });
  it('fevereiro não passa do último dia', () => {
    expect(ateHojeComOAnterior('mes', { de: '2026-03-01', ate: '2026-03-31' }, '2026-03-30').anterior)
      .toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });
  it('período que já terminou fica inteiro', () => {
    expect(ateHojeComOAnterior('mes', { de: '2026-09-01', ate: '2026-09-30' }, '2026-10-25').atual).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
  });
});
