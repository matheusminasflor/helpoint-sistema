import { describe, expect, it } from 'vitest';
import { descreverRepeticao, periodoAgora } from './rotinas';

describe('periodoAgora', () => {
  it('sem horário cadastrado: manhã até 12h, tarde até 17h, fim do dia depois', () => {
    expect(periodoAgora('08:30')).toBe('manha');
    expect(periodoAgora('11:59')).toBe('manha');
    expect(periodoAgora('12:00')).toBe('tarde');
    expect(periodoAgora('16:59')).toBe('tarde');
    expect(periodoAgora('17:00')).toBe('fim_do_dia');
    expect(periodoAgora('21:00')).toBe('fim_do_dia');
  });

  it('segue o almoço da pessoa e o fim do expediente do setor (o banco manda HH:MM:SS)', () => {
    const h = { inicio_almoco: '11:00:00', fim_expediente: '17:00:00' };
    expect(periodoAgora('10:59', h)).toBe('manha');
    expect(periodoAgora('11:00', h)).toBe('tarde');
    expect(periodoAgora('15:59', h)).toBe('tarde');
    expect(periodoAgora('16:00', h)).toBe('fim_do_dia');
  });
});

describe('descreverRepeticao', () => {
  it('diz a repetição como a pessoa fala', () => {
    expect(descreverRepeticao({ repeticao: 'dias_uteis' })).toBe('Todo dia útil');
    expect(descreverRepeticao({ repeticao: 'dias_da_semana', dias_da_semana: [5, 1, 3] })).toBe('Seg, Qua e Sex');
    expect(descreverRepeticao({ repeticao: 'dias_da_semana', dias_da_semana: [2] })).toBe('Ter');
    expect(descreverRepeticao({ repeticao: 'mensal', dia_do_mes: 10 })).toBe('Todo dia 10');
    expect(descreverRepeticao({ repeticao: 'ultimo_dia_util' })).toBe('Último dia útil do mês');
  });
});
