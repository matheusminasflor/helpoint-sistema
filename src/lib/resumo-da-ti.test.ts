import { describe, expect, it } from 'vitest';
import { fraseDoResumo } from './resumo-da-ti';

const base = {
  periodo: 'Semana de 26/10 a 01/11', total: 45, resolvidos: 30, sla: 76, metaSla: 90, tempo: 9.9, tempoAnterior: 33.1,
  trabalho: 52.4, metaTrabalho: 60, semanaAConfirmar: false, projetosAlemDoTermino: 4,
};

describe('a frase de resumo dos Indicadores da TI', () => {
  it('a semana de 26/10 a 01/11, com os números da tela', () => {
    expect(fraseDoResumo(base)).toBe(
      'Semana de 26/10 a 01/11: 45 chamados, 30 resolvidos. O SLA ficou em 76%, abaixo da meta de 90%. '
      + 'O tempo médio caiu de 1 d 9 h para 9,9 h. A equipe trabalhou 52,4% do tempo medido pelo FSENSE (meta 60%). '
      + '4 projetos passaram do término.');
  });

  it('sem semana confirmada avisa; sem projeto atrasado e sem anterior, a frase some', () => {
    expect(fraseDoResumo({ ...base, trabalho: null, semanaAConfirmar: true, projetosAlemDoTermino: 0, tempoAnterior: null, sla: 92 }))
      .toBe('Semana de 26/10 a 01/11: 45 chamados, 30 resolvidos. O SLA ficou em 92%, na meta de 90%. '
        + 'A semana do FSENSE ainda não foi confirmada.');
  });

  it('período sem chamado não fala de SLA', () => {
    expect(fraseDoResumo({ ...base, total: 0, resolvidos: 0, sla: 0, tempo: null, trabalho: null, projetosAlemDoTermino: 1 }))
      .toBe('Semana de 26/10 a 01/11: 0 chamados, 0 resolvidos. 1 projeto passou do término.');
  });
});
