import { describe, it, expect } from 'vitest';
import { calcularPeriodoComercial } from './period';

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
