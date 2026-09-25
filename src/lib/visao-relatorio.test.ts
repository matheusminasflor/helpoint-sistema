import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gravarVisao, lerVisao, VISAO_PADRAO } from './visao-relatorio';

describe('visao-relatorio', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sem nada guardado, abre na visão padrão (simplificada)', () => {
    expect(lerVisao('ficha-cliente')).toBe('simplificado');
    expect(VISAO_PADRAO).toBe('simplificado');
  });

  it('lembra a escolha, por relatório — mudar a ficha não muda a curva ABC', () => {
    gravarVisao('ficha-cliente', 'analitico');
    expect(lerVisao('ficha-cliente')).toBe('analitico');
    expect(lerVisao('curva-abc')).toBe('simplificado');
  });

  it('valor estranho no storage vira o padrão, não quebra a tela', () => {
    window.localStorage.setItem('helpoint:visao:ficha-cliente', 'detalhadissimo');
    expect(lerVisao('ficha-cliente')).toBe('simplificado');
  });

  // Tela de LEITURA abre simplificada; tela de TRABALHO abre analítica. Em
  // "Metas e carteiras" o diretor vai digitar meta e realizado — abrir numa
  // visão que esconde as duas grades entrega a tela sem a coisa que ela faz
  // (achado da auditoria de 2026-09-25).
  it('a tela de trabalho pode pedir outro padrão', () => {
    expect(lerVisao('diretoria-metas', 'analitico')).toBe('analitico');
  });

  it('o padrão pedido também vale quando o storage tem lixo ou está bloqueado', () => {
    window.localStorage.setItem('helpoint:visao:diretoria-metas', 'seila');
    expect(lerVisao('diretoria-metas', 'analitico')).toBe('analitico');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerVisao('diretoria-metas', 'analitico')).toBe('analitico');
  });

  it('mas a escolha da pessoa vence o padrão pedido — ela clicou', () => {
    gravarVisao('diretoria-metas', 'simplificado');
    expect(lerVisao('diretoria-metas', 'analitico')).toBe('simplificado');
  });

  // Em janela anônima, ou com dados de site bloqueados, `localStorage`
  // LANÇA — não devolve null. Uma preferência de exibição não pode derrubar
  // um relatório inteiro por causa disso.
  it('storage que lança na leitura não derruba o relatório', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerVisao('ficha-cliente')).toBe('simplificado');
  });

  it('storage que lança na escrita não derruba o relatório', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => gravarVisao('ficha-cliente', 'analitico')).not.toThrow();
  });
});
