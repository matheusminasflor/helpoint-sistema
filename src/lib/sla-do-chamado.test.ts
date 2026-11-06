import { describe, expect, it } from 'vitest';
import { slaDoChamado } from './sla-do-chamado';

const agora = new Date('2026-11-06T12:00:00Z');
const prazo = '2026-11-09T12:00:00Z';

describe('slaDoChamado', () => {
  it('deixa cancelado e reprovado fora da conta do SLA', () => {
    expect(slaDoChamado({ sla_due_at: prazo, status: 'cancelled' }, agora)).toBeNull();
    expect(slaDoChamado({ sla_due_at: prazo, status: 'rejected' }, agora)).toBeNull();
  });

  it('conta o resolvido pela hora em que foi resolvido', () => {
    expect(slaDoChamado({ sla_due_at: prazo, status: 'resolved', resolved_at: '2026-11-10T12:00:00Z' }, agora))
      .toEqual({ cumpriu: false, estourado: false });
  });
});
