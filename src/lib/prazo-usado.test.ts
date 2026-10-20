import { describe, expect, it } from 'vitest';
import { fracaoDoPrazo, prazoUsadoMedio } from './prazo-usado';

describe('prazo usado', () => {
  const aberto = '2026-10-20T08:00:00Z';
  const prazo = '2026-10-20T16:00:00Z';

  it('mede a fração do prazo gasta até resolver', () => {
    expect(fracaoDoPrazo(aberto, '2026-10-20T12:00:00Z', prazo)).toBe(0.5);
    expect(fracaoDoPrazo(aberto, '2026-10-20T15:48:00Z', prazo)).toBeCloseTo(0.975);
  });

  it('passa de 1 quando resolveu fora do prazo', () => {
    expect(fracaoDoPrazo(aberto, '2026-10-20T20:00:00Z', prazo)).toBe(1.5);
  });

  it('ignora prazo igual ou anterior à abertura', () => {
    expect(fracaoDoPrazo(aberto, prazo, aberto)).toBeNull();
  });

  it('dá a média em % e null sem chamados', () => {
    expect(prazoUsadoMedio([0.5, 1])).toBe(75);
    expect(prazoUsadoMedio([])).toBeNull();
  });
});
