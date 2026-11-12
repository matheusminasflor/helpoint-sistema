import { describe, expect, it } from 'vitest';
import { percentualVigente, type PercentualComVigencia } from './comissao';

const lista: PercentualComVigencia[] = [
  { tipo: 'crm', origem: 'salao', percentual: 10, vale_de: '2026-01-01' },
  { tipo: 'crm', origem: 'salao', percentual: 8, vale_de: '2026-12-01' },
  { tipo: 'carteira', origem: 'ESPECIAL', percentual: 0.5, vale_de: '2026-01-01' },
];

describe('percentualVigente (o % vale do mês escolhido em diante)', () => {
  it('antes da mudança vale o antigo; a partir dela, o novo', () => {
    expect(percentualVigente(lista, 'crm', 'salao', '2026-11-01')?.percentual).toBe(10);
    expect(percentualVigente(lista, 'crm', 'salao', '2026-12-01')?.percentual).toBe(8);
    expect(percentualVigente(lista, 'crm', 'salao', '2027-03-01')?.percentual).toBe(8);
  });
  it('sem linha que valha: sem comissão', () => {
    expect(percentualVigente(lista, 'carteira', 'BERCARIO', '2026-11-01')).toBeNull();
    expect(percentualVigente(lista, 'crm', 'salao', '2025-12-01')).toBeNull();
  });
});
