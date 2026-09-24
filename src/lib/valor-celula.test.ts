import { describe, expect, it } from 'vitest';
import { interpretarValorDigitado } from './valor-celula';

describe('interpretarValorDigitado', () => {
  it('texto vazio interpreta como NULO — "não informei", nunca zero', () => {
    expect(interpretarValorDigitado('')).toEqual({ tipo: 'nulo' });
    expect(interpretarValorDigitado('   ')).toEqual({ tipo: 'nulo' });
  });

  it('"0" interpreta como o NÚMERO zero — "foi zero", nunca ausência', () => {
    expect(interpretarValorDigitado('0')).toEqual({ tipo: 'numero', valor: 0 });
  });

  it('texto que não é número interpreta como inválido', () => {
    expect(interpretarValorDigitado('abc')).toEqual({ tipo: 'invalido' });
  });

  it('aceita vírgula decimal', () => {
    expect(interpretarValorDigitado('1234,56')).toEqual({ tipo: 'numero', valor: 1234.56 });
  });
});
