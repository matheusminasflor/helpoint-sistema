import { describe, expect, it } from 'vitest';
import { ordenarPorUrgencia } from './fila-de-chamados';

const c = (id: string, priority: string, sla: string | null, created = '2026-10-01T10:00:00Z') =>
  ({ id, priority, sla_due_at: sla, due_date: null, created_at: created });

describe('ordenarPorUrgencia', () => {
  it('põe a prioridade mais alta primeiro', () => {
    const fila = ordenarPorUrgencia([c('baixa', 'low', null), c('critica', 'critical', null), c('media', 'medium', null), c('alta', 'high', null)]);
    expect(fila.map(t => t.id)).toEqual(['critica', 'alta', 'media', 'baixa']);
  });

  it('na mesma prioridade, o prazo vencido ou mais perto vem antes e sem prazo vai para o fim', () => {
    const fila = ordenarPorUrgencia([
      c('sem-prazo', 'medium', null),
      c('vence-depois', 'medium', '2026-10-09T12:00:00Z'),
      c('vencido', 'medium', '2026-10-01T12:00:00Z'),
    ]);
    expect(fila.map(t => t.id)).toEqual(['vencido', 'vence-depois', 'sem-prazo']);
  });

  it('empate fica com o mais antigo primeiro e a lista original não muda', () => {
    const original = [c('novo', 'high', null, '2026-10-03T10:00:00Z'), c('antigo', 'high', null, '2026-10-01T10:00:00Z')];
    expect(ordenarPorUrgencia(original).map(t => t.id)).toEqual(['antigo', 'novo']);
    expect(original[0].id).toBe('novo');
  });
});
