import { describe, expect, it } from 'vitest';
import { capaDaHome } from './jornal';

const n = (id: string, extra: Partial<{ status: string; destaque: boolean; data_noticia: string; publicada_em: string; exibir_de: string; exibir_ate: string }> = {}) => ({
  id, status: 'publicada', destaque: false, data_noticia: '2026-10-01', publicada_em: '2026-10-01T10:00:00Z',
  exibir_de: null as string | null, exibir_ate: null as string | null, ...extra,
});

describe('capaDaHome', () => {
  const hoje = '2026-10-04';

  it('a principal é a destaque, mesmo que não seja a mais recente; as seguintes vêm por data, até 3', () => {
    const { principal, seguintes } = capaDaHome([
      n('a', { data_noticia: '2026-10-03' }), n('festa', { destaque: true, data_noticia: '2026-09-20' }),
      n('b', { data_noticia: '2026-10-02' }), n('c', { data_noticia: '2026-10-01' }), n('d', { data_noticia: '2026-09-30' }),
    ], hoje);
    expect(principal?.id).toBe('festa');
    expect(seguintes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('sem destaque, a mais recente; com dois destaques, o mais recente', () => {
    expect(capaDaHome([n('velha'), n('nova', { data_noticia: '2026-10-04' })], hoje).principal?.id).toBe('nova');
    expect(capaDaHome([n('d1', { destaque: true }), n('d2', { destaque: true, data_noticia: '2026-10-02' })], hoje).principal?.id).toBe('d2');
  });

  it('rascunho, despublicada e fora do período não vão para a tela inicial', () => {
    const { principal, seguintes } = capaDaHome([
      n('rascunho', { status: 'rascunho', destaque: true }),
      n('fora', { exibir_ate: '2026-10-03', destaque: true }),
      n('ainda-nao', { exibir_de: '2026-10-05' }),
      n('no-ultimo-dia', { exibir_de: '2026-10-01', exibir_ate: '2026-10-04' }),
    ], hoje);
    expect(principal?.id).toBe('no-ultimo-dia');
    expect(seguintes).toEqual([]);
  });

  it('sem notícia, a capa fica vazia', () => {
    expect(capaDaHome([], hoje)).toEqual({ principal: null, seguintes: [] });
  });
});
