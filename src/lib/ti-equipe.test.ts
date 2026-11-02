import { describe, expect, it } from 'vitest';
import {
  comparar, diasDoPeriodo, domingoDaSemana, farol, horasParadas, lerColagem, mediaAnteriorDosMesmos, mediaDaEquipe, metaDoPeriodo,
  lerNumero, periodoAnterior, periodoDoIntervalo, piorFarol, porColaborador, somaDosPercentuais,
} from './ti-equipe';

const S4_OUTUBRO = { de: '2026-10-22', ate: '2026-11-01' };

describe('período do filtro da tela', () => {
  it('o intervalo da tela (último dia incluído) vira período com o fim exclusivo', () => {
    expect(periodoDoIntervalo({ de: '2026-10-26', ate: '2026-11-01' })).toEqual({ de: '2026-10-26', ate: '2026-11-02' });
    expect(diasDoPeriodo({ de: '2026-10-26', ate: '2026-11-02' })).toBe(7);
  });

  it('a semana do FSENSE fecha no domingo, como o banco grava', () => {
    expect(domingoDaSemana('2026-10-26')).toBe('2026-11-01'); // segunda
    expect(domingoDaSemana('2026-10-30')).toBe('2026-11-01'); // sexta, o dia da tarefa
    expect(domingoDaSemana('2026-11-01')).toBe('2026-11-01'); // o próprio domingo
  });

  it('compara com o período anterior do mesmo tamanho, colado antes', () => {
    expect(periodoAnterior({ de: '2026-10-26', ate: '2026-11-02' })).toEqual({ de: '2026-10-19', ate: '2026-10-26' });
    expect(periodoAnterior({ de: '2026-10-01', ate: '2026-11-01' })).toEqual({ de: '2026-08-31', ate: '2026-10-01' });
  });
});

describe('meta e farol', () => {
  it('a meta de quantidade é proporcional aos dias; a de percentual vale inteira', () => {
    expect(metaDoPeriodo(2, 7, true)).toBe(0.5);
    expect(metaDoPeriodo(2, 30, true)).toBe(2);
    expect(metaDoPeriodo(65, 7, false)).toBe(65);
    expect(metaDoPeriodo(undefined, 7, true)).toBeUndefined();
  });

  it('maior é melhor: na meta, até 70% atenção, abaixo fora', () => {
    expect(farol(65, 65, 'mais')).toBe('no_alvo');
    expect(farol(59, 65, 'mais')).toBe('atencao');
    expect(farol(40, 65, 'mais')).toBe('fora');
  });

  it('menor é melhor: até a meta, até 130% atenção, acima fora (o caso da planilha: 1 interrupção na semana)', () => {
    expect(farol(24, 20, 'menos')).toBe('atencao');
    expect(farol(10.3, 20, 'menos')).toBe('no_alvo');
    expect(farol(1, 0.5, 'menos')).toBe('fora');
    expect(farol(null, 20, 'menos')).toBe('sem_dado');
    expect(farol(3, undefined, 'menos')).toBe('sem_meta');
  });

  it('percentual: amarelo só até 10 pontos da meta (SLA de 64% com meta de 90% é vermelho, não amarelo)', () => {
    expect(farol(90, 90, 'mais', true)).toBe('no_alvo');
    expect(farol(80, 90, 'mais', true)).toBe('atencao');
    expect(farol(76, 90, 'mais', true)).toBe('fora');
    expect(farol(64, 90, 'mais', true)).toBe('fora');
    expect(farol(17.1, 15, 'menos', true)).toBe('atencao');
    expect(farol(25, 15, 'menos', true)).toBe('atencao');
    expect(farol(33.7, 15, 'menos', true)).toBe('fora');
  });

  it('o status da pessoa é o pior entre trabalho e ocioso (tela bloqueada 92,5%: 3% de trabalho não fica verde)', () => {
    const daPessoa = (t: number, o: number) => piorFarol(farol(t, 60, 'mais', true), farol(o, 15, 'menos', true));
    expect(daPessoa(3.1, 3.1)).toBe('fora');
    expect(daPessoa(85.1, 10.3)).toBe('no_alvo');
    expect(daPessoa(67.6, 20.9)).toBe('atencao');
    expect(piorFarol('sem_dado', 'no_alvo')).toBe('no_alvo');
  });

  it('compara com o anterior', () => {
    expect(comparar(24, 11.9)).toBe('acima');
    expect(comparar(1, 1)).toBe('igual');
    expect(comparar(1, null)).toBeNull();
  });
});

