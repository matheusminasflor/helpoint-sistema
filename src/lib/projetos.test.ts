import { describe, expect, it } from 'vitest';
import {
  farolDaAtividade, faseAtual, hojeNaJanela, iniciais, janelaDoCronograma, mesesDaJanela, numerarCronograma,
  andamentoDaSituacao, diasAlemDoTermino, percentualMedio, posicaoNaJanela, resumoDosProjetos, seloDoConjunto, seloDoProjeto, setoresSemPlano,
  situacaoDaTarefa, type AtividadeBase,
} from './projetos';


const at = (id: string, fase: string | null, extra: Partial<AtividadeBase> = {}): AtividadeBase => ({
  id, fase_id: fase, setor: 'marketing', status: 'pending', percentual: 0, inicio: null, termino: null,
  position: 1, user_id: null, ...extra,
});

describe('farolDaAtividade', () => {
  it('acende Atrasado sozinho quando passa do término sem 100%', () => {
    expect(farolDaAtividade({ status: 'in_progress', percentual: 40, termino: '2026-10-05' }, '2026-10-07')).toBe('atrasado');
    expect(farolDaAtividade({ status: 'pending', percentual: 0, termino: '2026-10-07' }, '2026-10-07')).toBe('nao_iniciado');
    expect(farolDaAtividade({ status: 'completed', percentual: 100, termino: '2026-10-01' }, '2026-10-07')).toBe('finalizado');
    expect(farolDaAtividade({ status: 'pending', percentual: 20, termino: null }, '2026-10-07')).toBe('em_andamento');
  });
});

describe('numerarCronograma', () => {
  it('numera fase.atividade na ordem, como a planilha, e junta quem ficou sem fase no fim', () => {
    const fases = [{ id: 'f2', nome: 'P&D', ordem: 2 }, { id: 'f1', nome: 'Ideação', ordem: 1 }];
    const grupos = numerarCronograma(fases, [
      at('a', 'f1', { position: 2 }), at('b', 'f1', { position: 1 }), at('c', 'f2'), at('d', null),
    ]);
    expect(grupos.map((g) => g.fase?.nome ?? 'sem')).toEqual(['Ideação', 'P&D', 'sem']);
    expect(grupos[0].atividades.map((a) => `${a.numero}:${a.id}`)).toEqual(['1.1:b', '1.2:a']);
    expect(grupos[1].atividades[0].numero).toBe('2.1');
  });
});

describe('contas do projeto', () => {
  it('o % é a média das atividades', () => {
    expect(percentualMedio([{ percentual: 100 }, { percentual: 0 }, { percentual: 50 }])).toBe(50);
    expect(percentualMedio([])).toBe(0);
  });

  it('setor envolvido sem nenhuma atividade está aguardando plano', () => {
    expect(setoresSemPlano(['marketing', 'qualidade', 'educacional'], [at('a', null), at('b', null, { setor: 'qualidade' })]))
      .toEqual(['educacional']);
  });

  it('a barra cabe na janela e o hoje fica no lugar', () => {
    const janela = janelaDoCronograma([{ inicio: '2026-09-01', termino: '2026-09-10' }], '2026-12-15', '2026-10-07')!;
    expect(janela).toEqual({ de: '2026-09-01', ate: '2026-12-15' });
    const p = posicaoNaJanela('2026-09-01', '2026-09-10', janela)!;
    expect(p.esquerda).toBe(0);
    expect(p.largura).toBeGreaterThan(0);
    expect(hojeNaJanela('2026-10-07', janela)).toBeGreaterThan(30);
    expect(posicaoNaJanela(null, null, janela)).toBeNull();
  });
});

