/**
 * Regra 4 de escrita (CLAUDE.md): "hoje" é a data LOCAL.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC. No Brasil,
 * das 21h à meia-noite isso já é amanhã: conta que vence hoje aparecia
 * "atrasada" à noite, e "Liquidar" gravava a baixa no dia seguinte — no
 * último dia do mês, no mês errado. Estas duas funções usam o calendário da
 * máquina do usuário, que é o que ele vê na parede.
 */

/** `Date` → `aaaa-mm-dd` no fuso local. */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Hoje, `aaaa-mm-dd`, no fuso local. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** Hoje mais N dias (N pode ser negativo), `aaaa-mm-dd`, no fuso local. */
export function daysFromTodayISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
