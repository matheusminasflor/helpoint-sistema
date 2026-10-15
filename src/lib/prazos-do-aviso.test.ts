import { describe, expect, it } from 'vitest';
import { prazosQuePedemAtencao, type ChamadoDoAviso } from './prazos-do-aviso';

const agora = new Date('2026-10-15T12:00:00-03:00');
const c = (n: number, extra: Partial<ChamadoDoAviso>): ChamadoDoAviso => ({
  id: String(n), ticket_number: n, title: `Chamado ${n}`, status: 'in_progress',
  sla_due_at: null, first_response_due_at: null, first_response_at: '2026-10-14T10:00:00-03:00', ...extra,
});

describe('o aviso de prazos ao entrar', () => {
  it('vencido primeiro, depois 1ª resposta, depois o que vence em 24 h; o resto fica fora', () => {
    const itens = prazosQuePedemAtencao([
      c(1, { sla_due_at: '2026-10-15T20:00:00-03:00' }),                                   // vence hoje
      c(2, { sla_due_at: '2026-10-14T09:00:00-03:00' }),                                   // vencido
      c(3, { sla_due_at: '2026-10-20T09:00:00-03:00' }),                                   // longe
      c(4, { first_response_at: null, first_response_due_at: '2026-10-15T13:00:00-03:00', sla_due_at: '2026-10-25T09:00:00-03:00' }),
    ], agora);
    expect(itens.map((i) => [i.chamado.ticket_number, i.motivo])).toEqual([[2, 'vencido'], [4, 'primeira_resposta'], [1, 'vence_logo']]);
  });
  it('prazo pausado ou chamado encerrado não entra, mesmo vencido', () => {
    const itens = prazosQuePedemAtencao([
      c(5, { status: 'scheduled', sla_due_at: '2026-10-14T09:00:00-03:00' }),
      c(6, { status: 'waiting_user', sla_due_at: '2026-10-14T09:00:00-03:00' }),
      c(7, { status: 'resolved', sla_due_at: '2026-10-14T09:00:00-03:00' }),
    ], agora);
    expect(itens).toEqual([]);
  });
});
