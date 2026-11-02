import { describe, expect, it } from 'vitest';
import { iniciosDaSerie, serieDosChamados } from './useHelpdeskMetrics';

describe('a linha das últimas semanas dos indicadores de chamado', () => {
  const agora = new Date('2026-11-02T12:00:00-03:00');

  it('na "Semana passada", 8 semanas que acabam nela, de segunda a segunda', () => {
    const { inicios, fim } = iniciosDaSerie(
      { period: 'custom', startDate: new Date('2026-10-26T00:00:00-03:00'), endDate: new Date('2026-11-01T00:00:00-03:00') }, 8);
    expect(inicios).toHaveLength(8);
    expect(inicios[7].getTime()).toBe(new Date('2026-10-26T00:00:00-03:00').getTime());
    expect(inicios[0].getTime()).toBe(new Date('2026-09-07T00:00:00-03:00').getTime());
    expect(fim.getTime()).toBe(new Date('2026-11-02T00:00:00-03:00').getTime());
  });

  it('cada ponto faz as contas do cartão: SLA e 1ª resposta de quem tem prazo, tempo médio e resolvidos', () => {
    const inicios = [new Date('2026-10-19T00:00:00-03:00'), new Date('2026-10-26T00:00:00-03:00')];
    const fim = new Date('2026-11-02T00:00:00-03:00');
    const c = (created_at: string, resolved_at: string | null, sla_due_at: string | null, status = resolved_at ? 'resolved' : 'in_progress') =>
      ({ created_at, resolved_at, status, sla_due_at, first_response_due_at: sla_due_at, first_response_at: resolved_at });
    const serie = serieDosChamados([
      c('2026-10-20T09:00:00-03:00', '2026-10-20T13:00:00-03:00', '2026-10-20T17:00:00-03:00'), // no prazo, 4 h
      c('2026-10-21T09:00:00-03:00', '2026-10-22T09:00:00-03:00', '2026-10-21T17:00:00-03:00'), // fora, 24 h
      c('2026-10-27T09:00:00-03:00', null, null), // sem prazo: fora da conta de SLA
    ], inicios, fim, agora);
    expect(serie[0]).toEqual({ sla: 50, primeira: 50, tempo: 14, resolvidos: 2 });
    expect(serie[1]).toEqual({ sla: null, primeira: null, tempo: null, resolvidos: 0 });
  });
});
