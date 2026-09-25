import { describe, expect, it } from 'vitest';
import { legendaCashback, primeiros, tendencia } from './ficha-resumo';

describe('primeiros', () => {
  it('corta no topo e conta o que ficou de fora', () => {
    const { mostradas, restantes } = primeiros([1, 2, 3, 4, 5, 6, 7], 5);
    expect(mostradas).toEqual([1, 2, 3, 4, 5]);
    expect(restantes).toBe(2);
  });

  it('quando cabe tudo, restantes é 0 — e a tela não mostra "ver todos"', () => {
    expect(primeiros([1, 2], 5).restantes).toBe(0);
    expect(primeiros([], 5)).toEqual({ mostradas: [], restantes: 0 });
  });

  it('exatamente n não deixa resto', () => {
    expect(primeiros([1, 2, 3, 4, 5], 5).restantes).toBe(0);
  });
});

describe('tendencia', () => {
  // A razão de existir deste teste: `formatBRL` faz `value || 0`, e a ficha
  // já imprimiu "Anterior: R$ 0,00" embaixo de um aviso que dizia "não há
  // período anterior" (achado ao abrir a tela em 2026-09-24). No farol o
  // mesmo descuido escreveria "0,0%" para "não sei".
  it('sem base de comparação escreve "—", nunca "0,0%"', () => {
    expect(tendencia(null)).toEqual({ texto: '—', direcao: 'sem-base' });
  });

  it('NaN e Infinity também caem em "sem base" — divisão por zero não vira seta', () => {
    expect(tendencia(Number.NaN).direcao).toBe('sem-base');
    expect(tendencia(Number.POSITIVE_INFINITY).direcao).toBe('sem-base');
  });

  it('sobe e desce com vírgula decimal, como o Brasil escreve', () => {
    expect(tendencia(0.184)).toEqual({ texto: '+18,4%', direcao: 'sobe' });
    // Menos é o sinal tipográfico "−" (U+2212), não o hífen: alinha com os
    // dígitos na fonte monoespaçada do farol.
    expect(tendencia(-0.0728)).toEqual({ texto: '−7,3%', direcao: 'desce' });
  });

  it('variação que arredondaria para zero é "estável", sem seta para lado nenhum', () => {
    expect(tendencia(0.0000004)).toEqual({ texto: '0,0%', direcao: 'estavel' });
    expect(tendencia(0)).toEqual({ texto: '0,0%', direcao: 'estavel' });
  });
});

describe('legendaCashback', () => {
  const base = { sem_tabela: false, sem_programa: false, meses_com_direito: 3, falta_proxima_faixa: 2180 };

  it('distingue "sem tabela" de "tabela sem programa" — são causas diferentes', () => {
    expect(legendaCashback({ ...base, sem_tabela: true })).toMatch(/sem tabela de preço/i);
    expect(legendaCashback({ ...base, sem_programa: true })).toMatch(/não tem programa/i);
  });

  it('quem participa vê quantos meses teve direito, no plural certo', () => {
    expect(legendaCashback(base)).toBe('3 meses com direito');
    expect(legendaCashback({ ...base, meses_com_direito: 1 })).toBe('1 mês com direito');
  });

  it('faixa mais alta é dito por extenso — não é "falta R$ 0,00"', () => {
    expect(legendaCashback({ ...base, falta_proxima_faixa: null })).toBe('3 meses com direito · já está na faixa mais alta');
  });

  it('sem linha nenhuma no período não inventa número', () => {
    expect(legendaCashback(null)).toBe('Sem apuração no período.');
  });
});
