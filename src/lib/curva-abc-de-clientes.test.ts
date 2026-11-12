import { describe, expect, it } from 'vitest';
import { faixasDosClientes, inicioDosUltimosMeses } from '@/lib/curva-abc-de-clientes';

describe('faixasDosClientes', () => {
  it('A até 80%, B até 95%, C o resto, e quem não faturou fica fora', () => {
    const r = faixasDosClientes([
      { nome: 'c', faturamento: 10 }, { nome: 'a', faturamento: 70 }, { nome: 'b', faturamento: 15 },
      { nome: 'd', faturamento: 5 }, { nome: 'z', faturamento: 0 },
    ]);
    expect(r.map((x) => `${x.nome}${x.faixa}`)).toEqual(['aA', 'bA', 'cB', 'dC', 'z-']);
  });
});

describe('inicioDosUltimosMeses', () => {
  it('os últimos 6 meses incluem o mês de "até" e viram o ano', () => {
    expect(inicioDosUltimosMeses('2026-11-30', 6)).toBe('2026-06-01');
    expect(inicioDosUltimosMeses('2026-03-15', 6)).toBe('2025-10-01');
  });
});
