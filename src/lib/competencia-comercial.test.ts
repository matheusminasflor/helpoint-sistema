import { describe, expect, it } from 'vitest';
import {
  competenciaAtual, competenciaCurta, competenciaPorExtenso, dataNaCompetencia,
  deslocarCompetencia, lerCompetencia,
} from '@/lib/competencia-comercial';

describe('competência do Painel do Gestor (manual §2)', () => {
  it('"Mês atual" é o primeiro dia do mês do dia informado', () => {
    expect(competenciaAtual('2026-09-28')).toBe('2026-09-01');
    // O último dia do mês continua no mês — é o caso que `toISOString()` erraria à noite.
    expect(competenciaAtual('2026-09-30')).toBe('2026-09-01');
  });

  it('lê MM/AAAA como a planilha, e também AAAA-MM', () => {
    expect(lerCompetencia('09/2026')).toBe('2026-09-01');
    expect(lerCompetencia('9/2026')).toBe('2026-09-01');
    expect(lerCompetencia(' 2026-09 ')).toBe('2026-09-01');
  });

  it('recusa o que não é mês, em vez de adivinhar', () => {
    expect(lerCompetencia('13/2026')).toBeNull();
    expect(lerCompetencia('00/2026')).toBeNull();
    expect(lerCompetencia('setembro')).toBeNull();
    expect(lerCompetencia('')).toBeNull();
  });

  it('escreve curto e por extenso — o "MÊS EXIBIDO" do manual', () => {
    expect(competenciaCurta('2026-09-01')).toBe('09/2026');
    expect(competenciaPorExtenso('2026-09-01')).toBe('setembro de 2026');
    expect(competenciaPorExtenso('2026-03-01')).toBe('março de 2026');
  });

  it('anda de mês em mês atravessando a virada do ano', () => {
    expect(deslocarCompetencia('2026-12-01', 1)).toBe('2027-01-01');
    expect(deslocarCompetencia('2026-01-01', -1)).toBe('2025-12-01');
    expect(deslocarCompetencia('2026-09-01', 0)).toBe('2026-09-01');
  });

  it('diz se o lançamento cai no mês exibido (§12, "resultado em outro mês")', () => {
    expect(dataNaCompetencia('2026-09-30', '2026-09-01')).toBe(true);
    expect(dataNaCompetencia('2026-10-01', '2026-09-01')).toBe(false);
  });
});
