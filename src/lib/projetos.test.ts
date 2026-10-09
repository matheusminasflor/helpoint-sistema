import { describe, expect, it } from 'vitest';
import {
  farolDaAtividade, faseAtual, hojeNaJanela, iniciais, janelaDoCronograma, mesesDaJanela, numerarCronograma,
  percentualMedio, posicaoNaJanela, seloDoConjunto, setoresSemPlano, type AtividadeBase,
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
    expect(seloDoConjunto([at('a', 'f', { status: 'completed', percentual: 100 })], hoje).texto).toBe('Finalizada');
    expect(seloDoConjunto([at('a', 'f', { percentual: 10 }), at('b', 'f')], hoje).texto).toBe('Em andamento');
    expect(seloDoConjunto([], hoje, false).texto).toBe('Não iniciado');
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
