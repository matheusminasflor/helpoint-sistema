import { describe, expect, it } from 'vitest';
import { capaDaHome, quandoFoi, trecho } from './jornal';

const n = (id: string, extra: Partial<{ tipo: string; status: string; destaque: boolean; data_noticia: string; publicada_em: string; exibir_de: string; exibir_ate: string }> = {}) => ({
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

  it('sem destaque marcado, não há principal: só a lista, até 4 (2026-10-21); com dois destaques, o mais recente', () => {
    const semDestaque = capaDaHome([n('velha'), n('nova', { data_noticia: '2026-10-04' })], hoje);
    expect(semDestaque.principal).toBeNull();
    expect(semDestaque.seguintes.map((x) => x.id)).toEqual(['nova', 'velha']);
    expect(capaDaHome([n('d1', { destaque: true }), n('d2', { destaque: true, data_noticia: '2026-10-02' })], hoje).principal?.id).toBe('d2');
  });

  it('rascunho, despublicada e fora do período não vão para a tela inicial', () => {
    const { principal, seguintes } = capaDaHome([
      n('rascunho', { status: 'rascunho', destaque: true }),
      n('fora', { exibir_ate: '2026-10-03', destaque: true }),
      n('ainda-nao', { exibir_de: '2026-10-05' }),
      n('no-ultimo-dia', { exibir_de: '2026-10-01', exibir_ate: '2026-10-04' }),
    ], hoje);
    expect(principal).toBeNull();
    expect(seguintes.map((x) => x.id)).toEqual(['no-ultimo-dia']);
  });

  it('sem notícia, a capa fica vazia', () => {
    expect(capaDaHome([], hoje)).toEqual({ principal: null, seguintes: [] });
  });

  it('atualização do sistema fica fora da capa, mesmo em destaque e mais recente (vai para a aba do mural)', () => {
    const capa = capaDaHome([n('a'), n('sis', { tipo: 'atualizacao_sistema', destaque: true, data_noticia: '2026-10-03' })], hoje);
    expect(capa.principal).toBeNull();
    expect(capa.seguintes.map((x) => x.id)).toEqual(['a']);
  });
});

describe('quandoFoi e trecho (o mural de 2026-10-30)', () => {
  it('hoje, ontem — inclusive na virada do mês — e a data curta no resto', () => {
    expect(quandoFoi('2026-10-30', '2026-10-30')).toBe('Hoje');
    expect(quandoFoi('2026-10-31', '2026-11-01')).toBe('Ontem');
    expect(quandoFoi('2026-10-28', '2026-10-30')).toBe('28 de out');
  });

  it('o trecho tira a imagem e as marcas, e corta com reticências', () => {
    expect(trecho('## Olá **time**\n\n![foto](x.png) bom dia')).toBe('Olá time bom dia');
    expect(trecho('abcdef', 3)).toBe('abc…');
  });
});
