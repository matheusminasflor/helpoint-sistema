import { describe, expect, it } from 'vitest';
import { contaComoResolvido, statusVisivel, STATUS_RESOLVIDOS } from './status-do-chamado';
import { getTicketStatusLabel } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

// Decisão do dono (2026-10-04): não existe mais "Fechado" para quem usa o sistema. O `closed` que
// sobrar no banco conta e aparece como Resolvido — foi por contá-lo à parte que a TI mostrava
// "Resolvidos = 0" com 7 chamados entregues.
describe('status do chamado', () => {
  it('resolvido e o closed antigo contam como resolvido; o resto não', () => {
    expect(contaComoResolvido('resolved')).toBe(true);
    expect(contaComoResolvido('closed')).toBe(true);
    for (const s of ['open', 'in_progress', 'waiting_user', 'waiting_parts', 'cancelled', 'rejected', null, undefined]) {
      expect(contaComoResolvido(s)).toBe(false);
    }
    expect([...STATUS_RESOLVIDOS]).toEqual(['resolved', 'closed']);
  });

  it('o closed aparece como resolved; os outros ficam como estão', () => {
    expect(statusVisivel('closed')).toBe('resolved');
    expect(statusVisivel('in_progress')).toBe('in_progress');
  });

  it('nenhum rótulo diz "Fechado"', () => {
    expect(getTicketStatusLabel('closed')).toBe('Resolvido');
    expect(getTicketStatusMeta('closed').label).toBe('Resolvido');
  });
});
