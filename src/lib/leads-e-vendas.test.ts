import { describe, expect, it } from 'vitest';
import { destaquesDoPeriodo, ehMesInteiro, leadsPorSemana, periodoCurto, resumoDoKommo, rotuloDaSemana, type LinhaKommo, type LinhaPerda } from './leads-e-vendas';
import { somarDias } from './ti-equipe';

// A semana de 26/10 a 01/11/2026, como o Kommo mostra (conferido no conector em 2026-11-07).
const linhas: LinhaKommo[] = [
  { dia: '2026-10-26', funil: 'salao', chegaram: 6, ganhas: 0, perdidas: 1, valor_ganho: 0 },
  { dia: '2026-11-01', funil: 'salao', chegaram: 5, ganhas: 0, perdidas: 1, valor_ganho: 0 },
  { dia: '2026-10-28', funil: 'distribuidor', chegaram: 4, ganhas: 1, perdidas: 4, valor_ganho: 0 },
  { dia: '2026-10-29', funil: 'consumidor', chegaram: 2, ganhas: 0, perdidas: 1, valor_ganho: 0 },
  { dia: '2026-10-30', funil: 'sem_triagem', chegaram: 7, ganhas: 1, perdidas: 0, valor_ganho: 5096 },
  // Fora do período: não entra.
  { dia: '2026-10-25', funil: 'distribuidor', chegaram: 11, ganhas: 6, perdidas: 1, valor_ganho: 0 },
];
const perdas: LinhaPerda[] = [
  { dia: '2026-10-28', funil: 'distribuidor', motivo: null, quantos: 2 },
  { dia: '2026-11-01', funil: 'salao', motivo: null, quantos: 2 },
  { dia: '2026-10-28', funil: 'distribuidor', motivo: 'Comprado do concorrente', quantos: 1 },
  { dia: '2026-10-29', funil: 'consumidor', motivo: 'Comprado do concorrente', quantos: 1 },
  { dia: '2026-10-28', funil: 'distribuidor', motivo: 'Orçamento insuficiente', quantos: 1 },
  { dia: '2026-10-25', funil: 'distribuidor', motivo: 'Outro', quantos: 1 },
];
const semana = { de: '2026-10-26', ate: '2026-11-01' };

describe('resumoDoKommo', () => {
  const r = resumoDoKommo(linhas, perdas, semana);
  it('soma por segmento só os dias do período', () => {
    expect(r.total).toMatchObject({ chegaram: 24, ganhas: 2, perdidas: 7, valor: 5096 });
    expect(r.segmentos.find((s) => s.k === 'salao')).toMatchObject({ chegaram: 11, ganhas: 0, perdidas: 2, taxa: 0 });
  });
  it('a taxa é ganhas sobre as que fecharam; sem nenhuma fechada, não tem', () => {
    expect(r.total.taxa).toBeCloseTo(2 / 9);
    expect(r.segmentos.find((s) => s.k === 'distribuidor')!.taxa).toBeCloseTo(0.2);
    expect(resumoDoKommo([{ ...linhas[0], ganhas: 0, perdidas: 0 }], [], semana).total.taxa).toBeNull();
  });
  it('motivos do mais comum ao menos, "Sem motivo anotado" por último', () => {
    expect(r.motivos).toEqual([
      { motivo: 'Comprado do concorrente', quantos: 2 },
      { motivo: 'Orçamento insuficiente', quantos: 1 },
      { motivo: 'Sem motivo anotado', quantos: 4 },
    ]);
  });
  it('sem linha no período, temDados é falso', () => {
    expect(resumoDoKommo(linhas, perdas, { de: '2026-12-01', ate: '2026-12-31' }).temDados).toBe(false);
  });
});

describe('datas', () => {
  it('uma forma só, como o Google Analytics', () => {
    expect(periodoCurto(semana)).toBe('26 out – 1 nov 2026');
    expect(periodoCurto({ de: '2026-10-19', ate: '2026-10-25' }, false)).toBe('19 – 25 out');
    expect(periodoCurto({ de: '2026-12-28', ate: '2027-01-03' })).toBe('28 dez 2026 – 3 jan 2027');
    expect(periodoCurto({ de: '2026-11-07', ate: '2026-11-07' })).toBe('7 nov 2026');
  });
  it('a semana do gráfico vai de segunda a domingo', () => {
    expect(rotuloDaSemana('2026-11-01', somarDias)).toBe('26/10–01/11');
  });
  it('mês inteiro só de 1 ao último dia', () => {
    expect(ehMesInteiro({ de: '2026-10-01', ate: '2026-10-31' })).toBe(true);
    expect(ehMesInteiro({ de: '2026-02-01', ate: '2026-02-28' })).toBe(true);
    expect(ehMesInteiro({ de: '2026-10-01', ate: '2026-10-30' })).toBe(false);
    expect(ehMesInteiro(semana)).toBe(false);
  });
  it('leads por semana somam segunda a domingo', () => {
    expect(leadsPorSemana(linhas, ['2026-10-25', '2026-11-01'], somarDias)).toEqual([
      { semana: '2026-10-25', chegaram: 11 }, { semana: '2026-11-01', chegaram: 24 },
    ]);
  });
});

describe('destaquesDoPeriodo', () => {
  it('segmento que puxou, ganhas e perdidas, tráfego', () => {
    const atual = resumoDoKommo(linhas, perdas, semana);
    const anterior = resumoDoKommo(linhas, perdas, { de: '2026-10-19', ate: '2026-10-25' });
    const d = destaquesDoPeriodo(atual, anterior, { investimento: 338.14, investimentoAntes: 639.5, custoPorVisita: 0.285 });
    expect(d.map((x) => x.tom)).toEqual(['bom', 'ruim', 'info']);
    expect(d[0].texto).toBe('Salão de beleza puxou os leads: 11 de 24, eram 0 no período anterior.');
    expect(d[1].texto).toBe('2 vendas ganhas e 7 perdidas; 4 sem motivo anotado no Kommo.');
    expect(d[2].texto).toContain('47% a menos');
  });
  it('sem números, sem destaque', () => {
    const vazio = resumoDoKommo([], [], semana);
    expect(destaquesDoPeriodo(vazio, vazio, { investimento: null, investimentoAntes: null, custoPorVisita: null })).toEqual([]);
  });
});
