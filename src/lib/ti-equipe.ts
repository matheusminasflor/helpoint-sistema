// TI › Indicadores › bloco "Equipe" (dono, 2026-11-01; revisão aprovada): o FSENSE e as interrupções obedecem ao mesmo
// filtro de período da tela e comparam com o período anterior do mesmo tamanho, como os outros indicadores.
//
//   Meta mensal: a de percentual vale para qualquer período; a de quantidade (interrupções) é proporcional aos dias.
//   Farol: verde na meta · amarelo perto · vermelho fora. "Perto", em percentual, é até 10 pontos da meta (rodada 2,
//   2026-11-02: com a meta de SLA em 90%, os 70% da regra antiga deixavam 64% amarelo); em tempo e quantidade, até 70%
//   da meta (ou até 130% quando menor é melhor), como a planilha.

import { fromLocalISODate, toLocalISODate } from '@/lib/dates';
import type { IntervaloDeDias } from '@/lib/period';

/** `ate` exclusivo. */
export interface Periodo { de: string; ate: string }

export const somarDias = (iso: string, n: number) => {
  const d = fromLocalISODate(iso);
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
};

/** O domingo que fecha a semana (segunda a domingo) do dia — o mesmo que `ti_fsense_lancar` grava. */
export const domingoDaSemana = (iso: string) => somarDias(iso, (7 - fromLocalISODate(iso).getDay()) % 7);

/** O intervalo da tela (último dia incluído) → período com `ate` exclusivo. */
export const periodoDoIntervalo = ({ de, ate }: IntervaloDeDias): Periodo => ({ de, ate: somarDias(ate, 1) });

export const diasDoPeriodo = ({ de, ate }: Periodo) =>
  Math.round((fromLocalISODate(ate).getTime() - fromLocalISODate(de).getTime()) / 86_400_000);

/** O período anterior do mesmo tamanho, colado antes deste. */
export function periodoAnterior(p: Periodo): Periodo {
  return { de: somarDias(p.de, -diasDoPeriodo(p)), ate: p.de };
}

export const dentro = (iso: string, p: Periodo) => iso >= p.de && iso < p.ate;

/** A meta mensal no período: a de quantidade é proporcional aos dias (mês = 30); a de percentual vale inteira. */
export function metaDoPeriodo(metaMensal: number | undefined, dias: number, proporcional: boolean): number | undefined {
  if (metaMensal === undefined) return undefined;
  return proporcional ? Math.round((metaMensal * dias / 30) * 10) / 10 : metaMensal;
}

export type Sentido = 'mais' | 'menos';
export type Farol = 'no_alvo' | 'atencao' | 'fora' | 'sem_meta' | 'sem_dado';

export function farol(realizado: number | null, meta: number | undefined, sentido: Sentido, percentual = false): Farol {
  if (realizado === null) return 'sem_dado';
  if (meta === undefined || (meta === 0 && sentido === 'mais')) return 'sem_meta';
  if (sentido === 'mais') {
    const perto = percentual ? meta - 10 : 0.7 * meta;
    return realizado >= meta ? 'no_alvo' : realizado >= perto ? 'atencao' : 'fora';
  }
  const perto = percentual ? meta + 10 : 1.3 * meta;
  return realizado <= meta ? 'no_alvo' : realizado <= perto ? 'atencao' : 'fora';
}

const GRAVIDADE: Farol[] = ['sem_dado', 'sem_meta', 'no_alvo', 'atencao', 'fora'];
/** O pior de vários faróis: a pessoa com 3% de trabalho não fica verde só porque o ocioso dela é baixo (2026-11-02). */
export const piorFarol = (...f: Farol[]): Farol => f.reduce((a, b) => (GRAVIDADE.indexOf(b) > GRAVIDADE.indexOf(a) ? b : a));

export type Comparativo = 'acima' | 'abaixo' | 'igual';
export function comparar(atual: number | null, anterior: number | null): Comparativo | null {
  if (atual === null || anterior === null) return null;
  return atual > anterior ? 'acima' : atual < anterior ? 'abaixo' : 'igual';
}

