import { describe, it, expect } from 'vitest';
import { anosParaOPeriodo, metaXRealizadoDoPeriodo } from './metas-do-periodo';

// Março a abril de 2026 (os meses inteiros de 10/03–25/04), com maio de fora.
const dados = {
  metasAno: [
    { ano: 2025, mes: 3, total_realizado: 700, meta: null },
    { ano: 2026, mes: 3, total_realizado: 1000, meta: 9999 }, // importada: perde para a soma das carteiras
    { ano: 2026, mes: 4, total_realizado: 2000, meta: 1800 }, // sem meta por carteira: vale a importada
    { ano: 2026, mes: 5, total_realizado: 4000, meta: 4000 },
  ],
  metasCarteira: [
    { ano: 2026, mes: 3, carteira: 'MG', realizado: 600 },
    { ano: 2026, mes: 4, carteira: 'MG', realizado: 500 },
    { ano: 2026, mes: 5, carteira: 'MG', realizado: 3000 },
  ],
  comMetas: [
    { id: '1', ano: 2026, mes: 3, carteira: 'MG', valor: 800 },
    { id: '2', ano: 2026, mes: 3, carteira: 'VIP', valor: 400 },
    { id: '3', ano: 2026, mes: 3, carteira: null, valor: 77777 }, // meta total: não entra
    { id: '4', ano: 2026, mes: 5, carteira: 'MG', valor: 5000 },
  ],
};

describe('metaXRealizadoDoPeriodo', () => {
  const r = metaXRealizadoDoPeriodo(['2026-03', '2026-04'], dados, ['MG', 'VIP']);

  it('soma os meses do período e deixa maio de fora', () => {
    expect(r.realizadoDoPeriodo).toBe(3000);
  });

  it('a meta do mês é a soma das carteiras; sem carteira, a importada', () => {
    expect(r.metaDoPeriodo).toBe(1200 + 1800);
  });

  it('o mesmo período um ano antes: só março de 2025 tem dado', () => {
    expect(r.mesmoPeriodoAnoAnterior).toBe(700);
  });

  it('carteira no período: realizado e meta dos meses dele, peso sobre o total do período', () => {
    expect(r.carteirasNoPeriodo[0]).toEqual({ nome: 'MG', realizado: 1100, meta: 800, cobertura: 1100 / 800, peso: 1100 / 3000 });
    // VIP não tem realizado: nulo, nunca zero.
    expect(r.carteirasNoPeriodo[1]).toMatchObject({ nome: 'VIP', realizado: null, meta: 400, cobertura: null, peso: null });
  });

  it('mês a mês só com os meses do período', () => {
    expect(r.carteirasMesAMes[0].porMes).toHaveLength(2);
    expect(r.carteirasMesAMes[0].porMes[0]).toEqual({ peso: 0.6, meta: 800, cobertura: 0.75 });
  });

  it('período sem dado nenhum é nulo, não zero', () => {
    expect(metaXRealizadoDoPeriodo(['2030-01'], dados, []).realizadoDoPeriodo).toBeNull();
  });
});

describe('anosParaOPeriodo', () => {
  it('os anos dos meses e os anteriores, para o "um ano antes"', () => {
    expect(anosParaOPeriodo(['2025-12', '2026-01'])).toEqual([2024, 2025, 2026]);
  });
});
