// O que o Jornal da empresa mostra na tela inicial (decisões do dono, 2026-10-04):
//   * só notícia publicada e dentro do período de exibição (sem início = desde já; sem fim = sempre);
//   * a principal é a marcada como destaque — se houver mais de uma, a mais recente; sem destaque,
//     a mais recente;
//   * ao lado, as 3 seguintes. Fora do período, a notícia continua no histórico da página Jornal.

export type TipoDeNoticia = 'aviso' | 'novo_colaborador' | 'aniversario' | 'feriado' | 'festa_evento' | 'outros';

export const ROTULO_DO_TIPO: Record<TipoDeNoticia, string> = {
  aviso: 'Aviso',
  novo_colaborador: 'Novo colaborador',
  aniversario: 'Aniversário',
  feriado: 'Feriado',
  festa_evento: 'Festa e evento',
  outros: 'Outros',
};

export interface NoticiaParaHome {
  status: string;
  destaque: boolean;
  data_noticia: string;
  publicada_em: string | null;
  exibir_de: string | null;
  exibir_ate: string | null;
}

/** `hoje` no formato AAAA-MM-DD (use `todayISO()`), para comparar com as datas do banco. */
export const naHome = (n: NoticiaParaHome, hoje: string) =>
  n.status === 'publicada' && (!n.exibir_de || n.exibir_de <= hoje) && (!n.exibir_ate || n.exibir_ate >= hoje);

/** Mais recente primeiro: o dia da notícia, e no mesmo dia a publicada por último. */
export const maisRecentePrimeiro = (a: NoticiaParaHome, b: NoticiaParaHome) =>
  b.data_noticia.localeCompare(a.data_noticia) || (b.publicada_em ?? '').localeCompare(a.publicada_em ?? '');

export function capaDaHome<T extends NoticiaParaHome>(noticias: T[], hoje: string): { principal: T | null; seguintes: T[] } {
  const vivas = noticias.filter((n) => naHome(n, hoje)).sort(maisRecentePrimeiro);
  const principal = vivas.find((n) => n.destaque) ?? vivas[0] ?? null;
  return { principal, seguintes: vivas.filter((n) => n !== principal).slice(0, 3) };
}
