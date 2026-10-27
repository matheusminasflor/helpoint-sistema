import { describe, it, expect } from 'vitest';
import { diferencaParaUltima, fraseDaDiferenca, porUnidade, comUnidade } from './unidades-de-compra';

describe('unidade da compra', () => {
  it('o orçamento diz o que o valor quer dizer', () => {
    expect(porUnidade('kg')).toBe('por kg');
    expect(porUnidade('un')).toBe('por unidade');
    expect(comUnidade(2.5, 'kg')).toBe('2,5 kg');
  });

  it('a diferença para a última compra, na mesma unidade', () => {
    expect(diferencaParaUltima(44.8, 'kg', { unitario: 40, unidade: 'kg' })).toBe(12);
    expect(diferencaParaUltima(36, 'kg', { unitario: 40, unidade: 'kg' })).toBe(-10);
    expect(fraseDaDiferenca(12)).toBe('12% mais caro que a última compra');
    expect(fraseDaDiferenca(-10)).toBe('10% mais barato que a última compra');
  });

  it('não compara unidade diferente, nem sem a última compra', () => {
    expect(diferencaParaUltima(40, 'kg', { unitario: 0.04, unidade: 'g' })).toBeNull();
    expect(diferencaParaUltima(40, 'kg', null)).toBeNull();
    expect(diferencaParaUltima(40, 'kg', { unitario: null, unidade: 'kg' })).toBeNull();
  });
});
