// Os Artistas nos Indicadores do Marketing (dono, 2026-11-03): no período, quantos stories, reels e posts de feed cada
// artista fez, quantas peças e quantas na campanha; a bonificação do último mês fechado; o histórico mês a mês.
// Lê o resumo do banco (`mkt_artistas_resumo`: artista × mês × tipo × peso) e usa a regra de `bonificacao-dos-artistas`.
import { MESES } from './competencia-comercial';
import { bonificacaoDoMes, type ArtistaComMetas, type BonificacaoDoMes, type EntregaDoArtista, type StatusDaBonificacao, type TipoDeEntrega } from './bonificacao-dos-artistas';

export interface LinhaDoResumo { artista_id: string; mes: string; tipo: TipoDeEntrega; aprovado: boolean; na_campanha: boolean; quantidade: number }
export interface ArtistaDosIndicadores extends ArtistaComMetas { id: string; nome: string; ativo: boolean }

export interface ArtistaNoPeriodo { id: string; nome: string; stories: number; reels: number; feed: number; pecas: number; naCampanha: number }

/** Por artista (os ativos, e os inativos que entregaram), o que fez no período; e o total. */
export function artistasNoPeriodo(artistas: ArtistaDosIndicadores[], resumo: LinhaDoResumo[]): { linhas: ArtistaNoPeriodo[]; total: Omit<ArtistaNoPeriodo, 'id' | 'nome'> } {
  const linhas = artistas.map((a) => {
    const doArtista = resumo.filter((r) => r.artista_id === a.id);
    const soma = (f: (r: LinhaDoResumo) => boolean) => doArtista.filter(f).reduce((s, r) => s + r.quantidade, 0);
    return {
      id: a.id, nome: a.nome, ativo: a.ativo,
      stories: soma((r) => r.tipo === 'stories'), reels: soma((r) => r.tipo === 'reels'), feed: soma((r) => r.tipo === 'post'),
      pecas: soma(() => true), naCampanha: soma((r) => r.na_campanha),
    };
  }).filter((l) => l.ativo || l.pecas > 0).map(({ ativo: _ativo, ...l }) => l);
  const total = { stories: 0, reels: 0, feed: 0, pecas: 0, naCampanha: 0 };
  for (const l of linhas) for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += l[k];
  return { linhas, total };
}

/**
 * O último mês fechado até o fim do período (dono, 2026-11-03: "é o valor que se paga"). O mês em que o período termina
 * só conta se o período vai até o último dia dele e esse dia já passou; senão, o mês anterior. `AAAA-MM-01`.
 */
export function ultimoMesFechado(ateISO: string, hojeISO: string): string {
  const [a, m, d] = ateISO.split('-').map(Number);
  const ultimoDia = new Date(a, m, 0).getDate();
  if (d === ultimoDia && ateISO < hojeISO) return `${ateISO.slice(0, 7)}-01`;
  const anterior = new Date(a, m - 2, 1);
  return `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}-01`;
}

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

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A frase dos artistas no resumo do período. */
export function fraseDosArtistas(t: Omit<ArtistaNoPeriodo, 'id' | 'nome'>): string {
  if (t.pecas === 0) return 'Os artistas não lançaram entregas no período.';
  return `Os artistas publicaram ${plural(t.stories, 'story', 'stories')}, ${plural(t.reels, 'reels', 'reels')} e ${plural(t.feed, 'post', 'posts')} no feed; ${t.naCampanha} de ${t.pecas} ${t.pecas === 1 ? 'peça' : 'peças'} na campanha do mês.`;
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
