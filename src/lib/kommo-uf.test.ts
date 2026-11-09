import { describe, expect, it } from 'vitest';
import { ufDoCliente, ufDoTelefone, ufDoTexto } from '../../supabase/functions/_shared/kommo-uf';

describe('estado do cliente do Kommo', () => {
  it('reconhece a sigla e o nome, escritos de qualquer jeito', () => {
    for (const [texto, uf] of [['MG', 'MG'], ['Mg', 'MG'], ['Minas Gerais', 'MG'], ['minas', 'MG'], ['Goiás', 'GO'], ['Goias', 'GO'],
      ['Brasília', 'DF'], ['Brasília df', 'DF'], ['Distrito federal', 'DF'], ['São paulo', 'SP'], ['Rio de janeiro', 'RJ'],
      ['Mato Grosso', 'MT'], ['Mato Grosso do Sul', 'MS'], ['São Paulo - SP', 'SP']] as const) {
      expect(ufDoTexto(texto), texto).toBe(uf);
    }
  });

  it('ignora o que não é estado', () => {
    for (const texto of ['', 'The message could not be displayed due to API restrictions', 'Jaíba', 'XX', null, 31]) {
      expect(ufDoTexto(texto)).toBeNull();
    }
  });

  it('tira o estado do DDD, com ou sem o 55', () => {
    expect(ufDoTelefone('+553198451869')).toBe('MG');
    expect(ufDoTelefone('(61) 99999-0000')).toBe('DF');
    expect(ufDoTelefone('11974830566')).toBe('SP');
    expect(ufDoTelefone('+351912345678')).toBeNull();
    expect(ufDoTelefone('')).toBeNull();
  });

  it('o campo vale mais que o DDD: Goiás no campo, telefone de Brasília', () => {
    expect(ufDoCliente([null, 'Goiás'], '+5561999990000')).toBe('GO');
    expect(ufDoCliente(['Jaíba'], '+5538988538634')).toBe('MG');
    expect(ufDoCliente([], '')).toBeNull();
  });
});
