// "Prazo usado" (dono, 2026-10-20): quanto do prazo de resolução a pessoa gastou até resolver. Quem resolve tudo
// perto de 100% deixa para o limite — o "SLA cumprido %" não mostra isso, porque no prazo é no prazo.
// A conta é em minutos de expediente, do início do prazo vigente até resolver (`chamados_tempo_util`, dono, 2026-11-06).
export function fracaoDoPrazo(usados: number, total: number): number | null {
  return total > 0 ? usados / total : null;
}

/** Média em %, ou null sem nenhum chamado com prazo. Acima de 80% é "resolve no limite". */
export function prazoUsadoMedio(fracoes: number[]): number | null {
  return fracoes.length > 0 ? Math.round((fracoes.reduce((s, f) => s + f, 0) / fracoes.length) * 100) : null;
}

export const LIMITE_DO_PRAZO_USADO = 80;
