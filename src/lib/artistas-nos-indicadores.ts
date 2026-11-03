// Os Artistas nos Indicadores do Marketing (dono, 2026-11-03): o histórico mês a mês do Analítico. As semanas da Visão
// Geral moram em `semanas-dos-artistas`. Lê o resumo do banco (`mkt_artistas_resumo`: artista × mês × tipo × peso) e usa
// a regra de `bonificacao-dos-artistas`.
import { MESES } from './competencia-comercial';
import { bonificacaoDoMes, type ArtistaComMetas, type BonificacaoDoMes, type EntregaDoArtista, type StatusDaBonificacao, type TipoDeEntrega } from './bonificacao-dos-artistas';

export interface LinhaDoResumo { artista_id: string; mes: string; tipo: TipoDeEntrega; aprovado: boolean; na_campanha: boolean; quantidade: number }
export interface ArtistaDosIndicadores extends ArtistaComMetas { id: string; nome: string; ativo: boolean }

const entregasDoMes = (resumo: LinhaDoResumo[], artistaId: string, mes: string): EntregaDoArtista[] =>
  resumo.filter((r) => r.artista_id === artistaId && r.mes === mes)
    .map((r) => ({ tipo: r.tipo, quantidade: r.quantidade, aprovado: r.aprovado, na_campanha: r.na_campanha }));

export interface BonificacaoDoArtista { id: string; nome: string; teto: number; b: BonificacaoDoMes }

/** A bonificação de cada artista num mês (os ativos, e os inativos que entregaram nele). `reunioes`: "artista|mes". */
export function bonificacaoNoMes(artistas: ArtistaDosIndicadores[], resumo: LinhaDoResumo[], reunioes: Set<string>, mes: string): BonificacaoDoArtista[] {
  return artistas
    .map((a) => ({ a, entregas: entregasDoMes(resumo, a.id, mes) }))
    .filter(({ a, entregas }) => a.ativo || entregas.length > 0)
    .map(({ a, entregas }) => ({ id: a.id, nome: a.nome, teto: a.teto_mensal, b: bonificacaoDoMes(a, entregas, reunioes.has(`${a.id}|${mes}`)) }));
}

export interface MesDosArtistas { mes: string; valor: number; teto: number; parteDoTeto: number; pecas: number; naCampanha: number }

/** Cada mês com entrega: a bonificação somada de todos, o teto somado e as peças. */
export function artistasMesAMes(artistas: ArtistaDosIndicadores[], resumo: LinhaDoResumo[], reunioes: Set<string>): MesDosArtistas[] {
  const meses = [...new Set(resumo.map((r) => r.mes))].sort();
  return meses.map((mes) => {
    const doMes = bonificacaoNoMes(artistas, resumo, reunioes, mes);
    const valor = Math.round(doMes.reduce((s, x) => s + x.b.valor, 0) * 100) / 100;
    const teto = doMes.reduce((s, x) => s + x.teto, 0);
    const linhas = resumo.filter((r) => r.mes === mes);
    return {
      mes, valor, teto, parteDoTeto: teto ? valor / teto : 0,
      pecas: linhas.reduce((s, r) => s + r.quantidade, 0),
      naCampanha: linhas.filter((r) => r.na_campanha).reduce((s, r) => s + r.quantidade, 0),
    };
  });
}

/** A situação da bonificação, como a tela de Artistas e os Indicadores mostram. */
export const STATUS_DO_ARTISTA: Record<StatusDaBonificacao, { texto: string; classe: string }> = {
  no_alvo: { texto: 'No alvo', classe: 'badge-success' },
  atencao: { texto: 'Atenção', classe: 'badge-warning' },
  fora: { texto: 'Fora', classe: 'badge-danger' },
};

/** "outubro", de `AAAA-MM-01`. */
export const nomeDoMes = (mesISO: string) => MESES[Number(mesISO.slice(5, 7)) - 1];
/** "Julho de 2026", de `AAAA-MM-01`. */
export const mesEAno = (mesISO: string) => { const m = nomeDoMes(mesISO); return `${m[0].toUpperCase()}${m.slice(1)} de ${mesISO.slice(0, 4)}`; };
