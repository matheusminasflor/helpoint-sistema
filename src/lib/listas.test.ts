import { describe, it, expect } from 'vitest';
import { buscarComTeto, TETO_DE_LISTA } from './listas';

function consultaFalsa<T>(linhas: T[]) {
  return {
    limit: (n: number) => Promise.resolve({ data: linhas.slice(0, n), error: null }),
  };
}

describe('buscarComTeto', () => {
  it('quando não cortou, devolve tudo e cortou: false', async () => {
    const linhas = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const resultado = await buscarComTeto(consultaFalsa(linhas), 500);
    expect(resultado).toEqual({ linhas, cortou: false });
  });

  it('com teto+1 linhas disponíveis, devolve só o teto e cortou: true', async () => {
    const linhas = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const resultado = await buscarComTeto(consultaFalsa(linhas), 5);
    expect(resultado.cortou).toBe(true);
    expect(resultado.linhas).toHaveLength(5);
    expect(resultado.linhas).toEqual(linhas.slice(0, 5));
  });

  it('usa TETO_DE_LISTA como teto padrão quando nenhum é passado', async () => {
    const linhas = Array.from({ length: TETO_DE_LISTA + 1 }, (_, i) => ({ id: i }));
    const resultado = await buscarComTeto(consultaFalsa(linhas));
    expect(resultado.cortou).toBe(true);
    expect(resultado.linhas).toHaveLength(TETO_DE_LISTA);
  });
});
