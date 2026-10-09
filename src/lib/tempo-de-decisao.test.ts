import { describe, expect, it } from 'vitest';
import { formatarEspera, temposDeDecisao } from './tempo-de-decisao';

describe('temposDeDecisao', () => {
  it('a espera vai do pedido (ou do reenvio) até a decisão', () => {
    const r = temposDeDecisao(
      [{ id: 'a', created_at: '2026-10-01T10:00:00Z' }, { id: 'b', created_at: '2026-10-02T10:00:00Z' }],
      [
        { request_id: 'a', decisao: 'ajuste', created_at: '2026-10-01T12:00:00Z' },     // 2 h
        { request_id: 'a', decisao: 'reenviada', created_at: '2026-10-01T13:00:00Z' },
        { request_id: 'a', decisao: 'aprovada', created_at: '2026-10-01T17:00:00Z' },   // 4 h
        { request_id: 'a', decisao: 'concluida', created_at: '2026-10-03T10:00:00Z' },  // não é decisão
      ],
    );
    expect(r.decisoes).toBe(2);
    expect(r.mediaEmMinutos).toBe(180);
    expect(r.esperandoDesde.get('b')).toBe('2026-10-02T10:00:00Z');
    expect(r.esperandoDesde.has('a')).toBe(false);
  });

  it('sem decisão nenhuma, não há média', () => {
    expect(temposDeDecisao([], []).mediaEmMinutos).toBeNull();
  });
});

describe('formatarEspera', () => {
  it('fala em horas e dias', () => {
    expect(formatarEspera(30)).toBe('menos de 1 h');
    expect(formatarEspera(5 * 60)).toBe('5 h');
    expect(formatarEspera(24 * 60)).toBe('1 dia');
    expect(formatarEspera(51 * 60)).toBe('2 dias e 3 h');
  });
});
