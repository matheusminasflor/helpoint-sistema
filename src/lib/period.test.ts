import { describe, it, expect } from 'vitest';
import {
  avisoDeMesesInteiros, calcularPeriodoComercial, erroDoIntervalo, intervaloDoPeriodoRapido, intervaloEmDatas,
  mesesDoIntervalo, mesesInteirosDoIntervalo, rotuloDoIntervalo,
} from './period';

describe('calcularPeriodoComercial', () => {
  it('ano todo: 1º de janeiro a 31 de dezembro do ano escolhido', () => {
    expect(calcularPeriodoComercial('ano', 2025, 1)).toEqual({ de: '2025-01-01', ate: '2025-12-31' });
  });

  it('um mês: do 1º ao último dia do mês, respeitando fevereiro (28, e 29 em ano bissexto) e meses de 30', () => {
    expect(calcularPeriodoComercial('mes', 2025, 2)).toEqual({ de: '2025-02-01', ate: '2025-02-28' });
    expect(calcularPeriodoComercial('mes', 2024, 2)).toEqual({ de: '2024-02-01', ate: '2024-02-29' }); // 2024 é bissexto
    expect(calcularPeriodoComercial('mes', 2025, 4)).toEqual({ de: '2025-04-01', ate: '2025-04-30' });
    expect(calcularPeriodoComercial('mes', 2025, 12)).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
  });

  it('últimos 3: janela corrida terminando no mês em curso — o `ano` escolhido no seletor é irrelevante', () => {
    // "hoje" é 2026-09-22 (mês em curso = setembro/2026); o `ano` passado (2020) não entra na conta.
    expect(calcularPeriodoComercial('ultimos3', 2020, 1, '2026-09-22')).toEqual({ de: '2026-07-01', ate: '2026-09-30' });
  });

  it('últimos 6: mesma janela corrida, 6 meses', () => {
    expect(calcularPeriodoComercial('ultimos6', 2020, 1, '2026-09-22')).toEqual({ de: '2026-04-01', ate: '2026-09-30' });
  });

  it('últimos 3 virando o ano: hoje em fevereiro, a janela começa em dezembro do ano anterior', () => {
    expect(calcularPeriodoComercial('ultimos3', 2020, 1, '2026-02-10')).toEqual({ de: '2025-12-01', ate: '2026-02-28' });
  });

  it('últimos 6 virando o ano: hoje em março, a janela começa em outubro do ano anterior', () => {
    expect(calcularPeriodoComercial('ultimos6', 2020, 1, '2026-03-05')).toEqual({ de: '2025-10-01', ate: '2026-03-31' });
  });

  it('últimos 3 no primeiro mês do ano (janeiro): a janela inteira fica no ano anterior', () => {
    expect(calcularPeriodoComercial('ultimos3', 2020, 1, '2026-01-15')).toEqual({ de: '2025-11-01', ate: '2026-01-31' });
  });
});

describe('calcularPeriodoComercial — personalizado', () => {
  it('devolve o intervalo escolhido, inclusive atravessando o ano', () => {
    expect(calcularPeriodoComercial('personalizado', 2026, 1, '2026-10-03', { de: '2025-11-15', ate: '2026-02-10' }))
      .toEqual({ de: '2025-11-15', ate: '2026-02-10' });
  });

  it('sem intervalo, ou com intervalo invertido, cai no ano todo — nunca numa data quebrada', () => {
    expect(calcularPeriodoComercial('personalizado', 2026, 1, '2026-10-03')).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
    expect(calcularPeriodoComercial('personalizado', 2026, 1, '2026-10-03', { de: '2026-05-10', ate: '2026-05-01' }))
      .toEqual({ de: '2026-01-01', ate: '2026-12-31' });
  });
});

describe('erroDoIntervalo', () => {
  it('aceita intervalo de um dia só e intervalo comum', () => {
    expect(erroDoIntervalo('2026-10-03', '2026-10-03')).toBeNull();
    expect(erroDoIntervalo('2026-01-01', '2026-10-03')).toBeNull();
  });

  it('recusa intervalo incompleto', () => {
    expect(erroDoIntervalo('', '2026-10-03')).toBe('Preencha as duas datas.');
    expect(erroDoIntervalo('2026-10-03', null)).toBe('Preencha as duas datas.');
  });

  it('recusa fim antes do início', () => {
    expect(erroDoIntervalo('2026-10-03', '2026-10-02')).toBe('A data final não pode ser antes da inicial.');
  });

  it('recusa dia que não existe e texto fora do formato', () => {
    expect(erroDoIntervalo('2026-02-30', '2026-03-01')).toBe('Data inválida.');
    expect(erroDoIntervalo('03/10/2026', '2026-10-03')).toBe('Data inválida.');
  });
});

