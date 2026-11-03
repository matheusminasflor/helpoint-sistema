import { describe, expect, it } from 'vitest';
import { bonificacaoDoMes, pesoDaPeca, type EntregaDoArtista } from './bonificacao-dos-artistas';

const metas = { teto_mensal: 4000, meta_stories: 10, meta_reels: 4, meta_posts: 2 };
const e = (tipo: EntregaDoArtista['tipo'], quantidade: number, na_campanha = true, aprovado = true): EntregaDoArtista =>
  ({ tipo, quantidade, na_campanha, aprovado });

describe('a bonificação dos artistas, pela regra da planilha', () => {
  it('peso: na campanha 100%, aprovada fora 50%, reprovada fora 0%', () => {
    expect(pesoDaPeca({ na_campanha: true, aprovado: false })).toBe(1);
    expect(pesoDaPeca({ na_campanha: false, aprovado: true })).toBe(0.5);
    expect(pesoDaPeca({ na_campanha: false, aprovado: false })).toBe(0);
  });

  it('julho de um artista da planilha: 13 stories, 3 reels e 1 post na campanha, reunião presente → 88,9% do teto', () => {
    const b = bonificacaoDoMes(metas, [e('stories', 5), e('stories', 4), e('stories', 2), e('stories', 2), e('post', 1), e('reels', 3)], true);
    expect(b).toMatchObject({ stories: 13, reels: 3, posts: 1, storiesPonderados: 13, reelsPostsPonderados: 4, valor: 3555.56, status: 'atencao' });
    expect(b.parteDoTeto).toBeCloseTo(0.889, 3);
  });

  it('cada terço tem teto, e peça fora da campanha vale menos', () => {
    const b = bonificacaoDoMes(metas, [e('stories', 30), e('reels', 6), e('post', 4, false, true), e('post', 2, false, false)], false);
    expect(b).toMatchObject({ valor: 2666.67, pecasMeio: 4, pecasFora: 2, status: 'fora' });
  });

  it('tudo cheio dá o teto inteiro: no alvo', () => {
    expect(bonificacaoDoMes(metas, [e('stories', 10), e('reels', 6)], true)).toMatchObject({ valor: 4000, status: 'no_alvo' });
  });
});
