import { describe, expect, it } from 'vitest';
import { sugerirSetores } from './sugerir-setor';

describe('"O que você precisa?" sugere o setor (2026-10-24)', () => {
  it('acha o setor pelas palavras, sem acento e sem caixa', () => {
    expect(sugerirSetores('A impressora não imprime')[0].setor).toBe('ti');
    expect(sugerirSetores('Quero tirar FÉRIAS em dezembro')[0].setor).toBe('rh');
    expect(sugerirSetores('preciso de uma arte para o Instagram')[0].setor).toBe('marketing');
  });
  it('o nome de uma categoria no texto pesa mais e já vem junto', () => {
    const cats = [{ id: 'c1', nome: 'Forteplus', modulo: 'tickets' }, { id: 'c2', nome: 'Reembolso', modulo: 'financeiro' }];
    const s = sugerirSetores('reembolso do uber que paguei', cats);
    expect(s[0]).toMatchObject({ setor: 'financeiro', categoria: { id: 'c2' } });
  });
  it('texto curto ou sem palavra conhecida não sugere nada', () => {
    expect(sugerirSetores('oi')).toEqual([]);
    expect(sugerirSetores('bom dia pessoal')).toEqual([]);
  });
  it('no máximo três setores', () => {
    expect(sugerirSetores('compra de notebook para o treinamento do evento com frete e boleto').length).toBe(3);
  });
});
