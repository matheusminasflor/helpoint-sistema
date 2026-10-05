import { describe, expect, it } from 'vitest';
import { resumoDaFila } from './resumo-da-fila';
import type { TicketWithDetails } from '@/types/helpdesk';

const passado = '2020-01-01T10:00:00Z';
const futuro = '2099-01-01T10:00:00Z';
const c = (id: string, priority: string, assigned_to: string | null, sla: string) =>
  ({ id, priority, assigned_to, sla_due_at: sla, due_date: null, status: 'in_progress', created_at: '2019-12-01T10:00:00Z' }) as unknown as TicketWithDetails;

// O caso do dono: dois chamados do Marketing, um com a Gislene (crítico, vencido) e um com a
// Merilyn (vencido). O dono não atende nenhum.
const fila = [c('evento', 'critical', 'gislene', passado), c('video', 'medium', 'merilyn', passado)];

describe('resumoDaFila', () => {
  it('o gestor ve o setor: pendentes, criticos, vencidos — e nenhum e dele', () => {
    const r = resumoDaFila(fila, 'matheus', true);
    expect(r).toMatchObject({ pendentes: 2, criticos: 1, vencidos: 2, semResponsavel: 0, meus: 0 });
    expect(r.comecePor?.id).toBe('evento');
    expect(r.comecePorVencido).toBe(true);
  });

  it('quem atende ve so o que esta com ele', () => {
    const r = resumoDaFila(fila, 'merilyn', false);
    expect(r).toMatchObject({ meus: 1, meusCriticos: 0, meusVencidos: 1 });
    expect(r.comecePor?.id).toBe('video');
  });

  it('quem atende e nao tem nada nao recebe sugestao da fila sem dono', () => {
    const r = resumoDaFila([...fila, c('banner', 'low', null, futuro), c('rotulo', 'high', null, futuro)], 'yuri', false);
    expect(r.meus).toBe(0);
    expect(r.comecePor).toBeNull();
  });

  it('o gestor ve o mais urgente da fila inteira, com ou sem dono', () => {
    const r = resumoDaFila([c('rotulo', 'high', null, futuro), c('banner', 'low', 'merilyn', futuro)], 'matheus', true);
    expect(r.semResponsavel).toBe(1);
    expect(r.comecePor?.id).toBe('rotulo');
  });
});
