import { describe, expect, it } from 'vitest';
import { compararCarteira, normalizarNomeCarteira } from './carteira-nome';

// Frente 7d (.scratch/plano-frente7d-renomear-carteira.md §1): o banco tem a
// mesma normalização, em `normalizar_nome_carteira` (migration
// 20261025050000_carteira_renomear.sql, via `extensions.unaccent`). Estes
// casos são os MESMOS provados em `comercial_carteira_renomear.test.sql`
// (bloco 0) — as duas suítes têm de bater, senão "Berçário" digitado na
// tela não casa com "BERCARIO" gravado pelo HISTORICO_METAS.json.
describe('normalizarNomeCarteira', () => {
  it('tira acento, maiúsculo, sem espaço nas pontas', () => {
    expect(normalizarNomeCarteira(' Berçário ')).toBe('BERCARIO');
  });

  it('acento composto e espaço interno preservado', () => {
    expect(normalizarNomeCarteira('São Paulo')).toBe('SAO PAULO');
  });
});

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
