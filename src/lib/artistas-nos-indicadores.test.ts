import { describe, expect, it } from 'vitest';
import { artistasMesAMes, bonificacaoNoMes, mesEAno, type LinhaDoResumo } from './artistas-nos-indicadores';

const metas = { teto_mensal: 4000, meta_stories: 10, meta_reels: 4, meta_posts: 2 };
const artistas = [
  { id: 'a', nome: 'Artista A', ativo: true, ...metas },
  { id: 'b', nome: 'Artista B', ativo: true, ...metas },
  { id: 'c', nome: 'Artista C', ativo: false, ...metas },
];
const l = (artista_id: string, mes: string, tipo: LinhaDoResumo['tipo'], quantidade: number, na_campanha = true, aprovado = true): LinhaDoResumo =>
  ({ artista_id, mes, tipo, quantidade, na_campanha, aprovado });

describe('os Artistas mês a mês nos Indicadores do Marketing', () => {
  it('a bonificação do mês por artista, com a reunião; o inativo sem entrega some; o mês a mês soma todos', () => {
    const resumo = [l('a', '2026-10-01', 'stories', 10), l('a', '2026-10-01', 'reels', 6), l('b', '2026-10-01', 'stories', 5)];
    const reunioes = new Set(['a|2026-10-01']);
    const doMes = bonificacaoNoMes(artistas, resumo, reunioes, '2026-10-01');
    expect(doMes.map((x) => [x.nome, x.b.valor, x.b.status])).toEqual([['Artista A', 4000, 'no_alvo'], ['Artista B', 666.67, 'fora']]);
    expect(artistasMesAMes(artistas, resumo, reunioes)).toEqual([
      { mes: '2026-10-01', valor: 4666.67, teto: 8000, parteDoTeto: 4666.67 / 8000, pecas: 21, naCampanha: 21 },
    ]);
  });

  it('o mês por extenso, com o "de" minúsculo', () => {
    expect(mesEAno('2026-07-01')).toBe('Julho de 2026');
  });
});
