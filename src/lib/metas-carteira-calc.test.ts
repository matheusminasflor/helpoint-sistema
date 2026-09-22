import { describe, expect, it } from 'vitest';
import { calcularCobertura, calcularPeso } from './metas-carteira-calc';

describe('calcularPeso', () => {
  it('divide realizado da carteira pelo total do mês', () => {
    expect(calcularPeso(1000, 3500)).toBeCloseTo(0.2857, 4);
  });
  it('é nulo quando o total do mês é nulo (ainda sem dado)', () => {
    expect(calcularPeso(1000, null)).toBeNull();
  });
  it('é nulo quando o total do mês é zero — nunca Infinity', () => {
    expect(calcularPeso(1000, 0)).toBeNull();
  });
  it('é nulo quando a carteira não tem realizado (ausência, não zero)', () => {
    expect(calcularPeso(null, 3500)).toBeNull();
  });
});

describe('calcularCobertura', () => {
  it('divide realizado pela meta', () => {
    expect(calcularCobertura(1000, 2000)).toBe(0.5);
  });
  it('é nula quando a meta é nula (mês sem meta definida) — nunca 0%', () => {
    expect(calcularCobertura(1000, null)).toBeNull();
  });
  it('é nula quando a meta é zero — nunca divisão por zero', () => {
    expect(calcularCobertura(1000, 2000 * 0)).toBeNull();
  });
  it('é nula quando o realizado ainda não foi importado — ausência, nunca 0%', () => {
    expect(calcularCobertura(null, 2000)).toBeNull();
  });
});