describe('o visual do desenho (2026-10-09)', () => {
  it('os meses da linha do tempo, de onde a janela começa', () => {
    expect(mesesDaJanela({ de: '2026-09-15', ate: '2026-12-15' }).map((m) => m.rotulo)).toEqual(['set', 'out', 'nov', 'dez']);
    expect(mesesDaJanela({ de: '2026-12-20', ate: '2027-01-10' }).map((m) => m.rotulo)).toEqual(['dez', 'jan']);
    expect(mesesDaJanela({ de: '2026-09-01', ate: '2026-09-30' })[0].esquerda).toBe(0);
  });

  it('o selo da fase: atrasada manda, depois finalizada, em andamento, não iniciada', () => {
    const hoje = '2026-10-09';
    expect(seloDoConjunto([at('a', 'f', { termino: '2026-10-01' }), at('b', 'f')], hoje)).toEqual({ texto: '1 atrasada', tom: 'atrasado' });
    expect(seloDoConjunto([at('a', 'f', { status: 'completed', percentual: 100 })], hoje).texto).toBe('Concluída');
    expect(seloDoConjunto([at('a', 'f', { percentual: 10 }), at('b', 'f')], hoje).texto).toBe('Em andamento');
    expect(seloDoConjunto([], hoje, false).texto).toBe('Não começou');
  });

  it('o selo do projeto respeita a situação escolhida, mesmo sem tarefas ou com tarefa atrasada', () => {
    const hoje = '2026-10-09';
    const atrasada = at('a', 'f', { termino: '2026-10-01' });
    expect(seloDoProjeto('done', [], hoje)).toEqual({ texto: 'Concluído', tom: 'finalizado' });
    expect(seloDoProjeto('done', [atrasada], hoje)).toEqual({ texto: 'Concluído', tom: 'finalizado' });
    expect(seloDoProjeto('cancelled', [atrasada], hoje).texto).toBe('Cancelado');
    expect(seloDoProjeto('active', [atrasada], hoje).texto).toBe('1 atrasada');
    expect(seloDoProjeto('planned', [], hoje).texto).toBe('Não começou');
  });

  it('a fase atual é a primeira com atividade aberta', () => {
    const fases = [{ id: 'f2', ordem: 2 }, { id: 'f1', ordem: 1 }];
    expect(faseAtual(fases, [at('a', 'f1', { status: 'completed', percentual: 100 }), at('b', 'f2')])).toEqual({ numero: 2, total: 2 });
    expect(faseAtual([], [])).toBeNull();
  });

  it('as iniciais do avatar', () => {
    expect(iniciais('Gislene Araújo')).toBe('GA');
    expect(iniciais('Lucas Gomes Ribeiro ')).toBe('LR');
    expect(iniciais('Silvana')).toBe('S');
  });
});

describe('situação em três passos (dono, 2026-10-13)', () => {
  it('lê A fazer / Fazendo / Pronto do que o banco guarda', () => {
    expect(situacaoDaTarefa({ status: 'pending', percentual: 0 })).toBe('a_fazer');
    expect(situacaoDaTarefa({ status: 'in_progress', percentual: 30 })).toBe('fazendo');
    expect(situacaoDaTarefa({ status: 'completed', percentual: 100 })).toBe('pronto');
  });
  it('grava: Fazendo = 50% sem desfazer quem já estava no meio; A fazer volta o status', () => {
    expect(andamentoDaSituacao('fazendo', 0)).toEqual({ percentual: 50, status: 'in_progress' });
    expect(andamentoDaSituacao('fazendo', 30)).toEqual({ percentual: 30, status: 'in_progress' });
    expect(andamentoDaSituacao('fazendo', 100)).toEqual({ percentual: 50, status: 'in_progress' });
    expect(andamentoDaSituacao('a_fazer', 70)).toEqual({ percentual: 0, status: 'pending' });
    expect(andamentoDaSituacao('pronto', 10)).toEqual({ percentual: 100 });
  });
});

describe('projetos nos Indicadores (rodada 2 da TI)', () => {
  const hoje = '2026-11-02';
  const p = (status: string, due_date: string | null, percentual = 0, total = 0) => ({ status, due_date, percentual, total });

  it('passou do término: aberto, término antes de hoje e não chegou a 100% (os dias contam do término)', () => {
    expect(diasAlemDoTermino(p('active', '2026-08-31'), hoje)).toBe(63);
    expect(diasAlemDoTermino(p('planned', '2026-10-30'), hoje)).toBe(3);
    expect(diasAlemDoTermino(p('planned', '2026-12-20'), hoje)).toBe(0);
    expect(diasAlemDoTermino(p('done', '2026-08-31'), hoje)).toBe(0);
    expect(diasAlemDoTermino(p('active', '2026-08-31', 100, 4), hoje)).toBe(0);
    expect(diasAlemDoTermino(p('active', null), hoje)).toBe(0);
  });

  it('o resumo da planilha: em andamento, pendentes e quantos passaram do término', () => {
    const lista = [p('active', '2026-08-31'), p('active', '2026-10-26'), p('planned', '2026-12-20'),
      p('planned', '2026-10-30'), p('planned', '2026-10-20'), p('done', '2026-09-18'), p('cancelled', '2026-09-01')];
    expect(resumoDosProjetos(lista, hoje)).toEqual({ emAndamento: 2, pendentes: 3, alemDoTermino: 4 });
  });
});
