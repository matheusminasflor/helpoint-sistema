import { describe, expect, it } from 'vitest';
import { TITULOS, diasDesde } from './notas-para-resolver';

describe('notas para resolver', () => {
  it('conta os dias corridos desde a aprovação, no horário local', () => {
    expect(diasDesde(new Date(2026, 10, 1, 23, 50).toISOString(), '2026-11-06')).toBe(5);
    expect(diasDesde(new Date(2026, 10, 6, 0, 10).toISOString(), '2026-11-06')).toBe(0);
  });
  it('nunca fica negativo', () => {
    expect(diasDesde(new Date(2026, 10, 7, 10, 0).toISOString(), '2026-11-06')).toBe(0);
  });
  it('dá um rótulo a cada situação', () => {
    expect(TITULOS.corrigir.rotulo).toBe('Nota não encontrada');
  });
});
