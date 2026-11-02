import { describe, expect, it } from 'vitest';
import { escadaDe, metaNoDia, notaDaMeta } from './metas-da-ti';

const pct = (v: number) => `${v}%`;

describe('a meta da TI em degraus (rodada 3, 2026-11-02)', () => {
  it('a escada padrão do SLA: 80% em nov-dez, 85% em jan-fev, 90% a partir de março', () => {
    expect(metaNoDia(undefined, 'sla_cumprido', '2026-11-01')).toBe(80);
    expect(metaNoDia(undefined, 'sla_cumprido', '2026-12-31')).toBe(80);
    expect(metaNoDia(undefined, 'sla_cumprido', '2027-01-01')).toBe(85);
    expect(metaNoDia(undefined, 'sla_cumprido', '2027-06-30')).toBe(90);
    // Antes do primeiro degrau (a semana de outubro), vale o primeiro.
    expect(metaNoDia(undefined, 'sla_cumprido', '2026-10-25')).toBe(80);
  });

  it('degrau gravado substitui a escada inteira daquele indicador, e só dele', () => {
    const gravados = new Map([['sla_cumprido', [{ a_partir_de: '2026-11-01', meta: 75 }]]]);
    expect(metaNoDia(gravados, 'sla_cumprido', '2027-06-30')).toBe(75);
    expect(metaNoDia(gravados, 'primeira_resposta', '2026-11-05')).toBe(85);
    expect(escadaDe(new Map([['sla_cumprido', []]]), 'sla_cumprido')).toHaveLength(3);
  });

  it('a nota do cartão diz a meta do mês e o próximo degrau', () => {
    expect(notaDaMeta(undefined, 'sla_cumprido', '2026-11-01', pct)).toBe('meta de novembro: pelo menos 80% · em janeiro sobe para 85%');
    expect(notaDaMeta(undefined, 'tempo_medio_horas', '2027-02-28', (v) => `${v} h`)).toBe('meta de fevereiro: até 16 h · em março cai para 12 h');
    expect(notaDaMeta(undefined, 'sla_cumprido', '2027-05-03', pct)).toBe('meta de maio: pelo menos 90%');
  });
});
