// As regras do checklist na tela — as mesmas frases que `ped_salvar_checklist` devolve.
import { describe, expect, it } from 'vitest';
import {
  dadosParaOBanco, lerValor, pedidoVazio, problemasDoChecklist, valorDaVenda,
  type ItemDoChecklist, type PedidoDoChecklist,
} from './checklist-de-pedidos';

const ITENS: ItemDoChecklist[] = [
  { id: 'tab', rotulo: 'Tabela de preço', ajuda: null, ordem: 1, pede_justificativa: false, regra: null },
  { id: 'st', rotulo: 'Atualizar ST', ajuda: null, ordem: 2, pede_justificativa: false, regra: 'st' },
  { id: 'bon', rotulo: 'Justificar bonificação', ajuda: null, ordem: 3, pede_justificativa: true, regra: null },
];

const completo = (extra: Partial<PedidoDoChecklist> = {}): PedidoDoChecklist => ({
  ...pedidoVazio(), numero: '5001', valor: '1.234,56',
  respostas: { tab: 'Sim', st: 'Não se aplica', bon: 'Não se aplica' }, ...extra,
});

describe('problemasDoChecklist', () => {
  it('pedido completo pode ser enviado', () => {
    expect(problemasDoChecklist('Maria', [completo()], ITENS)).toEqual([]);
  });

  it('diz o que falta, com as frases do banco', () => {
    expect(problemasDoChecklist('', [completo({ numero: '', respostas: { tab: 'Não', bon: 'Sim' } })], ITENS)).toEqual([
      'Informe o contato do cliente.',
      'Pedido 1: falta o número do pedido no Forteplus.',
      'Pedido 1: "Tabela de preço" está como Não — corrija no Forteplus antes de enviar.',
      'Pedido 1: falta responder "Atualizar ST".',
      'Pedido 1: "Justificar bonificação" pede justificativa.',
    ]);
  });

  it('confere o ST com o espelho, quando há espelho', () => {
    const espelho = { total: 110, st: 10, coloracao: null, tonalizante: null };
    expect(problemasDoChecklist('Maria', [completo({ espelho })], ITENS)).toEqual([
      'Pedido 1: o espelho tem ST de R$ 10,00, e "Atualizar ST" está como Não se aplica.',
    ]);
    expect(problemasDoChecklist('Maria', [completo({ espelho: { ...espelho, st: 0 }, respostas: { tab: 'Sim', st: 'Sim', bon: 'Não se aplica' } })], ITENS))
      .toEqual(['Pedido 1: o espelho não tem ST, e "Atualizar ST" está como Sim.']);
  });
});

describe('valores', () => {
  it('lê o valor em português', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('100')).toBe(100);
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('')).toBeNull();
  });

  it('o valor da venda é só a soma dos pedidos tipo Venda', () => {
    expect(valorDaVenda([completo({ valor: '100' }), completo({ tipo: 'Bonificação', valor: '50' })])).toBe(100);
  });

  it('manda ao banco os pedidos numerados e as respostas por item', () => {
    const dados = dadosParaOBanco(' Maria ', '', '', [completo({ justificativas: { bon: 'x' } })], ITENS);
    expect(dados.contato).toBe('Maria');
    expect(dados.pedidos[0]).toMatchObject({ ordem: 1, valor: 1234.56, desconto: 0 });
    expect(dados.pedidos[0].respostas).toEqual([
      { item_id: 'tab', resposta: 'Sim', justificativa: null },
      { item_id: 'st', resposta: 'Não se aplica', justificativa: null },
      { item_id: 'bon', resposta: 'Não se aplica', justificativa: 'x' },
    ]);
  });
});
