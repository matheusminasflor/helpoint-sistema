import { describe, expect, it } from 'vitest';
import { projecaoDoMes } from './projecao-do-mes';

const ritmo = (ate: number, mes = 22) => ({ dias_uteis_mes: mes, dias_uteis_ate: ate, ultimo_dado: '2026-10-16' });

describe('projeção do fechamento do mês (R6)', () => {
  it('no ritmo dos dias úteis: R$ 100 mil em 10 de 22 dias úteis fecha em R$ 220 mil', () => {
    const p = projecaoDoMes(100_000, 200_000, ritmo(10));
    expect(p?.valor).toBeCloseTo(220_000);
    expect(p?.pctMeta).toBeCloseTo(110);
    expect(p?.fechado).toBe(false);
  });
  it('mês que já fechou projeta o próprio realizado', () => {
    expect(projecaoDoMes(150_000, 200_000, ritmo(22))).toEqual({ valor: 150_000, pctMeta: 75, fechado: true });
  });
  it('sem dado no mês, ou sem meta, não inventa número', () => {
    expect(projecaoDoMes(0, 200_000, ritmo(0))).toBeNull();
    expect(projecaoDoMes(null, 200_000, ritmo(5))).toBeNull();
    expect(projecaoDoMes(50_000, null, ritmo(5))?.pctMeta).toBeNull();
  });
});
