// Os números de vencimento da tela de Licenças (proposta "Helpoint no dia a dia", defeito 5, 2026-10-24).
// "Vencem este mês" e "Próximos 30 dias" usavam a mesma conta (hoje + 30 dias) e mostravam o mesmo número.
// Agora: este mês = até o último dia do mês corrente; 30 e 90 dias contam de hoje. As datas `AAAA-MM-DD` são lidas
// no dia local (parseISO): `new Date('AAAA-MM-DD')` é UTC e, no Brasil, vira o dia anterior (regra 4).
import { addDays, endOfMonth, endOfYear, isAfter, parseISO, startOfDay } from 'date-fns';

export interface Vencimentos { vencidas: number; esteMes: number; em30: number; em90: number; esteAno: number }

export function contarVencimentos(datas: (string | null | undefined)[], agora: Date): Vencimentos {
  const hoje = startOfDay(agora);
  const fimDoMes = endOfMonth(hoje), em30 = addDays(hoje, 30), em90 = addDays(hoje, 90), fimDoAno = endOfYear(hoje);
  const v: Vencimentos = { vencidas: 0, esteMes: 0, em30: 0, em90: 0, esteAno: 0 };
  for (const s of datas) {
    if (!s) continue;
    const d = parseISO(s);
    if (d < hoje) { v.vencidas++; continue; }   // vence hoje ainda não venceu
    if (!isAfter(d, fimDoMes)) v.esteMes++;
    if (!isAfter(d, em30)) v.em30++;
    if (!isAfter(d, em90)) v.em90++;
    if (!isAfter(d, fimDoAno)) v.esteAno++;
  }
  return v;
}
