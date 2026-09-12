import { describe, expect, it } from 'vitest';
import { erpHandoffFlows, noReplyFlow } from './automation-templates';
import { describeFlow, validateFlow } from './automation-flow';

const ctx = { people: [{ id: 'fin', name: 'Financeiro' }], categories: [{ id: 'cat', name: 'Cadastro de cliente' }], stages: [{ id: 'novo', name: 'Novo' }, { id: 'lost', name: 'Perdido' }] };

describe('modelos de fluxo (CRM-1d)', () => {
  it('cadastro no ERP: dois fluxos válidos, com ou sem conta a receber', () => {
    for (const createReceivable of [true, false]) {
      const flows = erpHandoffFlows({ ticketModule: 'tickets', categoryId: 'cat', financeUserId: 'fin', createReceivable, receivableDueDays: 7 });
      expect(flows).toHaveLength(2);
      for (const f of flows) expect(validateFlow(f.trigger, f.steps)).toBeNull();
      const kinds = flows[0].steps.map((s) => s.kind);
      expect(kinds.includes('create_receivable')).toBe(createReceivable);
      // O chamado nasce no módulo escolhido, com a categoria que o segundo fluxo observa.
      const ticket = flows[0].steps[0];
      expect(ticket.config).toMatchObject({ module: 'tickets', category_id: 'cat', requester_target: 'created_by' });
      expect(String(ticket.config.description)).toContain('{{trigger.contact.document}}');
      expect(String(ticket.config.description)).toContain('{{trigger.items_text}}');
      expect(describeFlow(flows[1].trigger, flows[1].steps, ctx).quando).toContain('Cadastro de cliente');
    }
  });

  it('sem resposta: espera, olha de novo, tarefa, espera, olha de novo, perdido com motivo', () => {
    const f = noReplyFlow({ firstStageId: 'novo', lostStageId: 'lost', hoursToFollowUp: 24, hoursToLose: 48 });
    expect(validateFlow(f.trigger, f.steps)).toBeNull();
    expect(f.steps.map((s) => s.kind)).toEqual(['delay', 'condition', 'create_task', 'delay', 'condition', 'set_stage']);
    expect(f.steps[1].config).toMatchObject({ refresh: true });
    expect(f.steps[5].config).toMatchObject({ stage_id: 'lost', lost_reason: 'Sem resposta' });
    expect(describeFlow(f.trigger, f.steps, ctx).entao).toContain('esperar 24 hora(s)');
  });
});
