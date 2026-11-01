// TI › Indicadores › Semanal (dono, 2026-11-01; docs/proposta-indicadores-da-semana.md): as regras da planilha que o
// dono apresenta ao diretor toda segunda, para o número do Helpoint bater com o que ele já conhece.
//
//   Semanas do mês: S1 = dias 1–7 · S2 = 8–14 · S3 = 15–21 · S4 = 22 ao fim. 0 = o mês inteiro.
//   Comparativo: mês inteiro → mês anterior · S2–S4 → semana anterior · S1 → S4 do mês anterior.
//   Farol: verde na meta · amarelo até 70% da meta (ou até 130% quando menor é melhor) · vermelho fora.

import { addMonths, endOfMonth } from 'date-fns';
import { fromLocalISODate, toLocalISODate } from '@/lib/dates';

export type Semana = 0 | 1 | 2 | 3 | 4;
/** `ate` exclusivo. */
export interface Periodo { de: string; ate: string }

function dia(competencia: string, n: number): Date {
  const [a, m] = competencia.split('-').map(Number);
  return new Date(a, m - 1, n);
}
const fimExclusivo = (competencia: string) => toLocalISODate(new Date(endOfMonth(dia(competencia, 1)).getTime() + 86_400_000));

export function semanaDoDia(iso: string): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.floor((fromLocalISODate(iso).getDate() - 1) / 7) + 1) as 1 | 2 | 3 | 4;
}

export function periodoDaSemana(competencia: string, s: Semana): Periodo {
  if (s === 0) return { de: toLocalISODate(dia(competencia, 1)), ate: fimExclusivo(competencia) };
  return {
    de: toLocalISODate(dia(competencia, (s - 1) * 7 + 1)),
    ate: s === 4 ? fimExclusivo(competencia) : toLocalISODate(dia(competencia, s * 7 + 1)),
  };
}

export function competenciaAnterior(competencia: string): string {
  return toLocalISODate(addMonths(dia(competencia, 1), -1)).slice(0, 7);
}

export function periodoAnterior(competencia: string, s: Semana): Periodo {
  if (s === 0) return periodoDaSemana(competenciaAnterior(competencia), 0);
  if (s === 1) return periodoDaSemana(competenciaAnterior(competencia), 4);
  return periodoDaSemana(competencia, (s - 1) as Semana);
}

export function textoDoAnterior(s: Semana): string {
  return s === 0 ? 'do mês anterior' : 'da semana anterior';
}

export const dentro = (iso: string, p: Periodo) => iso >= p.de && iso < p.ate;

/** A meta mensal vale no período; a de quantidade divide por 4 na semana. */
export function metaDoPeriodo(metaMensal: number | undefined, s: Semana, divide: boolean): number | undefined {
  if (metaMensal === undefined) return undefined;
  return divide && s !== 0 ? metaMensal / 4 : metaMensal;
}

export type Sentido = 'mais' | 'menos';
export type Farol = 'no_alvo' | 'atencao' | 'fora' | 'sem_meta' | 'sem_dado';

export function farol(realizado: number | null, meta: number | undefined, sentido: Sentido): Farol {
  if (realizado === null) return 'sem_dado';
  if (meta === undefined || (meta === 0 && sentido === 'mais')) return 'sem_meta';
  if (sentido === 'mais') return realizado >= meta ? 'no_alvo' : realizado >= 0.7 * meta ? 'atencao' : 'fora';
  return realizado <= meta ? 'no_alvo' : realizado <= 1.3 * meta ? 'atencao' : 'fora';
}

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
}
export interface DoColaborador { colaborador: string; horas: number; trabalho: number | null; ocioso: number | null }

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

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
    trabalho: media(g.flatMap((l) => (l.trabalho === null ? [] : [l.trabalho]))),
    ocioso: media(g.flatMap((l) => (l.ocioso === null ? [] : [l.ocioso]))),
  }));
}

/** Média da equipe como a planilha (AVERAGEIF > 0): quem está zerado ou sem número não entra. */
export function mediaDaEquipe(lista: DoColaborador[], campo: 'trabalho' | 'ocioso'): number | null {
  return media(lista.flatMap((c) => (c[campo] && c[campo]! > 0 ? [c[campo]!] : [])));
}

export interface LinhaColada {
  colaborador: string;
  horas: number;
  trabalho: number | null;
  bloqueada: number | null;
  ocioso: number | null;
  suspenso: number | null;
}

const NUMERO = /(\d{1,3}:\d{2})|(\d+(?:[.,]\d+)?)\s*%?/g;

function paraNumero(t: string): number {
  if (t.includes(':')) {
    const [h, m] = t.split(':').map(Number);
    return Math.round((h + m / 60) * 10) / 10;
  }
  return Number(t.replace(',', '.'));
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
