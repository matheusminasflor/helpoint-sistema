import { describe, expect, it } from 'vitest';
import { indicadoresDasSolicitacoes } from './indicadores-das-solicitacoes';

const agora = new Date('2026-11-06T12:00:00Z');

describe('indicadoresDasSolicitacoes', () => {
  it('mede o prazo só de quem foi concluído e separa o que está atrasado', () => {
    const r = indicadoresDasSolicitacoes([
      { etapa: 'concluida', created_at: '2026-11-05T12:00:00Z', sla_due_at: '2026-11-05T20:00:00Z', encerrada_em: '2026-11-05T14:00:00Z' },
      { etapa: 'concluida', created_at: '2026-11-05T12:00:00Z', sla_due_at: '2026-11-05T13:00:00Z', encerrada_em: '2026-11-05T16:00:00Z' },
      { etapa: 'cancelada', created_at: '2026-11-05T12:00:00Z', sla_due_at: '2026-11-05T13:00:00Z', encerrada_em: '2026-11-05T16:00:00Z' },
      { etapa: 'pedido', created_at: '2026-11-05T12:00:00Z', sla_due_at: '2026-11-05T13:00:00Z' },
    ], agora);
    expect(r).toEqual({ total: 4, abertas: 1, atrasadas: 1, noPrazo: 50, tempoMedio: 3 });
  });

  it('sem pedido concluído, não inventa porcentagem', () => {
    expect(indicadoresDasSolicitacoes([], agora).noPrazo).toBeNull();
  });
});
