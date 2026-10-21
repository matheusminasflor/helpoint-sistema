// O que o Jornal da empresa mostra na tela inicial (decisões do dono, 2026-10-04):
//   * só notícia publicada e dentro do período de exibição (sem início = desde já; sem fim = sempre);
//   * a principal é a marcada como destaque — se houver mais de uma, a mais recente. MUDOU em 2026-10-21 (dono:
//     desmarcar o destaque da "série 76" não tirava do topo): sem nenhuma marcada, não há principal nem cartão
//     grande — só a lista, a mais recente primeiro, até 4;
//   * ao lado da principal, as 3 seguintes. Fora do período, a notícia continua no histórico da página Jornal.

/**
 * Capa e anexos até 10 MB (dono, 2026-10-06). O balde `jornal` recusa acima disso
 * (20261210020000); a tela confere antes para avisar sem esperar o envio.
 */
export const LIMITE_DO_ARQUIVO_DO_JORNAL = 10 * 1024 * 1024;

/** A capa aparece sempre na moldura 16:9 (início, página Jornal e leitura). */
export const RECOMENDACAO_DA_CAPA = 'Capa: 1600 × 900 px (proporção 16:9), JPG ou PNG, até 10 MB.';

export type TipoDeNoticia = 'aviso' | 'novo_colaborador' | 'aniversario' | 'feriado' | 'festa_evento' | 'outros' | 'atualizacao_sistema';

/** O mural de atualizações do sistema (dono, 2026-10-14): aba própria no Jornal, fora da capa. */
export const ATUALIZACAO_DO_SISTEMA: TipoDeNoticia = 'atualizacao_sistema';

export const ROTULO_DO_TIPO: Record<TipoDeNoticia, string> = {
  aviso: 'Aviso',
  novo_colaborador: 'Novo colaborador',
  aniversario: 'Aniversário',
  feriado: 'Feriado',
  festa_evento: 'Festa e evento',
  outros: 'Outros',
  atualizacao_sistema: 'Atualização do sistema',
};

export interface NoticiaParaHome {
  status: string;
  destaque: boolean;
  data_noticia: string;
  publicada_em: string | null;
  exibir_de: string | null;
  exibir_ate: string | null;
  tipo?: string;
}

/** `hoje` no formato AAAA-MM-DD (use `todayISO()`), para comparar com as datas do banco. */
export const naHome = (n: NoticiaParaHome, hoje: string) =>
  n.status === 'publicada' && n.tipo !== ATUALIZACAO_DO_SISTEMA && (!n.exibir_de || n.exibir_de <= hoje) && (!n.exibir_ate || n.exibir_ate >= hoje);

/** Mais recente primeiro: o dia da notícia, e no mesmo dia a publicada por último. */
export const maisRecentePrimeiro = (a: NoticiaParaHome, b: NoticiaParaHome) =>
  b.data_noticia.localeCompare(a.data_noticia) || (b.publicada_em ?? '').localeCompare(a.publicada_em ?? '');

export function capaDaHome<T extends NoticiaParaHome>(noticias: T[], hoje: string): { principal: T | null; seguintes: T[] } {
  const vivas = noticias.filter((n) => naHome(n, hoje)).sort(maisRecentePrimeiro);
  const principal = vivas.find((n) => n.destaque) ?? null;
  return { principal, seguintes: vivas.filter((n) => n !== principal).slice(0, principal ? 3 : 4) };
}
