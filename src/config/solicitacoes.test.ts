import { describe, expect, it } from 'vitest';
import { categoriaVirouPedido, deQuemEAVez, terminou } from './solicitacoes';

describe('solicitações: de quem é a vez (2026-10-25)', () => {
  it('o que pede gestor começa com o gestor; os outros, com o setor', () => {
    expect(deQuemEAVez('reembolso', 'pedido')).toBe('com o gestor');
    expect(deQuemEAVez('arte', 'pedido')).toBe('com o Marketing');
    expect(deQuemEAVez('rh_documento', 'pedido')).toBe('com o RH');
  });
  it('depois da aprovação, quem age a seguir', () => {
    expect(deQuemEAVez('acesso', 'aprovada')).toBe('com a TI');
    expect(deQuemEAVez('adiantamento', 'paga')).toBe('com você: preste contas');
    expect(deQuemEAVez('reembolso', 'paga')).toBeNull();
  });
  it('o reembolso termina ao ser pago; o adiantamento não', () => {
    expect(terminou('reembolso', 'paga')).toBe(true);
    expect(terminou('adiantamento', 'paga')).toBe(false);
    expect(terminou('arte', 'recusada')).toBe(true);
  });
});

describe('categoria que virou pedido (2026-10-25)', () => {
  it('acha pelo setor e pelo nome, sem acento nem caixa', () => {
    expect(categoriaVirouPedido('marketing', 'Criação de Arte')).toBe('arte');
    expect(categoriaVirouPedido('tickets', 'Acesso/Permissões')).toBe('acesso');
    expect(categoriaVirouPedido('financeiro', 'Reembolso')).toBe('reembolso');
  });
  it('o resto continua chamado', () => {
    expect(categoriaVirouPedido('marketing', 'Rótulos/Embalagens')).toBeNull();
    expect(categoriaVirouPedido('rh', 'Reembolso')).toBeNull();
  });
});
