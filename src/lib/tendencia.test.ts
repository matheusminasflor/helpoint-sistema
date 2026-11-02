import { describe, expect, it } from 'vitest';
import { barrasDaTendencia } from './tendencia';

describe('barrasDaTendencia', () => {
  it('até 31 dias: uma barra por dia, sem o fim de semana vazio (o que teve chamado fica)', () => {
    const pontos = [
      { date: '2026-10-30', opened: 3, resolved: 2 }, // sexta
      { date: '2026-10-31', opened: 0, resolved: 0 }, // sábado vazio: sai
      { date: '2026-11-01', opened: 1, resolved: 0 }, // domingo com chamado: fica
      { date: '2026-11-02', opened: 0, resolved: 0 }, // segunda vazia: fica (dia útil)
    ];
    expect(barrasDaTendencia(pontos).map((b) => b.rotulo)).toEqual(['30/10', '01/11', '02/11']);
  });

  it('acima de 31 dias: soma por semana, a partir da segunda', () => {
    const pontos = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(2026, 8, 1 + i); // 01/09/2026 (terça) em diante
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: iso, opened: 1, resolved: 1 };
    });
    const barras = barrasDaTendencia(pontos);
    expect(barras[0]).toMatchObject({ date: '2026-08-31', opened: 6, rotulo: 'sem. 31/08' });
    expect(barras[1]).toMatchObject({ date: '2026-09-07', opened: 7 });
    expect(barras.reduce((a, b) => a + b.opened, 0)).toBe(40);
  });
});
