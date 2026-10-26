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
  it('a compra: quem aprova, depois Compras até a nota; comprada ou recusada, termina (rodada 2)', () => {
    expect(deQuemEAVez('compra', 'pedido')).toBe('com quem aprova');
    expect(deQuemEAVez('compra', 'aprovada')).toBe('com Compras, para comprar');
    expect(deQuemEAVez('compra', 'paga')).toBe('com Compras, esperando a nota');
    expect(terminou('compra', 'paga')).toBe(false);
    expect(terminou('compra', 'concluida')).toBe(true);
    expect(terminou('compra', 'recusada')).toBe(true);
  });
  it('o reembolso termina ao ser pago; o adiantamento não', () => {
    expect(terminou('reembolso', 'paga')).toBe(true);
    expect(terminou('adiantamento', 'paga')).toBe(false);
    expect(terminou('arte', 'recusada')).toBe(true);
  });
});

describe('categoria que virou pedido (2026-10-25)', () => {
  it('acha pelo setor e pelo nome, sem acento nem caixa', () => {
    expect(categoriaVirouPedido('financeiro', 'Reembolso')).toBe('reembolso');
    expect(categoriaVirouPedido('financeiro', 'ADIANTAMENTO')).toBe('adiantamento');
  });
  it('arte e acesso voltaram a ser chamado (rodada 3)', () => {
    expect(categoriaVirouPedido('marketing', 'Criação de Arte')).toBeNull();
    expect(categoriaVirouPedido('tickets', 'Acesso/Permissões')).toBeNull();
  });
  it('toda categoria de Compras é compra, que é pedido (rodada 2)', () => {
    expect(categoriaVirouPedido('compras', 'Equipamentos e TI')).toBe('compra');
    expect(categoriaVirouPedido('compras', 'Caixinha')).toBe('compra');
  });
  it('o resto continua chamado', () => {
    expect(categoriaVirouPedido('marketing', 'Rótulos/Embalagens')).toBeNull();
    expect(categoriaVirouPedido('rh', 'Reembolso')).toBeNull();
  });
});
