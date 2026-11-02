import { describe, expect, it } from 'vitest';
import { degrausAoMudar, metaNoDia, notaDaMeta } from './metas-da-ti';

const pct = (v: number) => `${v}%`;

describe('a meta da TI: uma por indicador, que o gestor muda (2026-11-02)', () => {
  it('sem nada gravado, vale a padrão em qualquer dia: SLA 80%', () => {
    expect(metaNoDia(undefined, 'sla_cumprido', '2026-10-25')).toBe(80);
    expect(metaNoDia(undefined, 'sla_cumprido', '2027-06-30')).toBe(80);
  });

  it('o cartão diz só a meta, sem mês', () => {
    expect(notaDaMeta(undefined, 'sla_cumprido', '2026-11-01', pct)).toBe('meta: pelo menos 80%');
    expect(notaDaMeta(undefined, 'tempo_medio_horas', '2026-11-01', (v) => `${v} h`)).toBe('meta: até 24 h');
  });

  it('mudar em janeiro vale de janeiro em diante; novembro e dezembro continuam com a que valia', () => {
    const escada = degrausAoMudar([], 80, 85, '2027-01-15');
    expect(escada).toEqual([{ a_partir_de: '2026-01-01', meta: 80 }, { a_partir_de: '2027-01-01', meta: 85 }]);
    const gravados = new Map([['sla_cumprido', escada]]);
    expect(metaNoDia(gravados, 'sla_cumprido', '2026-12-31')).toBe(80);
    expect(metaNoDia(gravados, 'sla_cumprido', '2027-02-10')).toBe(85);
    // Mudar de novo no mesmo mês troca a do mês, sem acumular.
    expect(degrausAoMudar(escada, 80, 88, '2027-01-20')).toEqual([{ a_partir_de: '2026-01-01', meta: 80 }, { a_partir_de: '2027-01-01', meta: 88 }]);
  });
});
