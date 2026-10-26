import { describe, expect, it } from 'vitest';
import { ehPedido, estadoDoChamadoParaQuemPediu, estadoDoPedidoParaQuemPediu } from './estado-para-quem-pediu';

describe('o chamado, para quem pediu', () => {
  it('três etapas e o "Esperando você"', () => {
    expect(estadoDoChamadoParaQuemPediu('open', 'tickets')).toMatchObject({ rotulo: 'Recebido', etapa: 0, familia: 'recebido' });
    expect(estadoDoChamadoParaQuemPediu('in_progress', 'tickets')).toMatchObject({ rotulo: 'Com a TI', etapa: 1, familia: 'setor' });
    expect(estadoDoChamadoParaQuemPediu('scheduled', 'rh')).toMatchObject({ rotulo: 'Com o RH', etapa: 1 });
    expect(estadoDoChamadoParaQuemPediu('waiting_user', 'marketing')).toMatchObject({ rotulo: 'Esperando você', familia: 'espera' });
    expect(estadoDoChamadoParaQuemPediu('resolved', 'tickets')).toMatchObject({ rotulo: 'Concluído', etapa: 2, familia: 'concluido' });
  });
  it('a aprovação não aparece: "aguardando aprovação" é "com o setor"', () => {
    expect(estadoDoChamadoParaQuemPediu('waiting_parts', 'financeiro')).toMatchObject({ rotulo: 'Com o Financeiro', familia: 'setor' });
  });
  it('atrasado só enquanto não terminou e não está com quem pediu', () => {
    expect(estadoDoChamadoParaQuemPediu('in_progress', 'marketing', true)).toMatchObject({ rotulo: 'Atrasado', familia: 'atraso' });
    expect(estadoDoChamadoParaQuemPediu('resolved', 'marketing', true).rotulo).toBe('Concluído');
    expect(estadoDoChamadoParaQuemPediu('waiting_user', 'marketing', true).rotulo).toBe('Esperando você');
  });
});

describe('o pedido, para quem pediu', () => {
  it('o pedido com o gestor aparece como "com o setor"', () => {
    expect(estadoDoPedidoParaQuemPediu('reembolso', 'pedido', 'financeiro')).toMatchObject({ rotulo: 'Com o Financeiro', etapa: 1 });
    expect(estadoDoPedidoParaQuemPediu('reembolso', 'aprovada', 'financeiro').rotulo).toBe('Com o Financeiro');
  });
  it('reembolso pago termina; adiantamento pago espera a prestação de contas', () => {
    expect(estadoDoPedidoParaQuemPediu('reembolso', 'paga', 'financeiro')).toMatchObject({ rotulo: 'Concluído', etapa: 2 });
    expect(estadoDoPedidoParaQuemPediu('adiantamento', 'paga', 'financeiro')).toMatchObject({ rotulo: 'Esperando você', familia: 'espera' });
  });
  it('recusado e cancelado', () => {
    expect(estadoDoPedidoParaQuemPediu('compra', 'recusada', 'compras').rotulo).toBe('Recusado');
    expect(estadoDoPedidoParaQuemPediu('compra', 'cancelada', 'compras').rotulo).toBe('Cancelado');
  });
});

describe('pedido ou chamado', () => {
  it('RH, Financeiro e Compras recebem pedido', () => {
    expect(ehPedido('rh')).toBe(true);
    expect(ehPedido('financeiro')).toBe(true);
    expect(ehPedido('compras')).toBe(true);
    expect(ehPedido('tickets')).toBe(false);
    expect(ehPedido('marketing')).toBe(false);
  });
});
