import { describe, expect, it } from 'vitest';
import { corDoFarol, retornoSemDono } from '@/hooks/useComercialLancamentos';

describe('retornoSemDono', () => {
  it('quem está numa carteira é dono do retorno; quem saiu, não', () => {
    const comCarteira = new Set(['jacqueline']);
    expect(retornoSemDono({ vendedor_id: 'jacqueline' }, comCarteira)).toBe(false);
    expect(retornoSemDono({ vendedor_id: 'julia' }, comCarteira)).toBe(true);
  });
  it('enquanto as carteiras não foram lidas, ninguém vira órfão', () => {
    expect(retornoSemDono({ vendedor_id: 'julia' }, new Set())).toBe(false);
  });
});

describe('corDoFarol (a mesma régua de com_cor_do_farol)', () => {
  it('sem meta, verde, amarelo a partir de 70%, vermelho abaixo', () => {
    expect(corDoFarol(100, null)).toBe('sem_meta');
    expect(corDoFarol(100, 0)).toBe('sem_meta');
    expect(corDoFarol(100, 100)).toBe('verde');
    expect(corDoFarol(70, 100)).toBe('amarelo');
    expect(corDoFarol(69.99, 100)).toBe('vermelho');
  });
});
