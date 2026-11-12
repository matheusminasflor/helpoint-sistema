import { describe, expect, it } from 'vitest';
import { faltaParaSubir, type Faixa } from '@/lib/falta-para-subir';

describe('faltaParaSubir', () => {
  const l = (faixa: Faixa, valor: number) => ({ faixa, valor });
  it('B mira o menor da A, C mira o menor da B; A e fora da curva não têm', () => {
    const a1 = l('A', 1000), a2 = l('A', 800), b1 = l('B', 500), b2 = l('B', 300), c1 = l('C', 100), f = l('-', 0);
    const falta = faltaParaSubir([a1, a2, b1, b2, c1, f], (x) => x.valor);
    expect(falta.get(b1)).toBe(300);
    expect(falta.get(b2)).toBe(500);
    expect(falta.get(c1)).toBe(200);
    expect(falta.has(a1)).toBe(false);
    expect(falta.has(f)).toBe(false);
  });
});
