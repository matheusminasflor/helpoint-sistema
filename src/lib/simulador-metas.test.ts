import { describe, it, expect } from 'vitest';
import { calcularProjecoes, distribuirMetaAnual } from './simulador-metas';

const ZERO12 = Array(12).fill(0);
const FECHADOS_6 = [true, true, true, true, true, true, false, false, false, false, false, false]; // jan-jun fechados

describe('calcularProjecoes', () => {
  // Cenário-base do §1.3: 6 meses fechados somando 600 (média 100), meta
  // simulada de 1800 no ano — usado nos primeiros seis testes.
  const metas = Array(12).fill(150); // total = 1800
  const realizadoAtual = [100, 100, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0]; // R = 600, F = 6
  const realizadoAnterior = [90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90]; // 90/mês

  it('meta do ano é a soma dos doze campos simulados', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).metaDoAno).toBe(1800);
  });

  it('quanto falta é meta do ano menos o realizado acumulado (1800 - 600 = 1200)', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).quantoFalta).toBe(1200);
  });

  it('quanto falta fica NEGATIVO (não zerado) quando a meta já foi superada', () => {
    const metaBaixa = Array(12).fill(40); // total = 480, menor que os 600 já realizados
    expect(calcularProjecoes(metaBaixa, realizadoAtual, realizadoAnterior, FECHADOS_6).quantoFalta).toBe(-120);
  });

  it('necessário por mês nos meses abertos: 1200 / 6 meses abertos = 200', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).necessarioPorMesAbertos).toBe(200);
  });

  it('esforço sobre a média realizada: necessário (200) / média realizada (100) = 2,0', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).esforcoSobreMediaRealizada).toBe(2);
  });

  it('projeção no ritmo atual: média realizada (100) × 12 = 1200', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).projecaoRitmoAtual).toBe(1200);
  });

  it('projeção repetindo o ano anterior: realizado (600) + ano anterior dos 6 meses abertos (90×6=540) = 1140', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).projecaoRepetindoAnoAnterior).toBe(1140);
  });

  // Bordas do §1.3.
  it('ano inteiro aberto (F=0): necessário por mês usa os 12 meses abertos, esforço e ritmo atual são nulos', () => {
    const fechados = Array(12).fill(false);
    const p = calcularProjecoes(Array(12).fill(100), ZERO12, ZERO12, fechados);
    expect(p.necessarioPorMesAbertos).toBe(100); // (1200 - 0) / 12
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBeNull();
  });

  it('ano inteiro fechado (A=0): necessário por mês e esforço são nulos ("ano fechado")', () => {
    const fechados = Array(12).fill(true);
    const realizado = Array(12).fill(100); // R = 1200, F = 12
    const p = calcularProjecoes(Array(12).fill(100), realizado, ZERO12, fechados);
    expect(p.necessarioPorMesAbertos).toBeNull();
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBe(1200); // média (100) × 12, ainda válida
  });

  it('realizado zero nos meses fechados (F>0, R=0): esforço é nulo, nunca divisão por zero', () => {
    const p = calcularProjecoes(metas, ZERO12, realizadoAnterior, FECHADOS_6);
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBe(0);
  });
});

describe('distribuirMetaAnual', () => {
  it('distribui o restante (total - metas fechadas) igualmente pelos meses abertos', () => {
    const metasAtuais = [100, 100, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0]; // 600 nos 6 fechados
    const resultado = distribuirMetaAnual(1800, metasAtuais, FECHADOS_6);
    expect(resultado).not.toBeNull();
    // (1800 - 600) / 6 = 200 por mês aberto; os fechados ficam como estavam.
    expect(resultado!.slice(0, 6)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(resultado!.slice(6)).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it('a soma dos doze depois de distribuir é EXATAMENTE o total pedido, sem centavo perdido', () => {
    const metasAtuais = [111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    const resultado = distribuirMetaAnual(1000, metasAtuais, fechados);
    const soma = resultado!.reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(1000, 10);
  });

  it('a sobra de centavos (arredondamento) vai para o ÚLTIMO mês aberto', () => {
    // 100 / 3 = 33,33... — em centavos, 10000/3 = 3333,33, então 3333 por mês
    // e 1 centavo de sobra (10000 - 3333*3 = 1) no último aberto.
    const metasAtuais = ZERO12;
    const fechados = [true, true, true, true, true, true, true, true, true, false, false, false];
    const resultado = distribuirMetaAnual(100, metasAtuais, fechados);
    expect(resultado!.slice(9)).toEqual([33.33, 33.33, 33.34]);
  });

  it('não distribui (retorna null) quando o total pedido já foi alcançado nos meses fechados', () => {
    const metasAtuais = [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    expect(distribuirMetaAnual(500, metasAtuais, fechados)).toBeNull();
  });

  it('não distribui (retorna null) quando não há mês aberto (ano fechado)', () => {
    expect(distribuirMetaAnual(1000, ZERO12, Array(12).fill(true))).toBeNull();
  });
});
