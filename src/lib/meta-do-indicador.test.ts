import { describe, expect, it } from 'vitest';
import { foraDaMeta, textoDaMeta } from './meta-do-indicador';

describe('meta fixa do indicador (2026-10-25)', () => {
  it('teto onde menos é melhor, piso onde mais é melhor; na meta não é fora', () => {
    expect(foraDaMeta(30, 24, 'menos')).toBe(true);
    expect(foraDaMeta(24, 24, 'menos')).toBe(false);
    expect(foraDaMeta(85, 90, 'mais')).toBe(true);
    expect(foraDaMeta(90, 90, 'mais')).toBe(false);
  });
  it('sem meta ou sem número, nunca fora', () => {
    expect(foraDaMeta(null, 10, 'mais')).toBe(false);
    expect(foraDaMeta(5, undefined, 'menos')).toBe(false);
  });
  it('o texto diz o sentido', () => {
    expect(textoDaMeta('24h', 'menos')).toBe('meta: até 24h');
    expect(textoDaMeta('90%', 'mais')).toBe('meta: pelo menos 90%');
  });
});
