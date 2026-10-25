import { describe, expect, it } from 'vitest';
import { montarRegua } from './regua-do-dia';

const agora = new Date(2026, 9, 26, 13, 0);
const d = (h: number, m = 0, dia = 26) => new Date(2026, 9, dia, h, m);

describe('régua do dia (Início, 2026-10-24)', () => {
  const r = montarRegua({
    inicio: '08:00', fim: '18:00', almoco: { inicio: '12:00', fim: '13:00' }, agora,
    prazos: [
      { id: 'b', rotulo: '#195', quando: d(16, 30) },
      { id: 'a', rotulo: '#192', quando: d(9) },
      { id: 'c', rotulo: '#200', quando: d(10, 0, 27) },
    ],
  });

  it('põe o agora e o almoço na proporção do expediente', () => {
    expect(r.agora).toBe(50);
    expect(r.almoco).toEqual({ de: 40, ate: 50 });
  });
  it('só os prazos de hoje, em ordem, e o que já passou é atrasado', () => {
    expect(r.marcas.map((m) => [m.rotulo, m.hora, m.atrasado])).toEqual([['#192', '09:00', true], ['#195', '16:30', false]]);
    expect(r.marcas[0].pos).toBe(10);
  });
  it('as horas da régua de duas em duas', () => {
    expect(r.horas.map((h) => h.rotulo)).toEqual(['8h', '10h', '12h', '14h', '16h', '18h']);
  });
  it('fora do expediente o agora some, e o prazo fora da faixa encosta na ponta', () => {
    const noite = montarRegua({ inicio: '08:00', fim: '18:00', agora: d(21), prazos: [{ id: 'x', rotulo: '#1', quando: d(20) }] });
    expect(noite.agora).toBeNull();
    expect(noite.marcas[0].pos).toBe(100);
  });
});
