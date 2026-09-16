import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

/**
 * `aaaa-mm-dd` → `Date` no fuso local, à meia-noite.
 *
 * A mesma regra 4, do lado da leitura: `new Date('2026-09-30')` é meia-noite em
 * **UTC**, e no Brasil isso é o dia 29. Todo lugar que precisa transformar um
 * dia puro do banco em `Date` para exibir passa por aqui.
 */
export function fromLocalISODate(iso: string): Date {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Um dia puro escrito para gente ler: `2026-09-30` → "30 de set". */
export function diaCurto(iso: string): string {
  return format(fromLocalISODate(iso), "d 'de' MMM", { locale: ptBR });
}

/**
 * Momento do banco (`timestamptz`) → o que `<input type="datetime-local">` lê.
 *
 * As três acima são para **dia puro** (`date`), onde o problema é o UTC comer o
 * fuso. Aqui é o contrário: o valor do banco já traz o fuso, então `new Date()`
 * acerta sozinho — o que falta é cortar para o formato do input, que não aceita
 * segundos nem o `Z`. Escrever `iso.slice(0, 16)` seria o erro simétrico ao da
 * regra 4: mostraria a hora em UTC, três horas adiantada no Brasil.
 */
export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${toLocalISODate(d)}T${hh}:${mm}`;
}

/**
 * O que o `<input type="datetime-local">` devolve → momento para o banco.
 *
 * O `datetime-local` entrega texto parcial enquanto a pessoa digita, e
 * `new Date('2026-13-45T99:99').toISOString()` levanta `RangeError` — que não
 * vira aviso na tela, vira tela branca. Aqui ele vira erro com frase.
 */
export function fromLocalDateTimeInput(valor: string): string {
  // Sem fuso no texto, o JavaScript lê `datetime-local` como hora **local** —
  // que é justamente o que a pessoa digitou olhando o relógio da parede.
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new Error('Data e hora inválidas.');
  return d.toISOString();
}

/** Um momento escrito para gente ler: "30 de set, 14:00". */
export function dataHora(iso: string): string {
  return format(new Date(iso), "d 'de' MMM', ' HH:mm", { locale: ptBR });
}
