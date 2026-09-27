import { describe, it, expect } from 'vitest';
import { variacaoPercentual } from './variacao';

describe('variacaoPercentual', () => {
  it('conta igual à divisão comum quando o anterior é positivo', () => {
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(50, 100)).toBe(-50);
    expect(variacaoPercentual(100, 100)).toBe(0);
  });

  // O defeito que a função existe para impedir. Sem `Math.abs` isto dava -150%:
  // seta para baixo e vermelho, para uma empresa que saiu do prejuízo.
  it('sair do prejuízo para o lucro é melhora, não piora', () => {
    expect(variacaoPercentual(500, -1000)).toBe(150);
  });

  it('prejuízo menor é melhora', () => {
    expect(variacaoPercentual(-500, -1000)).toBe(50);
  });

  it('prejuízo maior é piora', () => {
    expect(variacaoPercentual(-1500, -1000)).toBe(-50);
  });

  it('entrar no prejuízo vindo do lucro é piora', () => {
    expect(variacaoPercentual(-500, 1000)).toBe(-150);
  });

  // Sem base anterior não se inventa variação: a tela escreve "sem base
  // anterior" em vez de um número que pareceria medido.
  it('devolve nulo sem base anterior', () => {
    expect(variacaoPercentual(500, 0)).toBeNull();
    expect(variacaoPercentual(500, undefined)).toBeNull();
    expect(variacaoPercentual(500, null)).toBeNull();
  });
});
