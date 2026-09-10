import { describe, expect, it } from 'vitest';
import { describeFlow, linkLinear, newStepId, orderSteps, validateFlow, type FlowStep, type FlowTrigger } from './automation-flow';

const ctx = {
  people: [{ id: 'u1', name: 'Ana' }],
  categories: [{ id: 'c1', name: 'Impressora' }],
  stages: [{ id: 'st1', name: 'Negociação' }],
};

describe('describeFlow', () => {
  it('chamado criado com filtro de categoria e prioridade', () => {
    const trigger: FlowTrigger = {
      kind: 'record_created', entity: 'ticket', next: ['s1'],
      filter: { op: 'and', rules: [{ path: 'trigger.after.category_id', cmp: 'eq', value: 'c1' }, { path: 'trigger.after.priority', cmp: 'eq', value: 'critical' }] },
    };
    const steps: FlowStep[] = [{ id: 's1', kind: 'assign', config: { user_id: 'u1' }, next: [] }];
    expect(describeFlow(trigger, steps, ctx)).toEqual({
      quando: 'um chamado é criado (Categoria é Impressora e Prioridade é Crítica)',
      entao: 'atribuir a Ana',
    });
  });

  it('negócio muda de etapa, dois passos em ordem', () => {
    const trigger: FlowTrigger = {
      kind: 'record_updated', entity: 'crm_deal', fields: ['stage_id'], next: ['a'],
      filter: { op: 'and', rules: [{ path: 'trigger.after.stage_id', cmp: 'eq', value: 'st1' }] },
    };
    const steps: FlowStep[] = [
      { id: 'b', kind: 'notify', config: { target: 'owner' }, next: [] },
      { id: 'a', kind: 'delay', config: { days: 2 }, next: ['b'] },
    ];
    expect(describeFlow(trigger, steps, ctx)).toEqual({
      quando: 'um negócio muda etapa (Etapa é Negociação)',
      entao: 'esperar 2 dia(s), depois avisar o dono',
    });
  });

  it('agenda semanal e prazo estourado', () => {
    expect(describeFlow({ kind: 'schedule', every: 'week', weekday: 5, time: '08:30', next: [] }, [], ctx).quando).toBe('toda sexta às 08:30');
    expect(describeFlow({ kind: 'deadline_expired', entity: 'ticket', next: [] }, [], ctx)).toEqual({ quando: 'o prazo de um chamado estoura', entao: 'nada ainda' });
  });
});

describe('linkLinear / orderSteps / newStepId', () => {
  it('liga a lista em cadeia a partir do gatilho e devolve na ordem de leitura', () => {
    const trigger: FlowTrigger = { kind: 'manual', entity: 'ticket', next: [] };
    const steps: FlowStep[] = [{ id: 's1', kind: 'stop', config: {}, next: ['zzz'] }, { id: 's2', kind: 'stop', config: {}, next: [] }];
    const linked = linkLinear(trigger, steps);
    expect(linked.trigger.next).toEqual(['s1']);
    expect(linked.steps.map((s) => s.next)).toEqual([['s2'], []]);
    expect(orderSteps(linked.trigger, [linked.steps[1], linked.steps[0]]).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(newStepId(linked.steps)).toBe('s3');
  });
});

describe('validateFlow — a mesma regra do CHECK automation_validate_flow', () => {
  it('acusa passo inexistente, id repetido e hora inválida', () => {
    expect(validateFlow({ kind: 'manual', entity: 'ticket', next: ['x'] }, [])).toMatch(/inexistente: x/);
    expect(validateFlow({ kind: 'manual', entity: 'ticket', next: [] }, [{ id: 'a', kind: 'stop' }, { id: 'a', kind: 'stop' }])).toMatch(/repetido/);
    expect(validateFlow({ kind: 'schedule', every: 'day', time: '8h', next: [] }, [])).toMatch(/HH:MM/);
    expect(validateFlow({ kind: 'record_created', entity: 'ticket', next: ['a'] }, [{ id: 'a', kind: 'notify', config: { team_module: 'ti' } }])).toBeNull();
  });
});
