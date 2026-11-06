import { describe, expect, it } from 'vitest';
import { tresRespostas } from './tres-respostas';

describe('tresRespostas', () => {
  it('responde quanto vendi e quanto falta, com a meta de Demais Estados', () => {
    const r = tresRespostas({ vendido: 125515.28, meta: 214680, faturado: 109823.07, condicao: 15692.21, aFaturar: 36421.06 });
    expect(r.percentual).toBe(58);
    expect(r.falta).toBeCloseTo(89164.72, 2);
    expect(r.larguraFaturado).toBeCloseTo(51.16, 1);
    expect(r.larguraCondicao).toBeCloseTo(7.31, 1);
    expect(r.larguraAFaturar).toBeCloseTo(16.97, 1);
  });
  it('A faturar não entra no que foi vendido', () => {
    expect(tresRespostas({ vendido: 100, meta: 200, faturado: 100, condicao: 0, aFaturar: 100 }).falta).toBe(100);
  });
  it('acima da meta, não falta nada e a barra para em 100%', () => {
    const r = tresRespostas({ vendido: 300, meta: 200, faturado: 250, condicao: 50, aFaturar: 40 });
    expect(r.falta).toBe(0);
    expect(r.percentual).toBe(150);
    expect(r.larguraFaturado + r.larguraCondicao + r.larguraAFaturar).toBe(100);
  });
  it('sem meta, não inventa percentual', () => {
    const r = tresRespostas({ vendido: 100, meta: null, faturado: 100, condicao: 0, aFaturar: 0 });
    expect(r.temMeta).toBe(false);
    expect(r.percentual).toBeNull();
    expect(r.falta).toBeNull();
  });
});
