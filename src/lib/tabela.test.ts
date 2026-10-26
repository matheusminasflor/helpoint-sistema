import { describe, expect, it } from 'vitest';
import { casaBusca, celulaParaPlanilha, ordenarPor, proximaOrdem } from './tabela';

describe('ordenar e buscar nas tabelas (regra 4, 2026-10-24)', () => {
  const linhas = [{ n: 'Ébano', v: 10 }, { n: 'abacaxi', v: 2 }, { n: '', v: null }, { n: 'Chamado 10', v: 2 }, { n: 'Chamado 9', v: 7 }];

  it('ordena texto como gente lê: sem acento, sem caixa e número como número', () => {
    expect(ordenarPor(linhas, (l) => l.n, 'asc').map((l) => l.n)).toEqual(['abacaxi', 'Chamado 9', 'Chamado 10', 'Ébano', '']);
  });
  it('vazio vai para o fim nas duas direções, e empate mantém a ordem', () => {
    expect(ordenarPor(linhas, (l) => l.v, 'desc').map((l) => l.v)).toEqual([10, 7, 2, 2, null]);
    expect(ordenarPor(linhas, (l) => l.v, 'asc').map((l) => l.n)).toEqual(['abacaxi', 'Chamado 10', 'Chamado 9', 'Ébano', '']);
  });
  it('o clique na coluna vai de crescente a decrescente e volta à ordem da tela', () => {
    const a = proximaOrdem(null, 'prazo');
    expect(a).toEqual({ coluna: 'prazo', direcao: 'asc' });
    const b = proximaOrdem(a, 'prazo');
    expect(b).toEqual({ coluna: 'prazo', direcao: 'desc' });
    expect(proximaOrdem(b, 'prazo')).toBeNull();
    expect(proximaOrdem(b, 'titulo')).toEqual({ coluna: 'titulo', direcao: 'asc' });
  });
  it('a busca ignora acento e caixa', () => {
    expect(casaBusca(['Impressão da Expedição', 192], 'expedicao')).toBe(true);
    expect(casaBusca(['Impressão', 192], '192')).toBe(true);
    expect(casaBusca(['Impressão'], 'rede')).toBe(false);
    expect(casaBusca(['x'], '  ')).toBe(true);
  });
});

describe('a célula da tela na planilha (R6, exportar sem refazer conta)', () => {
  it('dinheiro e número brasileiros viram número; o resto fica como a tela mostra', () => {
    expect(celulaParaPlanilha('R$ 1.234,56')).toBe(1234.56);
    expect(celulaParaPlanilha(' 1.234 ')).toBe(1234);
    expect(celulaParaPlanilha('-12,5')).toBe(-12.5);
    expect(celulaParaPlanilha('R$ 0,00')).toBe(0);
    expect(celulaParaPlanilha('48%')).toBe('48%');
    expect(celulaParaPlanilha('26/10/2026')).toBe('26/10/2026');
    expect(celulaParaPlanilha('08.319.138/0001-60')).toBe('08.319.138/0001-60');
    expect(celulaParaPlanilha('—')).toBeNull();
    expect(celulaParaPlanilha('')).toBeNull();
  });
});
