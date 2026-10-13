// A chama da "Sua Performance" — o jogo de resolver muito E no prazo.
//
// Decisões do dono (2026-10-13; trocam as de 2026-10-09):
//   * o período é a SEMANA DE TRABALHO (segunda até hoje, zera toda segunda) ou o MÊS (dia 1 até hoje) —
//     os "7 dias corridos" arrastavam a semana passada e davam EM CHAMAS na terça;
//   * a SEQUÊNCIA conta chamados e tarefas resolvidos SEGUIDOS NO PRAZO: cada um no prazo soma +1, um
//     atrasado zera; e zera toda segunda;
//   * a chama acende pela sequência da semana: 3 "Acesa", 6 "Pegando fogo", 10 "EM CHAMAS" — medido na
//     semana de 5 a 9/10: a equipe resolveu 1 a 7, então 3/6/10 acende quem se esforça e deixa o topo raro.

export type NivelDaChama = 0 | 1 | 2 | 3;
export type Periodo = 'semana' | 'mes';

const FAIXAS: readonly number[] = [3, 6, 10];
const NOMES = ['Apagada', 'Acesa', 'Pegando fogo', 'Em chamas'] as const;

/** Segunda-feira 00:00 (semana) ou dia 1 00:00 (mês), no relógio de quem está usando — no Brasil. */
export function inicioDoPeriodo(periodo: Periodo, agora = new Date()): Date {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  if (periodo === 'mes') d.setDate(1);
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // domingo = 6 dias depois da segunda
  return d;
}

/** Uma entrega: quando foi resolvida e se foi no prazo (sem prazo conta como no prazo — não havia o que perder). */
export interface Entrega { quando: string; noPrazo: boolean }

const emOrdem = (entregas: Entrega[], desde: Date) =>
  entregas.filter((e) => new Date(e.quando) >= desde).sort((a, b) => a.quando.localeCompare(b.quando));

/** A sequência de agora: as entregas no prazo seguidas, das mais recentes para trás, só desta semana. */
export function sequenciaDaSemana(entregas: Entrega[], agora = new Date()): number {
  const daSemana = emOrdem(entregas, inicioDoPeriodo('semana', agora));
  let n = 0;
  for (let i = daSemana.length - 1; i >= 0 && daSemana[i].noPrazo; i--) n++;
  return n;
}

/** A melhor sequência do mês: a mais longa, zerando a cada atraso e a cada segunda-feira. */
export function melhorSequenciaDoMes(entregas: Entrega[], agora = new Date()): number {
  let melhor = 0;
  let atual = 0;
  let semana = '';
  for (const e of emOrdem(entregas, inicioDoPeriodo('mes', agora))) {
    const s = inicioDoPeriodo('semana', new Date(e.quando)).toISOString();
    if (s !== semana) { semana = s; atual = 0; }
    atual = e.noPrazo ? atual + 1 : 0;
    melhor = Math.max(melhor, atual);
  }
  return melhor;
}

export function nivelDaChama(sequencia: number) {
  const [um, dois, tres] = FAIXAS;
  const nivel: NivelDaChama = sequencia >= tres ? 3 : sequencia >= dois ? 2 : sequencia >= um ? 1 : 0;
  const proxima = nivel < 3 ? FAIXAS[nivel] : null;
  const frase = nivel === 3
    ? `${sequencia} resolvidos seguidos no prazo nesta semana. Ninguém segura!`
    : nivel === 0
      ? `Resolva ${um - sequencia} no prazo, sem atrasar nenhum, para acender. Zera toda segunda.`
      : `${sequencia} seguidos no prazo. Mais ${proxima! - sequencia} para o próximo nível — um atraso zera.`;
  return { nivel, nome: NOMES[nivel], frase };
}
