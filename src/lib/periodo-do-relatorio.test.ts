import { describe, expect, it } from 'vitest';
import { instantesDoIntervalo, intervaloDoPeriodo } from './periodo-do-relatorio';

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
