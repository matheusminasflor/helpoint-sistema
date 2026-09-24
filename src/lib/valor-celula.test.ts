import { describe, expect, it } from 'vitest';
import { interpretarValorDigitado } from './valor-celula';

describe('interpretarValorDigitado', () => {
  it('texto vazio interpreta como NULO — "não informei", nunca zero', () => {
    expect(interpretarValorDigitado('')).toEqual({ tipo: 'nulo' });
    expect(interpretarValorDigitado('   ')).toEqual({ tipo: 'nulo' });
  });

  it('"0" interpreta como o NÚMERO zero — "foi zero", nunca ausência', () => {
    expect(interpretarValorDigitado('0')).toEqual({ tipo: 'numero', valor: 0 });
  });

  it('texto que não é número interpreta como inválido', () => {
    expect(interpretarValorDigitado('abc')).toEqual({ tipo: 'invalido' });
  });

  it('aceita vírgula decimal', () => {
    expect(interpretarValorDigitado('1234,56')).toEqual({ tipo: 'numero', valor: 1234.56 });
  });

  // Frente 7b: type="number" saiu (não formata em reais); type="text" não
  // sanitiza sozinho, então a função passa a aceitar as três formas que o
  // diretor digita ou vê refletidas de volta.
  it('aceita "311.254,03" — ponto de milhar e vírgula decimal, a forma formatada', () => {
    expect(interpretarValorDigitado('311.254,03')).toEqual({ tipo: 'numero', valor: 311254.03 });
  });

  it('aceita "311254,03" — sem ponto de milhar, vírgula decimal', () => {
    expect(interpretarValorDigitado('311254,03')).toEqual({ tipo: 'numero', valor: 311254.03 });
  });

  it('aceita "311254.03" — ponto decimal, a forma que sai do banco', () => {
    expect(interpretarValorDigitado('311254.03')).toEqual({ tipo: 'numero', valor: 311254.03 });
  });

  // MUTAÇÃO: se a função tratasse o "." de "311.254,03" como decimal (em vez
  // de descartá-lo por haver vírgula), o resultado ficaria preso a "311" e
  // fração — nunca trezentos e onze mil. A asserção de valor exato acima já
  // reprova essa leitura errada; esta prova isola o sintoma (ordem de
  // grandeza), para não depender só da igualdade estrita.
  it('MUTAÇÃO: "311.254,03" não pode virar ~311 — o ponto antes da vírgula é milhar, nunca decimal', () => {
    const resultado = interpretarValorDigitado('311.254,03');
    expect(resultado.tipo).toBe('numero');
    if (resultado.tipo === 'numero') {
      expect(resultado.valor).toBeGreaterThan(300000);
    }
  });
});