describe('intervaloEmDatas', () => {
  it('vai do começo do primeiro dia ao fim do último, no fuso local', () => {
    const { inicio, fim } = intervaloEmDatas({ de: '2026-09-30', ate: '2026-10-03' });
    expect([inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours()]).toEqual([2026, 8, 30, 0]);
    expect([fim.getFullYear(), fim.getMonth(), fim.getDate(), fim.getHours(), fim.getMinutes()]).toEqual([2026, 9, 3, 23, 59]);
  });
});

describe('intervaloDoPeriodoRapido', () => {
  it('este mês: do dia 1 ao último dia do mês de hoje (fevereiro bissexto incluído)', () => {
    expect(intervaloDoPeriodoRapido('este_mes', '2026-10-03')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(intervaloDoPeriodoRapido('este_mes', '2024-02-10')).toEqual({ de: '2024-02-01', ate: '2024-02-29' });
  });

  it('este trimestre: os três meses do trimestre de hoje, nas quatro faixas', () => {
    expect(intervaloDoPeriodoRapido('este_trimestre', '2026-01-01')).toEqual({ de: '2026-01-01', ate: '2026-03-31' });
    expect(intervaloDoPeriodoRapido('este_trimestre', '2026-06-30')).toEqual({ de: '2026-04-01', ate: '2026-06-30' });
    expect(intervaloDoPeriodoRapido('este_trimestre', '2026-08-15')).toEqual({ de: '2026-07-01', ate: '2026-09-30' });
    expect(intervaloDoPeriodoRapido('este_trimestre', '2026-10-03')).toEqual({ de: '2026-10-01', ate: '2026-12-31' });
  });

  it('este ano: 1º de janeiro a 31 de dezembro do ano de hoje', () => {
    expect(intervaloDoPeriodoRapido('este_ano', '2026-10-03')).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
  });

  it('o Comercial usa a mesma conta, e o `ano` do seletor não interfere', () => {
    expect(calcularPeriodoComercial('este_trimestre', 2020, 1, '2026-10-03')).toEqual({ de: '2026-10-01', ate: '2026-12-31' });
  });
});

describe('meses inteiros (decisão do dono, 2026-10-03: o que é mensal não se rateia)', () => {
  it('os meses que o intervalo toca, inclusive virando o ano', () => {
    expect(mesesDoIntervalo({ de: '2026-03-10', ate: '2026-04-25' })).toEqual(['2026-03', '2026-04']);
    expect(mesesDoIntervalo({ de: '2025-11-30', ate: '2026-01-02' })).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(mesesDoIntervalo({ de: '2026-03-10', ate: '2026-03-10' })).toEqual(['2026-03']);
  });

  it('o intervalo vira os meses inteiros: do dia 1 ao último dia do mês do fim', () => {
    expect(mesesInteirosDoIntervalo({ de: '2026-03-10', ate: '2026-04-25' })).toEqual({ de: '2026-03-01', ate: '2026-04-30' });
    expect(mesesInteirosDoIntervalo({ de: '2024-02-10', ate: '2024-02-11' })).toEqual({ de: '2024-02-01', ate: '2024-02-29' });
  });

  it('a frase diz quais meses foram considerados — e some quando o intervalo já é de meses inteiros', () => {
    expect(avisoDeMesesInteiros('Meta e cashback são mensais', { de: '2026-03-10', ate: '2026-04-25' }))
      .toBe('Meta e cashback são mensais — considerados os meses de março a abril.');
    expect(avisoDeMesesInteiros('A meta é mensal', { de: '2026-03-10', ate: '2026-03-20' }))
      .toBe('A meta é mensal — considerado o mês de março inteiro.');
    expect(avisoDeMesesInteiros('A meta é mensal', { de: '2025-12-10', ate: '2026-01-20' }))
      .toBe('A meta é mensal — considerados os meses de dezembro de 2025 a janeiro de 2026.');
    expect(avisoDeMesesInteiros('A meta é mensal', { de: '2026-10-01', ate: '2026-12-31' })).toBeNull();
    expect(avisoDeMesesInteiros('A meta é mensal', null)).toBeNull();
  });

  it('o rótulo do intervalo é dd/mm/aaaa, sem passar por Date (regra 4)', () => {
    expect(rotuloDoIntervalo({ de: '2026-03-10', ate: '2026-04-25' })).toBe('10/03/2026 a 25/04/2026');
  });
});
