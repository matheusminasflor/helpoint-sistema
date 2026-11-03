import { describe, expect, it } from 'vitest';
import { artistasMesAMes, artistasNoPeriodo, bonificacaoNoMes, fraseDosArtistas, ultimoMesFechado, type LinhaDoResumo } from './artistas-nos-indicadores';

const metas = { teto_mensal: 4000, meta_stories: 10, meta_reels: 4, meta_posts: 2 };
const artistas = [
  { id: 'a', nome: 'Artista A', ativo: true, ...metas },
  { id: 'b', nome: 'Artista B', ativo: true, ...metas },
  { id: 'c', nome: 'Artista C', ativo: false, ...metas },
];
const l = (artista_id: string, mes: string, tipo: LinhaDoResumo['tipo'], quantidade: number, na_campanha = true, aprovado = true): LinhaDoResumo =>
  ({ artista_id, mes, tipo, quantidade, na_campanha, aprovado });

describe('os Artistas nos Indicadores do Marketing', () => {
  it('no período: stories, reels e feed por artista, peças e na campanha; o inativo sem entrega some', () => {
    const r = artistasNoPeriodo(artistas, [l('a', '2026-10-01', 'stories', 2), l('a', '2026-10-01', 'stories', 1, false), l('a', '2026-11-01', 'post', 1, false), l('b', '2026-10-01', 'reels', 2)]);
    expect(r.linhas.map((x) => x.nome)).toEqual(['Artista A', 'Artista B']);
    expect(r.linhas[0]).toMatchObject({ stories: 3, reels: 0, feed: 1, pecas: 4, naCampanha: 2 });
    expect(r.total).toEqual({ stories: 3, reels: 2, feed: 1, pecas: 6, naCampanha: 4 });
  });

  it('o último mês fechado: a semana que cruza o mês fica no mês anterior; o mês passado inteiro é ele mesmo', () => {
    expect(ultimoMesFechado('2026-11-01', '2026-11-03')).toBe('2026-10-01');
    expect(ultimoMesFechado('2026-10-31', '2026-11-03')).toBe('2026-10-01');
    expect(ultimoMesFechado('2026-11-30', '2026-11-03')).toBe('2026-10-01');
    expect(ultimoMesFechado('2026-01-15', '2026-11-03')).toBe('2025-12-01');
  });

  it('a bonificação do mês por artista, com a reunião; e o mês a mês soma todos', () => {
    const resumo = [l('a', '2026-10-01', 'stories', 10), l('a', '2026-10-01', 'reels', 6), l('b', '2026-10-01', 'stories', 5)];
    const reunioes = new Set(['a|2026-10-01']);
    const doMes = bonificacaoNoMes(artistas, resumo, reunioes, '2026-10-01');
    expect(doMes.map((x) => [x.nome, x.b.valor, x.b.status])).toEqual([['Artista A', 4000, 'no_alvo'], ['Artista B', 666.67, 'fora']]);
    expect(artistasMesAMes(artistas, resumo, reunioes)).toEqual([
      { mes: '2026-10-01', valor: 4666.67, teto: 8000, parteDoTeto: 4666.67 / 8000, pecas: 21, naCampanha: 21 },
    ]);
  });

  it('a frase do resumo', () => {
    expect(fraseDosArtistas({ stories: 7, reels: 4, feed: 1, pecas: 12, naCampanha: 6 }))
      .toBe('Os artistas publicaram 7 stories, 4 reels e 1 post no feed; 6 de 12 peças na campanha do mês.');
    expect(fraseDosArtistas({ stories: 0, reels: 0, feed: 0, pecas: 0, naCampanha: 0 })).toBe('Os artistas não lançaram entregas no período.');
  });
});
