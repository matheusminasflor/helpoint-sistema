import { describe, expect, it } from 'vitest';
import { compararCarteira } from './carteira-nome';

describe('compararCarteira', () => {
  const conhecidas = ['VIP', 'MG', 'DEMAIS ESTADOS', 'BERCARIO'];

  it('reconhece o mesmo nome, letra por letra', () => {
    expect(compararCarteira('VIP', conhecidas)).toEqual({ existe: true, nomeExistente: 'VIP' });
  });

  it('ignora caixa e acento — "Berçário" é a mesma carteira que "BERCARIO"', () => {
    expect(compararCarteira('Berçário', conhecidas)).toEqual({ existe: true, nomeExistente: 'BERCARIO' });
  });

  it('nome que não existe em nenhuma forma é carteira nova', () => {
    expect(compararCarteira('SUL', conhecidas)).toEqual({ existe: false });
  });
});
