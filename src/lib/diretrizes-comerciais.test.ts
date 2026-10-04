import { describe, expect, it } from 'vitest';
import {
  dataParaMes, descreverBeneficio, erroDaDiretriz, linhaDaDiretriz, mesParaData, separarApuracao,
  type FormularioDeDiretriz, type LinhaDaApuracao,
} from './diretrizes-comerciais';

const linha = (parcial: Partial<LinhaDaApuracao>): LinhaDaApuracao => ({
  diretriz_id: 'd1', diretriz: 'R1', cliente_codigo: 'C1', cliente_nome: 'C1', tabela_base: null,
  competencia: '2031-03-01', quantidade: 0, minimo: 36, falta: 0, atingiu: false, perto: false,
  valor_comprado: 0, beneficio_tipo: 'cashback_valor', beneficio_valor: 100, valor_beneficio: null,
  bonificacao_produto_codigo: null, bonificacao_quantidade: null, condicao: null,
  concessao_id: null, concedido: false, concedido_em: null, concedido_por_nome: null, pedido: null, observacao: null,
  ...parcial,
});

const form = (parcial: Partial<FormularioDeDiretriz>): FormularioDeDiretriz => ({
  nome: '36 OX 6', medir: 'familia', familia_id: 'f1', produto_codigo: '', quantidade_minima: '36',
  beneficio_tipo: 'cashback_valor', beneficio_valor: '100', bonificacao_produto_codigo: '',
  bonificacao_quantidade: '', vigencia_inicio: '2031-01', vigencia_fim: '',
  ...parcial,
});

describe('separarApuracao', () => {
  it('a conceder, perto e concedidos; o R$ soma só os cashbacks', () => {
    const r = separarApuracao([
      linha({ cliente_codigo: 'A', atingiu: true, valor_beneficio: 100 }),
      linha({ cliente_codigo: 'B', atingiu: true, valor_beneficio: null, beneficio_tipo: 'bonificacao' }),
      linha({ cliente_codigo: 'C', perto: true }),
      linha({ cliente_codigo: 'D', atingiu: true, concedido: true, concessao_id: 'k', valor_beneficio: 14 }),
      // Concedido e, depois, uma devolução baixou a quantidade: continua concedido, nunca "perto".
      linha({ cliente_codigo: 'E', perto: true, concedido: true, concessao_id: 'k2', valor_beneficio: 100 }),
    ]);
    expect(r.aConceder.map((l) => l.cliente_codigo)).toEqual(['A', 'B']);
    expect(r.perto.map((l) => l.cliente_codigo)).toEqual(['C']);
    expect(r.concedidos.map((l) => l.cliente_codigo)).toEqual(['D', 'E']);
    expect(r.valorAConceder).toBe(100);
    expect(r.valorConcedido).toBe(114);
  });
});

describe('descreverBeneficio', () => {
  it('escreve os três tipos', () => {
    expect(descreverBeneficio({ beneficio_tipo: 'cashback_valor', beneficio_valor: 100, bonificacao_produto_codigo: null, bonificacao_quantidade: null }))
      .toMatch(/^R\$\s?100,00 de cashback$/);
    expect(descreverBeneficio({ beneficio_tipo: 'cashback_percentual', beneficio_valor: 2.5, bonificacao_produto_codigo: null, bonificacao_quantidade: null }))
      .toBe('2,5% de cashback sobre o que comprou');
    expect(descreverBeneficio(
      { beneficio_tipo: 'bonificacao', beneficio_valor: null, bonificacao_produto_codigo: 'TOM', bonificacao_quantidade: 2 },
      (c) => (c === 'TOM' ? '6.0 LOURO ESCURO' : undefined),
    )).toBe('2 un. de 6.0 LOURO ESCURO (bonificação)');
  });
});

describe('formulário da diretriz', () => {
  it('aceita o exemplo do dono e grava só os campos do tipo escolhido', () => {
    expect(erroDaDiretriz(form({}))).toBeNull();
    expect(linhaDaDiretriz(form({ bonificacao_produto_codigo: 'TOM' }))).toMatchObject({
      familia_id: 'f1', produto_codigo: null, quantidade_minima: 36, beneficio_valor: 100,
      bonificacao_produto_codigo: null, vigencia_inicio: '2031-01-01', vigencia_fim: null,
    });
    expect(linhaDaDiretriz(form({ medir: 'produto', produto_codigo: ' OX6A ', beneficio_tipo: 'bonificacao', bonificacao_produto_codigo: 'TOM', bonificacao_quantidade: '2' })))
      .toMatchObject({ familia_id: null, produto_codigo: 'OX6A', beneficio_valor: null, bonificacao_quantidade: 2 });
  });

  it('recusa o que o banco recusaria, com a frase da tela', () => {
    expect(erroDaDiretriz(form({ nome: ' ' }))).toBe('Dê um nome à diretriz.');
    expect(erroDaDiretriz(form({ familia_id: '' }))).toBe('Escolha a família.');
    expect(erroDaDiretriz(form({ quantidade_minima: '0' }))).toMatch(/maior que zero/);
    expect(erroDaDiretriz(form({ beneficio_tipo: 'cashback_percentual', beneficio_valor: '150' }))).toBe('O percentual vai até 100%.');
    expect(erroDaDiretriz(form({ beneficio_tipo: 'bonificacao' }))).toBe('Escolha o produto da bonificação.');
    expect(erroDaDiretriz(form({ vigencia_fim: '2030-12' }))).toMatch(/antes do início/);
  });

  it('o mês do input vira o dia 1 do banco, e volta', () => {
    expect(mesParaData('2031-03')).toBe('2031-03-01');
    expect(mesParaData('')).toBeNull();
    expect(dataParaMes('2031-03-01')).toBe('2031-03');
    expect(dataParaMes(null)).toBe('');
  });
});
