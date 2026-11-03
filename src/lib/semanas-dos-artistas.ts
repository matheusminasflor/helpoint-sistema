// As semanas dos artistas (dono, 2026-11-03: "fechamos o mês dos artistas sempre dia 31; se não houver 31, fechamos
// 30"; "semanas do mês, como na planilha"). A regra é a do PAINEL MKT da planilha GESTAO_MKT_E_TI (células Z1:Z10):
//   · S1 = dias 1 a 7, S2 = 8 a 14, S3 = 15 a 21, S4 = 22 ao último dia do mês; "mês inteiro" = o mês todo;
//   · na semana escolhida, a bonificação em andamento é a do ACUMULADO do mês, do dia 1 até o fim da semana;
//   · o "anterior": com S2 a S4, o acumulado até a semana anterior; com S1 e com o mês inteiro, o mês anterior inteiro;
//   · o comparativo diz se a bonificação em andamento ficou acima, abaixo ou igual ao anterior.
// A tela mostra também o que entrou só na semana (a prévia aprovada: "na semana" e "no mês").
import { bonificacaoDoMes, type ArtistaComMetas, type BonificacaoDoMes, type EntregaDoArtista } from './bonificacao-dos-artistas';
import { MESES } from './competencia-comercial';

/** 0 = o mês inteiro; 1 a 4 = S1 a S4. */
export type SemanaDoMes = 0 | 1 | 2 | 3 | 4;
export interface Recorte { /** `AAAA-MM-01`. */ mes: string; semana: SemanaDoMes }
export interface Dias { de: string; ate: string }

