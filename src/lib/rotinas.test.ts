import { describe, expect, it } from 'vitest';
import { cumprimento, descreverRepeticao, horarioMedio, maisPuladas, periodoAgora, resumoPorPessoa, type LinhaDaEquipe } from './rotinas';

const linha = (extra: Partial<LinhaDaEquipe>): LinhaDaEquipe => ({
  rotina_id: 'r1', titulo: 'Conferir pedidos', setor: 'comercial', periodo: 'manha', pessoa_id: 'ana', pessoa_nome: 'Ana',
  dia: '2026-10-29', situacao: 'feita', motivo: null, observacao: null, anexo_path: null, feita_em: null, feita_por_nome: null, ...extra,
});

describe('cumprimento da equipe', () => {
  it('feitas sobre feitas + puladas + não feitas; pendente e pausada ficam fora', () => {
    expect(cumprimento([{ situacao: 'feita' }, { situacao: 'feita' }, { situacao: 'pulada' }, { situacao: 'nao_feita' },
      { situacao: 'pendente' }, { situacao: 'pausada' }])).toBe(50);
    expect(cumprimento([{ situacao: 'pendente' }, { situacao: 'pausada' }])).toBeNull();
  });

  it('o resumo por pessoa põe quem está pior primeiro', () => {
    const r = resumoPorPessoa([
      linha({}), linha({ dia: '2026-10-30', situacao: 'pendente' }),
      linha({ pessoa_id: 'bia', pessoa_nome: 'Bia', situacao: 'nao_feita' }), linha({ pessoa_id: 'bia', pessoa_nome: 'Bia', situacao: 'pausada' }),
    ]);
    expect(r.map((p) => `${p.nome}:${p.cumprimento}:${p.previstas}`)).toEqual(['Bia:0:1', 'Ana:100:2']);
  });

  it('as mais puladas trazem os motivos, sem repetir, mais recentes primeiro', () => {
    const r = maisPuladas([
      linha({ situacao: 'pulada', motivo: 'Cliente remarcou', dia: '2026-10-27' }),
      linha({ situacao: 'pulada', motivo: 'Sem sistema', dia: '2026-10-28' }),
      linha({ situacao: 'pulada', motivo: 'Sem sistema', dia: '2026-10-29' }),
      linha({ rotina_id: 'r2', titulo: 'Resumo', situacao: 'feita' }),
    ]);
    expect(r).toEqual([{ titulo: 'Conferir pedidos', falhas: 3, vezes: 3, motivos: ['Sem sistema', 'Cliente remarcou'] }]);
  });

  it('o horário médio é a média das horas em que foi marcada', () => {
    const r = horarioMedio([
      linha({ feita_em: new Date(2026, 9, 28, 9, 0).toISOString() }),
      linha({ feita_em: new Date(2026, 9, 29, 10, 0).toISOString() }),
      linha({ situacao: 'pulada', feita_em: new Date(2026, 9, 30, 18, 0).toISOString() }),
    ]);
    expect(r).toEqual([{ titulo: 'Conferir pedidos', periodo: 'manha', vezes: 2, hora: '09:30' }]);
  });
});

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
