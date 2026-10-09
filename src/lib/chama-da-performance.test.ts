import { describe, expect, it } from 'vitest';
import { nivelDaChama } from './chama-da-performance';

describe('nivelDaChama (dono, 2026-10-09)', () => {
  it('7 dias: 5, 10 e 15 entregas acendem os três níveis', () => {
    expect(nivelDaChama({ noPrazo: 90, entregas: 4, dias: 7 }).nivel).toBe(0);
    expect(nivelDaChama({ noPrazo: 90, entregas: 5, dias: 7 }).nivel).toBe(1);
    expect(nivelDaChama({ noPrazo: 90, entregas: 10, dias: 7 }).nome).toBe('Pegando fogo');
    expect(nivelDaChama({ noPrazo: 90, entregas: 15, dias: 7 }).nome).toBe('Em chamas');
  });

  it('30 dias: 20, 40 e 60', () => {
    expect(nivelDaChama({ noPrazo: 85, entregas: 19, dias: 30 }).nivel).toBe(0);
    expect(nivelDaChama({ noPrazo: 85, entregas: 20, dias: 30 }).nivel).toBe(1);
    expect(nivelDaChama({ noPrazo: 85, entregas: 40, dias: 30 }).nivel).toBe(2);
    expect(nivelDaChama({ noPrazo: 85, entregas: 60, dias: 30 }).nivel).toBe(3);
  });

  it('volume sem qualidade não acende, e a frase diz o porquê', () => {
    const r = nivelDaChama({ noPrazo: 79, entregas: 30, dias: 7 });
    expect(r.nivel).toBe(0);
    expect(r.frase).toContain('79%');
    expect(nivelDaChama({ noPrazo: null, entregas: 30, dias: 7 }).nivel).toBe(0);
  });

  it('a frase aponta o que falta para o próximo nível', () => {
    expect(nivelDaChama({ noPrazo: 100, entregas: 7, dias: 7 }).frase).toContain('Mais 3');
    expect(nivelDaChama({ noPrazo: 100, entregas: 2, dias: 7 }).frase).toContain('Faltam 3');
  });
});
