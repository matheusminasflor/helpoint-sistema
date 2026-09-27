import { describe, it, expect } from 'vitest';
import {
  ASSET_STATUS_LABEL, ativoEmEstoque, ativoEmUso, ativoEntraEmChamado,
} from './asset-status';

describe('asset-status', () => {
  // A guarda do defeito de origem: o seletor de ativo do chamado filtrava
  // `status === 'active'`, e o formulário grava `in_stock`/`in_use`. Ativo
  // cadastrado pela tela nunca aparecia no chamado.
  it('os dois nomes de "em uso" contam como em uso', () => {
    expect(ativoEmUso('in_use')).toBe(true);
    expect(ativoEmUso('active')).toBe(true);
  });

  it('os dois nomes de "em estoque" contam como em estoque', () => {
    expect(ativoEmEstoque('in_stock')).toBe(true);
    expect(ativoEmEstoque('inactive')).toBe(true);
  });

  it('em uso e em estoque não se confundem', () => {
    expect(ativoEmUso('in_stock')).toBe(false);
    expect(ativoEmEstoque('in_use')).toBe(false);
    expect(ativoEmUso('maintenance')).toBe(false);
    expect(ativoEmEstoque('maintenance')).toBe(false);
  });

  // Em manutenção ENTRA: é o que mais gera chamado, e deixá-lo fora era metade do
  // defeito original.
  it('entra no chamado tudo menos descartado', () => {
    for (const s of ['in_use', 'active', 'in_stock', 'inactive', 'maintenance']) {
      expect(ativoEntraEmChamado(s)).toBe(true);
    }
    expect(ativoEntraEmChamado('decommissioned')).toBe(false);
  });

  it('os seis valores têm rótulo, e os sinônimos dizem a mesma coisa', () => {
    expect(Object.keys(ASSET_STATUS_LABEL)).toHaveLength(6);
    expect(ASSET_STATUS_LABEL.active).toBe(ASSET_STATUS_LABEL.in_use);
    expect(ASSET_STATUS_LABEL.inactive).toBe(ASSET_STATUS_LABEL.in_stock);
  });
});
