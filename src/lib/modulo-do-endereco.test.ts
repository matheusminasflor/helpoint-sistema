// A tranca dos setores (2026-10-01): qual módulo abre cada endereço — e o detalhe do chamado fica de
// fora, para quem abriu um chamado para outro setor continuar abrindo o próprio chamado.
import { describe, expect, it } from 'vitest';
import { moduloDoEndereco } from './modulo-do-endereco';

describe('moduloDoEndereco', () => {
  it('cada setor pede o módulo dele', () => {
    expect(moduloDoEndereco('/financeiro/contas-a-pagar')).toBe('showFinanceiro');
    expect(moduloDoEndereco('/ti/licencas')).toBe('showTI');
    expect(moduloDoEndereco('/inventario')).toBe('showInventory');
    expect(moduloDoEndereco('/mkt/fornecedores')).toBe('showMarketing');
    expect(moduloDoEndereco('/compras')).toBe('showCompras');
    expect(moduloDoEndereco('/rh/folha')).toBe('showRH');
  });

  it('a fila do setor é do setor; o detalhe de um chamado, não', () => {
    expect(moduloDoEndereco('/rh/chamados')).toBe('showRH');
    expect(moduloDoEndereco('/rh/chamados/abc-123')).toBeNull();
    expect(moduloDoEndereco('/compras/chamados/abc-123')).toBeNull();
  });

  it('o que é de todo mundo não pede módulo', () => {
    expect(moduloDoEndereco('/inicio')).toBeNull();
    expect(moduloDoEndereco('/helpdesk')).toBeNull();
    expect(moduloDoEndereco('/meu-rh')).toBeNull();
    expect(moduloDoEndereco('/nova-solicitacao')).toBeNull();
  });
});
