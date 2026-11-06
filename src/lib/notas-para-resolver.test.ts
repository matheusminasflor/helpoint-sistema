import { describe, expect, it } from 'vitest';
import { diasDesde, tituloDaNota } from './notas-para-resolver';

describe('notas para resolver', () => {
  it('conta os dias desde a aprovação', () => {
    expect(diasDesde('2026-11-01T23:50:00Z', '2026-11-06')).toBe(5);
    expect(diasDesde('2026-11-06T10:00:00Z', '2026-11-06')).toBe(0);
  });
  it('nunca fica negativo', () => {
    expect(diasDesde('2026-11-07T10:00:00Z', '2026-11-06')).toBe(0);
  });
  it('dá um rótulo a cada situação', () => {
    expect(tituloDaNota({ situacao: 'corrigir' }).rotulo).toBe('Nota não encontrada');
  });
});
