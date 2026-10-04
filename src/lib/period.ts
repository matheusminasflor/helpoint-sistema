import { endOfDay } from 'date-fns';
import { fromLocalISODate, toLocalISODate, todayISO } from '@/lib/dates';

export type Period = '7d' | '30d' | '90d' | '12m' | 'all';

export const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo o período' },
];

export function periodStart(p: Period): Date | null {
  const d = new Date();
  if (p === '7d') { d.setDate(d.getDate() - 7); return d; }
  if (p === '30d') { d.setDate(d.getDate() - 30); return d; }
  if (p === '90d') { d.setDate(d.getDate() - 90); return d; }
  if (p === '12m') { d.setMonth(d.getMonth() - 12); return d; }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Período PERSONALIZADO (pedido do dono, 2026-10-03): toda tela de
// indicadores ganha "Personalizado" — a pessoa escolhe o dia de início e o
// dia de fim. Os dois dias são `aaaa-mm-dd` LOCAIS (regra 4), e todo par
// passa por `erroDoIntervalo` antes de virar consulta: intervalo incompleto
// ou invertido não chega ao banco, a tela segue no período anterior e diz
// por quê. A UI é uma só, `<PeriodoPersonalizado>`.
// ═══════════════════════════════════════════════════════════════════════════

export interface IntervaloDeDias {
  /** Primeiro dia, `aaaa-mm-dd`, incluído. */
  de: string;
  /** Último dia, `aaaa-mm-dd`, incluído. */
  ate: string;
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `aaaa-mm-dd` que existe no calendário (`2026-02-30` não existe). O piso de
 * 1900 barra o ano a meio caminho: o `<input type="date">` entrega `0202-…`
 * enquanto a pessoa ainda digita `2025`, e isso não pode virar consulta.
 */
function diaValido(iso: string): boolean {
  return DIA_ISO.test(iso) && Number(iso.slice(0, 4)) >= 1900 && toLocalISODate(fromLocalISODate(iso)) === iso;
}

/** Por que o intervalo não serve — ou `null` quando serve. A frase vai direto para a tela. */
export function erroDoIntervalo(de: string | null | undefined, ate: string | null | undefined): string | null {
  if (!de || !ate) return 'Preencha as duas datas.';
  if (!diaValido(de) || !diaValido(ate)) return 'Data inválida.';
  if (ate < de) return 'A data final não pode ser antes da inicial.';
  return null;
}

/** Valor do período "Personalizado" — o mesmo em toda tela e na URL (`?periodo=personalizado&de=…&ate=…`). */
export const PERSONALIZADO = 'personalizado' as const;

/**
 * Os filtros rápidos do calendário (pedido do dono, 2026-10-03): o mês, o
 * trimestre e o ano DE HOJE, do primeiro ao último dia — não "os últimos N
 * dias". Uma conta só, aqui; toda tela chama `intervaloDoPeriodoRapido`.
 */
export type PeriodoRapido = 'este_mes' | 'este_trimestre' | 'este_ano';

export const OPCOES_RAPIDAS: { value: PeriodoRapido; label: string }[] = [
  { value: 'este_mes', label: 'Este mês' },
  { value: 'este_trimestre', label: 'Este trimestre' },
  { value: 'este_ano', label: 'Este ano' },
];

/** Os três rápidos e o "Personalizado", na ordem em que aparecem depois dos presets de cada tela. */
export const OPCOES_DE_CALENDARIO: { value: PeriodoRapido | typeof PERSONALIZADO; label: string }[] = [
  ...OPCOES_RAPIDAS,
  { value: PERSONALIZADO, label: 'Personalizado' },
];

export function ehPeriodoRapido(valor: string): valor is PeriodoRapido {
  return valor === 'este_mes' || valor === 'este_trimestre' || valor === 'este_ano';
}

export function intervaloDoPeriodoRapido(periodo: PeriodoRapido, hojeISO: string = todayISO()): IntervaloDeDias {
  const ano = Number(hojeISO.slice(0, 4));
  const mes = Number(hojeISO.slice(5, 7));
  if (periodo === 'este_ano') return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  if (periodo === 'este_mes') return primeiroEUltimoDiaDoMes(ano, mes);
  const primeiroMes = Math.floor((mes - 1) / 3) * 3 + 1;
  return { de: primeiroEUltimoDiaDoMes(ano, primeiroMes).de, ate: primeiroEUltimoDiaDoMes(ano, primeiroMes + 2).ate };
}

/** O intervalo como dois instantes locais: do começo do primeiro dia ao fim do último. */
export function intervaloEmDatas({ de, ate }: IntervaloDeDias): { inicio: Date; fim: Date } {
  return { inicio: fromLocalISODate(de), fim: endOfDay(fromLocalISODate(ate)) };
}

/** `2026-03-10`–`2026-04-25` → "10/03/2026 a 25/04/2026". Texto puro, sem passar por `Date`. */
export function rotuloDoIntervalo({ de, ate }: IntervaloDeDias): string {
  const curto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return `${curto(de)} a ${curto(ate)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESES INTEIROS (decisão do dono, 2026-10-03). O que é mensal por natureza —
// meta, apuração de cashback, folha, o realizado que o diretor informa — não se
// rateia: com um intervalo, valem os MESES INTEIROS que ele toca (10/03–25/04 →
// março e abril inteiros), e a tela diz quais foram. O que tem data de verdade
// (venda, lançamento, conta) continua nos dias exatos. A conta do banco é a
// mesma (`date_trunc('month', …)` nas funções que recebem `p_de`/`p_ate`).
// ═══════════════════════════════════════════════════════════════════════════

const NOMES_DOS_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Os meses que o intervalo toca, `aaaa-mm`, em ordem: 10/03–25/04 → `['2026-03', '2026-04']`. */
export function mesesDoIntervalo({ de, ate }: IntervaloDeDias): string[] {
  const meses: string[] = [];
  let ano = Number(de.slice(0, 4));
  let mes = Number(de.slice(5, 7));
  const fim = ate.slice(0, 7);
  for (;;) {
    const atual = `${ano}-${String(mes).padStart(2, '0')}`;
    if (atual > fim) break;
    meses.push(atual);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

/** Os meses inteiros como intervalo de dias: 10/03–25/04 → 01/03–30/04. */
export function mesesInteirosDoIntervalo({ de, ate }: IntervaloDeDias): IntervaloDeDias {
  return {
    de: primeiroEUltimoDiaDoMes(Number(de.slice(0, 4)), Number(de.slice(5, 7))).de,
    ate: primeiroEUltimoDiaDoMes(Number(ate.slice(0, 4)), Number(ate.slice(5, 7))).ate,
  };
}

/**
 * A frase da tela quando o intervalo NÃO é de meses inteiros: "Meta e cashback
 * são mensais — considerados os meses de março a abril." `null` quando ele já
 * começa no dia 1 e termina no último dia (o "Este mês", o "Este trimestre") —
 * aí não há o que avisar. O ano só aparece quando os dois meses são de anos
 * diferentes.
 */
export function avisoDeMesesInteiros(assunto: string, intervalo: IntervaloDeDias | null | undefined): string | null {
  if (!intervalo) return null;
  const inteiros = mesesInteirosDoIntervalo(intervalo);
  if (inteiros.de === intervalo.de && inteiros.ate === intervalo.ate) return null;
  const anoDe = intervalo.de.slice(0, 4);
  const anoAte = intervalo.ate.slice(0, 4);
  const nome = (iso: string, comAno: boolean) =>
    `${NOMES_DOS_MESES[Number(iso.slice(5, 7)) - 1]}${comAno ? ` de ${iso.slice(0, 4)}` : ''}`;
  if (intervalo.de.slice(0, 7) === intervalo.ate.slice(0, 7)) {
    return `${assunto} — considerado o mês de ${nome(intervalo.de, false)} inteiro.`;
  }
  const comAno = anoDe !== anoAte;
  return `${assunto} — considerados os meses de ${nome(intervalo.de, comAno)} a ${nome(intervalo.ate, comAno)}.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// O seletor de período do §14 do docs/instrucoes-painel-comercial.md
// ("cada mês, últimos 3, últimos 6, ano todo"), correção da auditoria da
// L6e (achado D2 — o documento pedia o seletor e ele não existia em nenhuma
// tela do Insights do Comercial). Ver `FiltrosComerciais` (a UI) e
// `usePeriodoComercial` em `useComercialPainel.ts` (o estado) — quem chama
// nunca deriva `de`/`ate` por conta própria, mesmo motivo de
// `mesesFechados` em `comparativoAnos.ts`.
// ═══════════════════════════════════════════════════════════════════════════

export type PeriodoComercial = 'mes' | 'ultimos3' | 'ultimos6' | 'ano' | PeriodoRapido | typeof PERSONALIZADO;

/** Último dia do mês (1-indexado): o truque do dia 0 do mês seguinte, sem fixar 28/29/30/31 na mão. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function primeiroEUltimoDiaDoMes(ano: number, mes: number): { de: string; ate: string } {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = String(ultimoDiaDoMes(ano, mes)).padStart(2, '0');
  return { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${ultimoDia}` };
}

/**
 * O `de`/`ate` do seletor de período do §14. "Ano todo" e "um mês" giram em
 * torno do `ano` escolhido no seletor; "últimos 3"/"últimos 6" são SEMPRE
 * relativos a hoje (regra 4 das cinco — nunca ao ano escolhido), senão o
 * botão viraria um recorte do ano picotado, não a janela corrida que o §14
 * pede. `hojeISO` tem `todayISO()` como padrão e existe como parâmetro só
 * para o teste injetar uma data fixa (mesmo molde de `mesesFechados`).
 *
 * "Personalizado" devolve o `intervalo` escolhido; sem intervalo válido cai
 * no ano todo — nunca numa consulta com data quebrada.
 */
export function calcularPeriodoComercial(
  periodo: PeriodoComercial,
  ano: number,
  mes: number,
  hojeISO: string = todayISO(),
  intervalo?: IntervaloDeDias | null,
): { de: string; ate: string } {
  if (periodo === 'personalizado') {
    if (intervalo && !erroDoIntervalo(intervalo.de, intervalo.ate)) return { de: intervalo.de, ate: intervalo.ate };
    return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  }
  if (ehPeriodoRapido(periodo)) return intervaloDoPeriodoRapido(periodo, hojeISO);
  if (periodo === 'ano') return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  if (periodo === 'mes') return primeiroEUltimoDiaDoMes(ano, mes);

  const n = periodo === 'ultimos3' ? 3 : 6;
  const anoDeHoje = Number(hojeISO.slice(0, 4));
  const mesDeHoje = Number(hojeISO.slice(5, 7));
  // `new Date` normaliza mês fora de 1-12 rolando para o ano vizinho — é
  // assim que a virada de ano ("últimos 3" em fevereiro começa em dezembro
  // do ano anterior) acontece sem lógica própria de empréstimo de mês.
  const inicio = new Date(anoDeHoje, mesDeHoje - 1 - (n - 1), 1);
  const { de } = primeiroEUltimoDiaDoMes(inicio.getFullYear(), inicio.getMonth() + 1);
  const { ate } = primeiroEUltimoDiaDoMes(anoDeHoje, mesDeHoje);
  return { de, ate };
}
