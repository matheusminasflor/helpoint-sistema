import { describe, expect, it } from 'vitest';
import { COLUNAS_DO_MODELO_DE_ESTOQUE, ModeloDeEstoqueInvalido, lerModeloDeEstoque, linhasDoModeloDeEstoque } from './modelo-de-estoque-do-distribuidor';

const produtos = [{ codigo: 'P1', nome: 'Shampoo' }, { codigo: 'P2', nome: 'Mascara' }, { codigo: '1234', nome: 'Condicionador' }];
const saldo = new Map([['P1', 8], ['P2', 3]]);
const cab = [...COLUNAS_DO_MODELO_DE_ESTOQUE];

describe('modelo de estoque do distribuidor (R5)', () => {
  it('sai com o catálogo em ordem de nome e o que o sistema conta', () => {
    expect(linhasDoModeloDeEstoque(produtos, saldo)).toEqual([
      cab, ['1234', 'Condicionador', ''], ['P2', 'Mascara', 3], ['P1', 'Shampoo', 8],
    ]);
  });

  it('lê só o que muda; TENHO vazio e o que já bate não gravam nada', () => {
    const r = lerModeloDeEstoque({ ESTOQUE: [cab, ['P1', 'Shampoo', 5], ['P2', 'Mascara', 3], [1234, 'Condicionador', '12'], ['', '', '']] }, produtos, saldo);
    expect(r.recusadas).toEqual([]);
    expect(r.iguais).toBe(1);
    expect(r.mudam).toEqual([
      { linha: 2, produto_codigo: 'P1', produto_nome: 'Shampoo', tenho: 5, conta: 8 },
      { linha: 4, produto_codigo: '1234', produto_nome: 'Condicionador', tenho: 12, conta: 0 },
    ]);
  });

  it('recusa a linha com código de fora, repetido ou quantidade que não é quantidade', () => {
    const r = lerModeloDeEstoque({ ESTOQUE: [cab, ['X9', '', 1], ['P1', '', 2], ['P1', '', 3], ['P2', '', '-1'], ['', '', 4]] }, produtos, saldo);
    expect(r.mudam.map((l) => l.produto_codigo)).toEqual(['P1']);
    expect(r.recusadas.map((l) => l.linha)).toEqual([2, 4, 5, 6]);
  });

  it('não é o modelo: sem a aba ou com outro cabeçalho', () => {
    expect(() => lerModeloDeEstoque({ Planilha1: [cab] }, produtos, saldo)).toThrow(ModeloDeEstoqueInvalido);
    expect(() => lerModeloDeEstoque({ ESTOQUE: [['CODIGO', 'QTD']] }, produtos, saldo)).toThrow(ModeloDeEstoqueInvalido);
  });
});
