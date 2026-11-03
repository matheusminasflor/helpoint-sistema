// A bonificação dos artistas do Marketing (dono, 2026-11-03), a regra da planilha PAINEL MKT, seção 1:
//   peso da peça: na campanha 100% · aprovada fora da campanha 50% · senão 0%;
//   bonificação = mín(teto/3, teto/3 ÷ meta de stories × stories ponderados)
//              + mín(teto/3, teto/3 ÷ (meta de reels + meta de posts) × reels e posts ponderados)
//              + (reunião do mês ? teto/3 : 0);
//   status pela parte do teto: 100% no alvo · 70% atenção · abaixo, fora.

export type TipoDeEntrega = 'stories' | 'reels' | 'post';

export interface EntregaDoArtista { tipo: TipoDeEntrega; quantidade: number; aprovado: boolean; na_campanha: boolean }
export interface ArtistaComMetas { teto_mensal: number; meta_stories: number; meta_reels: number; meta_posts: number }

export type StatusDaBonificacao = 'no_alvo' | 'atencao' | 'fora';

export interface BonificacaoDoMes {
  stories: number;
  reels: number;
  posts: number;
  /** Peças aprovadas fora da campanha (valem 50%) e as que não valem nada. */
  pecasMeio: number;
  pecasFora: number;
  storiesPonderados: number;
  reelsPostsPonderados: number;
  valor: number;
  /** De 0 a 1. */
  parteDoTeto: number;
  status: StatusDaBonificacao;
}

export const pesoDaPeca = (e: Pick<EntregaDoArtista, 'aprovado' | 'na_campanha'>) => (e.na_campanha ? 1 : e.aprovado ? 0.5 : 0);

export function bonificacaoDoMes(artista: ArtistaComMetas, entregas: EntregaDoArtista[], reuniaoPresente: boolean): BonificacaoDoMes {
  const soma = (f: (e: EntregaDoArtista) => number) => entregas.reduce((a, e) => a + f(e), 0);
  const doTipo = (t: TipoDeEntrega) => (e: EntregaDoArtista) => (e.tipo === t ? e.quantidade : 0);
  const terco = artista.teto_mensal / 3;
  const storiesPonderados = soma((e) => (e.tipo === 'stories' ? e.quantidade * pesoDaPeca(e) : 0));
  const reelsPostsPonderados = soma((e) => (e.tipo !== 'stories' ? e.quantidade * pesoDaPeca(e) : 0));
  // Em centavos, como a planilha mostra: três terços cheios somam 3.999,999…, e isso é o teto inteiro.
  const valor = Math.round((Math.min(terco, (terco / artista.meta_stories) * storiesPonderados)
    + Math.min(terco, (terco / (artista.meta_reels + artista.meta_posts)) * reelsPostsPonderados)
    + (reuniaoPresente ? terco : 0)) * 100) / 100;
  const parteDoTeto = artista.teto_mensal > 0 ? valor / artista.teto_mensal : 0;
  return {
    stories: soma(doTipo('stories')),
    reels: soma(doTipo('reels')),
    posts: soma(doTipo('post')),
    pecasMeio: soma((e) => (!e.na_campanha && e.aprovado ? e.quantidade : 0)),
    pecasFora: soma((e) => (!e.na_campanha && !e.aprovado ? e.quantidade : 0)),
    storiesPonderados,
    reelsPostsPonderados,
    valor,
    parteDoTeto,
    status: parteDoTeto >= 1 ? 'no_alvo' : parteDoTeto >= 0.7 ? 'atencao' : 'fora',
  };
}
