import { describe, expect, it } from 'vitest';
import { itensDaAgenda, type ChamadoDaAgenda } from './agenda-unica';

const ch = (id: string, extra: Partial<ChamadoDaAgenda>): ChamadoDaAgenda => ({
  id, ticket_number: 7, title: 'Impressora', status: 'in_progress', sla_due_at: null, agendado_para: null, ...extra,
});

describe('Agenda única (2026-10-25)', () => {
  it('chamado agendado cai no dia do agendamento, não no do prazo', () => {
    const m = itensDaAgenda([ch('a', { status: 'scheduled', agendado_para: new Date(2026, 10, 4, 9, 30).toISOString(), sla_due_at: new Date(2026, 10, 2, 18).toISOString() })],
      [], '2026-11-01', '2026-11-30');
    expect([...m.keys()]).toEqual(['2026-11-04']);
    expect(m.get('2026-11-04')![0]).toMatchObject({ tipo: 'agendado', hora: '09:30' });
  });
  it('prazo cai no dia local do prazo', () => {
    const m = itensDaAgenda([ch('b', { sla_due_at: new Date(2026, 10, 3, 22, 0).toISOString() })], [], '2026-11-01', '2026-11-30');
    expect(m.get('2026-11-03')![0]).toMatchObject({ tipo: 'prazo', hora: '22:00' });
  });
  it('férias ocupam cada dia, cortadas no mês, e as minhas dizem "Minhas férias"', () => {
    const m = itensDaAgenda([], [{ user_id: 'eu', nome: 'Ana', start_date: '2026-10-30', end_date: '2026-11-02' }], '2026-11-01', '2026-11-30', 'eu');
    expect([...m.keys()]).toEqual(['2026-11-01', '2026-11-02']);
    expect(m.get('2026-11-01')![0].titulo).toBe('Minhas férias');
  });
});