describe('FSENSE', () => {
  const linhas = [
    { data: '2026-10-25', colaborador: 'Gislene', horas: 29.3, trabalho: 65.6, ocioso: 2.5 },
    { data: '2026-10-25', colaborador: 'Vinicius', horas: 38.3, trabalho: 51.1, ocioso: 48.9 },
    { data: '2026-10-29', colaborador: 'gislene ', horas: 10, trabalho: 70.4, ocioso: 0 },
    { data: '2026-10-18', colaborador: 'Gislene', horas: 34.2, trabalho: 56.9, ocioso: 1 },
  ];

  it('uma linha por pessoa no período: horas somadas, percentual pela média', () => {
    const s4 = porColaborador(linhas, S4_OUTUBRO);
    expect(s4).toHaveLength(2);
    expect(s4.find((c) => c.colaborador === 'Gislene')).toMatchObject({ horas: 39.3, trabalho: 68, ocioso: 1.25 });
  });

  it('a média da equipe ignora quem está zerado, como a planilha', () => {
    const lista = [
      { colaborador: 'A', horas: 1, trabalho: 60, ocioso: 0 },
      { colaborador: 'B', horas: 1, trabalho: 50, ocioso: 20 },
      { colaborador: 'C', horas: 1, trabalho: null, ocioso: null },
    ];
    expect(mediaDaEquipe(lista, 'trabalho')).toBe(55);
    expect(mediaDaEquipe(lista, 'ocioso')).toBe(20);
    expect(mediaDaEquipe([], 'ocioso')).toBeNull();
  });

  it('o anterior da equipe é só de quem está no período atual (a planilha de outubro: 60,0% e 11,9%)', () => {
    const atual = ['Matheus Freitas', 'Vinicius', 'Rondinelly', 'Jacqueline', 'Gislene', 'Fenicio']
      .map((colaborador) => ({ colaborador, horas: 1, trabalho: 50, ocioso: 10 }));
    const anterior = [
      ['Matheus Freitas', 72.2, 7.5], ['Fenicio', 41.8, 35.4], ['Gislene', 56.9, 1], ['Jacqueline', 70.6, 7.8],
      ['Rondinelly', 58.3, 7.8], ['Karina', 21.6, 78.4],
    ].map(([colaborador, trabalho, ocioso]) => ({ colaborador: colaborador as string, horas: 1, trabalho: trabalho as number, ocioso: ocioso as number }));
    expect(mediaAnteriorDosMesmos(atual, anterior, 'trabalho')!.toFixed(1)).toBe('60.0');
    expect(mediaAnteriorDosMesmos(atual, anterior, 'ocioso')!.toFixed(1)).toBe('11.9');
  });

  it('lê a tabela colada: tabulação, vírgula, %, horas em hh:mm, cabeçalho e data no começo', () => {
    const { linhas: l, erros } = lerColagem(
      'Colaborador\tHoras\t% Trabalho\t% Bloqueada\t% Ocioso\t% Suspenso\n'
      + 'Matheus Freitas\t45,6\t62,6%\t26,3%\t10,3%\t0,8%\n'
      + 'Vinicius   38:18   51.1   0   48.9   0\n'
      + '25/10/2026 Fenicio; 30; 55,3%; 0,1%; 37,4%; 7,2%\n'
      + 'Rondinelly 48,9\n',
    );
    expect(erros).toEqual([]);
    expect(l).toEqual([
      { colaborador: 'Matheus Freitas', horas: 45.6, trabalho: 62.6, bloqueada: 26.3, ocioso: 10.3, suspenso: 0.8 },
      { colaborador: 'Vinicius', horas: 38.3, trabalho: 51.1, bloqueada: 0, ocioso: 48.9, suspenso: 0 },
      { colaborador: 'Fenicio', horas: 30, trabalho: 55.3, bloqueada: 0.1, ocioso: 37.4, suspenso: 7.2 },
      { colaborador: 'Rondinelly', horas: 48.9, trabalho: null, bloqueada: null, ocioso: null, suspenso: null },
    ]);
  });

  it('lê as horas como o FSENSE mostra e confere a soma dos percentuais', () => {
    expect(lerNumero('64h 45m')).toBe(64.8);
    expect(lerNumero('64h45m')).toBe(64.8);
    expect(lerNumero('45:36')).toBe(45.6);
    expect(lerNumero('45,6')).toBe(45.6);
    expect(lerNumero('58,1%')).toBe(58.1);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('abc')).toBeNaN();
    expect(lerColagem('jacqueline\t64h 45m\t58,1%\t8,4%\t4,4%\t29,1%').linhas[0]).toMatchObject({ horas: 64.8, trabalho: 58.1, suspenso: 29.1 });
    expect(somaDosPercentuais({ trabalho: 58.1, bloqueada: 8.4, ocioso: 4.4, suspenso: 29.1 })).toBe(100);
    expect(somaDosPercentuais({ trabalho: 51.1, bloqueada: 0, ocioso: 45.9, suspenso: null })).toBeNull();
  });

  it('acusa linha sem nome e percentual impossível', () => {
    const { linhas: l, erros } = lerColagem('45,6 62%\nKarina 8 108% 0 0 0');
    expect(l).toEqual([]);
    expect(erros).toHaveLength(2);
  });
});

describe('interrupções', () => {
  it('soma as horas paradas do período; a que está parada conta até agora; a da planilha antiga não soma', () => {
    const p = S4_OUTUBRO;
    const lista = [
      { inicio: '2026-10-24T17:00:00.000Z', fim: '2026-10-24T19:30:00.000Z', sem_horario: false },
      { inicio: '2026-10-30T12:00:00.000Z', fim: null, sem_horario: false },
      { inicio: '2026-10-25T15:00:00.000Z', fim: null, sem_horario: true },
      { inicio: '2026-10-10T12:00:00.000Z', fim: '2026-10-10T20:00:00.000Z', sem_horario: false },
    ];
    expect(horasParadas(lista, p, new Date('2026-10-30T13:00:00.000Z'))).toBe(3.5);
  });
});
