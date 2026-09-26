import { describe, it, expect } from 'vitest';
import { SETORES, SETOR_VALUES, isSetor, normalizarSetor, rotuloDoSetor } from './setores';

describe('setores', () => {
  it('tem os nove setores que o convite já oferecia', () => {
    expect(SETOR_VALUES).toEqual([
      'ti', 'marketing', 'comercial', 'rh', 'financeiro',
      'producao', 'expedicao', 'educacional', 'qualidade',
    ]);
  });

  it('não repete valor nem rótulo', () => {
    expect(new Set(SETORES.map(s => s.value)).size).toBe(SETORES.length);
    expect(new Set(SETORES.map(s => s.label)).size).toBe(SETORES.length);
  });

  it('normaliza o que o banco guardou de texto livre', () => {
    // O caso real: `ti` em 3 perfis e `TI` em 2, e um teto gravado em `ti`.
    expect(normalizarSetor('TI')).toBe('ti');
    expect(normalizarSetor('  Ti  ')).toBe('ti');
    expect(normalizarSetor('Produção')).toBeNull(); // o valor é `producao`, sem acento
    expect(normalizarSetor('producao')).toBe('producao');
  });

  it('devolve nulo para setor que não existe, em vez de inventar um', () => {
    expect(normalizarSetor('vendas')).toBeNull();
    expect(normalizarSetor('')).toBeNull();
    expect(normalizarSetor(null)).toBeNull();
    expect(normalizarSetor(undefined)).toBeNull();
  });

  it('isSetor só aceita o valor canônico', () => {
    expect(isSetor('ti')).toBe(true);
    expect(isSetor('TI')).toBe(false);
    expect(isSetor(null)).toBe(false);
    expect(isSetor(42)).toBe(false);
  });

  it('mostra o setor herdado como está, e não como "—"', () => {
    expect(rotuloDoSetor('ti')).toBe('TI');
    expect(rotuloDoSetor('TI')).toBe('TI');
    expect(rotuloDoSetor('vendas')).toBe('vendas');
    expect(rotuloDoSetor(null)).toBe('Sem setor');
    expect(rotuloDoSetor('   ')).toBe('Sem setor');
  });
});
