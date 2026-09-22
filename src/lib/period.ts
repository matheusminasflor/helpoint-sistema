import { todayISO } from '@/lib/dates';

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
// O seletor de período do §14 do docs/instrucoes-painel-comercial.md
// ("cada mês, últimos 3, últimos 6, ano todo"), correção da auditoria da
// L6e (achado D2 — o documento pedia o seletor e ele não existia em nenhuma
// tela do Insights do Comercial). Ver `FiltrosComerciais` (a UI) e
// `usePeriodoComercial` em `useComercialPainel.ts` (o estado) — quem chama
// nunca deriva `de`/`ate` por conta própria, mesmo motivo de
// `mesesFechados` em `comparativoAnos.ts`.
// ═══════════════════════════════════════════════════════════════════════════

export type PeriodoComercial = 'mes' | 'ultimos3' | 'ultimos6' | 'ano';

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
 */
export function calcularPeriodoComercial(
  periodo: PeriodoComercial,
  ano: number,
  mes: number,
  hojeISO: string = todayISO(),
): { de: string; ate: string } {
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