// ─── FSENSE ──────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaFsense {
  data: string;
  colaborador: string;
  horas: number;
  trabalho: number | null;
  ocioso: number | null;
  bloqueada?: number | null;
  suspenso?: number | null;
}
export interface DoColaborador {
  colaborador: string;
  horas: number;
  trabalho: number | null;
  ocioso: number | null;
  /** As duas partes que completam a barra da pessoa (rodada 2): tela bloqueada e computador suspenso. */
  bloqueada: number | null;
  suspenso: number | null;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const mediaDo = (g: LinhaFsense[], campo: 'trabalho' | 'ocioso' | 'bloqueada' | 'suspenso') =>
  media(g.flatMap((l) => (l[campo] === null || l[campo] === undefined ? [] : [l[campo]!])));

/** Quem tem lançamento no período: horas somadas, percentuais pela média das linhas dela. */
export function porColaborador(linhas: LinhaFsense[], p: Periodo): DoColaborador[] {
  const grupos = new Map<string, LinhaFsense[]>();
  for (const l of linhas) {
    if (!dentro(l.data, p)) continue;
    const k = l.colaborador.trim().toLowerCase();
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return [...grupos.values()].map((g) => ({
    colaborador: g[0].colaborador.trim(),
    horas: Math.round(g.reduce((a, l) => a + l.horas, 0) * 10) / 10,
    trabalho: mediaDo(g, 'trabalho'),
    ocioso: mediaDo(g, 'ocioso'),
    bloqueada: mediaDo(g, 'bloqueada'),
    suspenso: mediaDo(g, 'suspenso'),
  }));
}

/** Média da equipe como a planilha (AVERAGEIF > 0): quem está zerado ou sem número não entra. */
type ParaMedia = Pick<DoColaborador, 'colaborador' | 'trabalho' | 'ocioso'>;

export function mediaDaEquipe(lista: ParaMedia[], campo: 'trabalho' | 'ocioso'): number | null {
  return media(lista.flatMap((c) => (c[campo] && c[campo]! > 0 ? [c[campo]!] : [])));
}

/**
 * O "anterior" da equipe, como a planilha: a média do período anterior **só de quem está no período atual** (a
 * planilha tira a média da coluna "anterior" das pessoas listadas). Quem saiu não puxa a comparação.
 */
export function mediaAnteriorDosMesmos(atual: ParaMedia[], anterior: ParaMedia[], campo: 'trabalho' | 'ocioso'): number | null {
  const nomes = new Set(atual.map((c) => c.colaborador.toLowerCase()));
  return mediaDaEquipe(anterior.filter((c) => nomes.has(c.colaborador.toLowerCase())), campo);
}

export interface LinhaColada {
  colaborador: string;
  horas: number;
  trabalho: number | null;
  bloqueada: number | null;
  ocioso: number | null;
  suspenso: number | null;
}

// Horas como o FSENSE mostra ("64h 45m", "64h45m"), em relógio ("45:36") ou decimal ("45,6"); percentual com ou sem "%".
const NUMERO = /(\d{1,3}\s*h\s*\d{1,2}\s*m?|\d{1,3}:\d{2})|(\d+(?:[.,]\d+)?)\s*%?/gi;

function paraNumero(t: string): number {
  const relogio = t.match(/^(\d{1,3})\s*[h:]\s*(\d{1,2})/i);
  if (relogio) return Math.round((Number(relogio[1]) + Number(relogio[2]) / 60) * 10) / 10;
  return Number(t.replace(',', '.'));
}

/** Uma célula da grade: número (horas em qualquer dos formatos, ou percentual) ou `null` se vazia; `NaN` se não é número. */
export function lerNumero(texto: string): number | null {
  const t = texto.replace('%', '').trim();
  if (!t) return null;
  if (!/^(\d{1,3}\s*h\s*\d{1,2}\s*m?|\d{1,3}:\d{2}|\d+(?:[.,]\d+)?)$/i.test(t)) return NaN;
  return paraNumero(t);
}

/** A soma dos quatro percentuais de uma pessoa, quando os quatro estão preenchidos (o FSENSE fecha em 100%). */
export function somaDosPercentuais(l: Pick<LinhaColada, 'trabalho' | 'bloqueada' | 'ocioso' | 'suspenso'>): number | null {
  const v = [l.trabalho, l.bloqueada, l.ocioso, l.suspenso];
  return v.some((x) => x === null) ? null : Math.round(v.reduce((a, b) => a! + b!, 0)! * 10) / 10;
}

/**
 * Lê a tabela colada (do FSENSE, da planilha ou digitada): uma pessoa por linha — nome, horas (45,6 ou 45:36) e, na
 * ordem, % trabalho, % bloqueada, % ocioso, % suspenso. Linha sem número (cabeçalho) é pulada; data no começo da linha
 * (dd/mm/aaaa) é ignorada.
 */
export function lerColagem(texto: string): { linhas: LinhaColada[]; erros: string[] } {
  const linhas: LinhaColada[] = [];
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, '').trim();
    if (!linha) return;
    const primeiro = linha.search(/\d/);
    if (primeiro === -1) return;
    const nome = linha.slice(0, primeiro).replace(/[\t;|,:-]+\s*$/, '').trim();
    if (!nome) {
      erros.push(`Linha ${i + 1}: falta o nome antes dos números.`);
      return;
    }
    const numeros = [...linha.slice(primeiro).matchAll(NUMERO)].map((m) => paraNumero(m[1] ?? m[2]));
    const [horas, trabalho = null, bloqueada = null, ocioso = null, suspenso = null] = numeros;
    const fora = [trabalho, bloqueada, ocioso, suspenso].some((v) => v !== null && (v < 0 || v > 100));
    if (fora) {
      erros.push(`Linha ${i + 1} (${nome}): percentual fora de 0 a 100.`);
      return;
    }
    linhas.push({ colaborador: nome, horas, trabalho, bloqueada, ocioso, suspenso });
  });
  return { linhas, erros };
}

// ─── Interrupções ────────────────────────────────────────────────────────────────────────────────────

export interface Interrupcao { inicio: string; fim: string | null; sem_horario: boolean }

/** Horas paradas das interrupções que começaram no período; a que ainda está parada conta até agora. */
export function horasParadas(lista: Interrupcao[], p: Periodo, agora: Date = new Date()): number {
  const ms = lista
    .filter((i) => !i.sem_horario && dentro(toLocalISODate(new Date(i.inicio)), p))
    .reduce((a, i) => a + ((i.fim ? new Date(i.fim) : agora).getTime() - new Date(i.inicio).getTime()), 0);
  return Math.round((ms / 3_600_000) * 10) / 10;
}
