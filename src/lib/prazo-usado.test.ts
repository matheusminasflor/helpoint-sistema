import { describe, expect, it } from 'vitest';
import { fracaoDoPrazo, prazoUsadoMedio } from './prazo-usado';

describe('prazo usado', () => {
  it('mede a fração do prazo gasta até resolver', () => {
    expect(fracaoDoPrazo(240, 480)).toBe(0.5);
  });

  it('passa de 1 quando resolveu fora do prazo', () => {
    expect(fracaoDoPrazo(720, 480)).toBe(1.5);
  });

  it('ignora prazo sem minutos de expediente', () => {
    expect(fracaoDoPrazo(10, 0)).toBeNull();
  });

  it('dá a média em % e null sem chamados', () => {
    expect(prazoUsadoMedio([0.5, 1])).toBe(75);
    expect(prazoUsadoMedio([])).toBeNull();
  });
});
