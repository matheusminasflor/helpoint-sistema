import { describe, expect, it } from 'vitest';
import { gastoNoPeriodo, gastoPorMes } from './gasto-de-compras';

const c = (quando: string, setor: string | null, valor: number) => ({ quando: new Date(quando).toISOString(), setor, valor });
const compras = [
  c('2026-09-10T12:00:00', 'ti', 100),
  c('2026-10-02T12:00:00', 'ti', 50),
  c('2026-10-05T12:00:00', 'marketing', 300),
  c('2026-10-20T12:00:00', null, 10),
  c('2025-10-05T12:00:00', 'marketing', 999),
];

describe('gasto de Compras (dono, 2026-10-13)', () => {
  it('no período: total e setores do maior para o menor', () => {
    const r = gastoNoPeriodo(compras, new Date('2026-10-01T00:00:00'), new Date('2026-10-31T23:59:59'));
    expect(r.total).toBe(360);
    expect(r.porSetor.map((s) => s.setor)).toEqual(['marketing', 'ti', 'sem_setor']);
  });
  it('mês a mês, só do ano escolhido', () => {
    const meses = gastoPorMes(compras, 2026);
    expect(meses[8].total).toBe(100);
    expect(meses[9].total).toBe(360);
    expect(meses[9].porSetor.marketing).toBe(300);
    expect(meses.reduce((s, m) => s + m.total, 0)).toBe(460);
  });
});
