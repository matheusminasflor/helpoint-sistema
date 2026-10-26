import { describe, expect, it } from 'vitest';
import { indicadoresDeTreinamento } from './indicadores-de-treinamento';

const i = (status: string, cliente = false) => ({ status, profile_id: cliente ? null : 'p', customer_profile_id: cliente ? 'c' : null });

describe('indicadores de treinamento (R6)', () => {
  it('conta inscritos sem os cancelados, concluídos com as horas, faltas e a presença entre quem já tem situação', () => {
    const r = indicadoresDeTreinamento([
      { starts_at: '2026-10-05', training: { title: 'Coloração', hours: 4 }, inscritos: [i('concluido'), i('faltou'), i('cancelado'), i('inscrito', true)] },
      { starts_at: '2026-10-12', training: { title: 'Coloração', hours: 4 }, inscritos: [i('presente'), i('concluido', true)] },
    ]);
    expect([r.turmas, r.inscritos, r.concluidos, r.faltas, r.horasConcluidas, r.internos, r.clientes]).toEqual([2, 5, 2, 1, 8, 3, 2]);
    expect(r.presenca).toBe(75); // 3 compareceram, 1 faltou
    expect(r.porTreinamento).toEqual([{ titulo: 'Coloração', turmas: 2, inscritos: 5, concluidos: 2 }]);
  });
  it('sem ninguém com situação, a presença fica vazia', () => {
    expect(indicadoresDeTreinamento([{ starts_at: '2026-10-05', training: null, inscritos: [i('inscrito')] }]).presenca).toBeNull();
  });
});
