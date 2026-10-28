import { describe, expect, it } from 'vitest';
import { proximoDiaDaContaFixa } from './financeiro';

// O mesmo cálculo do gerador do banco (`fin_gerar_contas_fixas`, 20270212050000): conta a partir do 1º dia.
describe('proximoDiaDaContaFixa', () => {
  const c = (primeiro_dia: string, geradas: number, frequencia: 'mensal' | 'anual' = 'mensal', ate: string | null = null) =>
    proximoDiaDaContaFixa({ primeiro_dia, geradas, frequencia, ate });

  it('mensal: soma os meses já gerados', () => {
    expect(c('2026-10-05', 0)).toBe('2026-10-05');
    expect(c('2026-10-05', 3)).toBe('2027-01-05');
  });

  it('dia 31 vira o último dia do mês curto e volta a 31 depois', () => {
    expect(c('2026-01-31', 1)).toBe('2026-02-28');
    expect(c('2026-01-31', 2)).toBe('2026-03-31');
    expect(c('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('anual: soma anos', () => {
    expect(c('2026-03-15', 2, 'anual')).toBe('2028-03-15');
  });

  it('depois da data final, não há próximo', () => {
    expect(c('2026-01-10', 3, 'mensal', '2026-03-10')).toBeNull();
    expect(c('2026-01-10', 2, 'mensal', '2026-03-10')).toBe('2026-03-10');
  });
});