const dd = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
export const ultimoDiaDoMes = (mes: string) => `${mes.slice(0, 8)}${dd(ultimoDia(mes))}`;
export const mesDe = (dia: string) => `${dia.slice(0, 7)}-01`;
export function mesAnterior(mes: string): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 2, 1);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-01`;
}
const diaAntes = (dia: string) => {
  const d = new Date(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)) - 1);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};

/** Os dias de uma semana do mês (S1 a S4) ou do mês inteiro (0). */
export function diasDaSemana(mes: string, s: SemanaDoMes): Dias {
  if (s === 0) return { de: mes, ate: ultimoDiaDoMes(mes) };
  return { de: `${mes.slice(0, 8)}${dd((s - 1) * 7 + 1)}`, ate: s === 4 ? ultimoDiaDoMes(mes) : `${mes.slice(0, 8)}${dd(s * 7)}` };
}

const semanaDoDia = (dia: string): SemanaDoMes => Math.min(4, Math.floor((Number(dia.slice(8, 10)) - 1) / 7) + 1) as SemanaDoMes;

/**
 * O recorte dos artistas que corresponde ao período da tela: um mês inteiro vira o mês inteiro; o resto vira a semana do
 * mês com mais dias dentro do período (no empate, a mais recente). "Semana passada" de 26/10 a 01/11 → outubro S4.
 */
export function recorteDoPeriodo({ de, ate }: Dias): Recorte {
  if (de.endsWith('-01') && ate === ultimoDiaDoMes(mesDe(de))) return { mes: mesDe(de), semana: 0 };
  const dias = new Map<string, number>();
  for (let d = de; d <= ate; d = proximoDia(d)) {
    const k = `${mesDe(d)}|${semanaDoDia(d)}`;
    dias.set(k, (dias.get(k) ?? 0) + 1);
  }
  let melhor = '';
  for (const [k, n] of dias) if (!melhor || n >= (dias.get(melhor) ?? 0)) melhor = k;
  const [mes, s] = melhor.split('|');
  return { mes, semana: Number(s) as SemanaDoMes };
}
function proximoDia(dia: string): string {
  const d = new Date(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)) + 1);
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/** Os dias que o recorte lê: a semana, o acumulado do mês até ela e o anterior para comparar. */
export function periodosDoRecorte({ mes, semana }: Recorte): { semana: Dias; acumulado: Dias; anterior: Dias; comparaCom: 'o mês anterior' | 'a semana anterior' } {
  const daSemana = diasDaSemana(mes, semana);
  const anterior = semana <= 1 ? diasDaSemana(mesAnterior(mes), 0) : { de: mes, ate: diaAntes(daSemana.de) };
  return { semana: daSemana, acumulado: { de: mes, ate: daSemana.ate }, anterior, comparaCom: semana === 0 ? 'o mês anterior' : 'a semana anterior' };
}

export interface EntregaComDia extends EntregaDoArtista { artista_id: string; data: string }
export interface Contagem { stories: number; reels: number; feed: number; pecas: number; naCampanha: number }
export interface ArtistaNoRecorte {
  id: string; nome: string; teto: number;
  semana: Contagem; mes: Contagem; reuniao: boolean;
  /** A bonificação em andamento (o acumulado do mês até o fim da semana). */
  b: BonificacaoDoMes;
  /** A bonificação do anterior; `null` quando ninguém entregou nada nele (como a planilha). */
  anterior: number | null;
  comparativo: 'acima' | 'abaixo' | 'igual' | null;
}

const vazia = (): Contagem => ({ stories: 0, reels: 0, feed: 0, pecas: 0, naCampanha: 0 });
function contar(entregas: EntregaComDia[]): Contagem {
  const c = vazia();
  for (const e of entregas) {
    if (e.tipo === 'stories') c.stories += e.quantidade; else if (e.tipo === 'reels') c.reels += e.quantidade; else c.feed += e.quantidade;
    c.pecas += e.quantidade;
    if (e.na_campanha) c.naCampanha += e.quantidade;
  }
  return c;
}
const entre = (e: EntregaComDia, d: Dias) => e.data >= d.de && e.data <= d.ate;

/**
 * Cada artista (os ativos, e os inativos que entregaram no mês) no recorte. `reunioes`: "artista|AAAA-MM-01" de quem
 * esteve na reunião daquele mês. As entregas precisam cobrir do anterior ao fim da semana.
 */
export function artistasNoRecorte(
  artistas: (ArtistaComMetas & { id: string; nome: string; ativo: boolean })[], entregas: EntregaComDia[], reunioes: Set<string>, r: Recorte,
): { linhas: ArtistaNoRecorte[]; total: { semana: Contagem; mes: Contagem; valor: number; anterior: number | null; teto: number } } {
  const p = periodosDoRecorte(r);
  const temAnterior = entregas.some((e) => entre(e, p.anterior));
  const mesDoAnterior = mesDe(p.anterior.de);
  const linhas = artistas.map((a) => {
    const doArtista = entregas.filter((e) => e.artista_id === a.id);
    const noMes = doArtista.filter((e) => entre(e, p.acumulado));
    const reuniao = reunioes.has(`${a.id}|${r.mes}`);
    const b = bonificacaoDoMes(a, noMes, reuniao);
    const anterior = temAnterior ? bonificacaoDoMes(a, doArtista.filter((e) => entre(e, p.anterior)), reunioes.has(`${a.id}|${mesDoAnterior}`)).valor : null;
    return {
      ativo: a.ativo, id: a.id, nome: a.nome, teto: a.teto_mensal,
      semana: contar(doArtista.filter((e) => entre(e, p.semana))), mes: contar(noMes), reuniao, b, anterior,
      comparativo: anterior === null ? null : b.valor > anterior ? 'acima' as const : b.valor < anterior ? 'abaixo' as const : 'igual' as const,
    };
  }).filter((l) => l.ativo || l.mes.pecas > 0).map(({ ativo: _ativo, ...l }) => l);
  const soma = (f: (l: ArtistaNoRecorte) => Contagem) => linhas.reduce((t, l) => {
    const c = f(l);
    return { stories: t.stories + c.stories, reels: t.reels + c.reels, feed: t.feed + c.feed, pecas: t.pecas + c.pecas, naCampanha: t.naCampanha + c.naCampanha };
  }, vazia());
  return {
    linhas,
    total: {
      semana: soma((l) => l.semana), mes: soma((l) => l.mes),
      valor: Math.round(linhas.reduce((s, l) => s + l.b.valor, 0) * 100) / 100,
      anterior: temAnterior ? Math.round(linhas.reduce((s, l) => s + (l.anterior ?? 0), 0) * 100) / 100 : null,
      teto: linhas.reduce((s, l) => s + l.teto, 0),
    },
  };
}

const mesComMaiuscula = (mes: string) => { const m = MESES[Number(mes.slice(5, 7)) - 1]; return `${m[0].toUpperCase()}${m.slice(1)}`; };
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** O título do recorte ("Outubro · S4 (22 a 31/10)", "Outubro inteiro") e se já fechou. */
export function rotuloDoRecorte(r: Recorte, hoje: string): { titulo: string; situacao: 'mês fechado' | 'semana fechada' | 'em andamento' } {
  const p = periodosDoRecorte(r);
  const titulo = r.semana === 0 ? `${mesComMaiuscula(r.mes)} inteiro` : `${mesComMaiuscula(r.mes)} · S${r.semana} (${ddmm(p.semana.de)} a ${ddmm(p.semana.ate)})`;
  const fechouOMes = p.acumulado.ate === ultimoDiaDoMes(r.mes) && p.acumulado.ate < hoje;
  return { titulo, situacao: fechouOMes ? 'mês fechado' : p.semana.ate < hoje ? 'semana fechada' : 'em andamento' };
}
