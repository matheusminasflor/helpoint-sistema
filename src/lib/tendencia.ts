// O gráfico "Abertos × Resolvidos" em barras (revisão dos Indicadores da TI, 2026-11-01): a linha curva descia a zero
// todo fim de semana e subia de novo, como se houvesse valores entre os dias. Até 31 dias: uma barra por dia, sem o
// sábado e o domingo vazios. Acima: uma barra por semana (a partir da segunda), senão as barras ficam finas demais.
import { fromLocalISODate, toLocalISODate } from '@/lib/dates';

export interface PontoDaTendencia { date: string; opened: number; resolved: number }
export interface BarraDaTendencia extends PontoDaTendencia { rotulo: string }

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function barrasDaTendencia(pontos: PontoDaTendencia[]): BarraDaTendencia[] {
  if (pontos.length <= 31) {
    return pontos
      .filter((p) => {
        const dia = fromLocalISODate(p.date).getDay();
        return !((dia === 0 || dia === 6) && p.opened === 0 && p.resolved === 0);
      })
      .map((p) => ({ ...p, rotulo: ddmm(p.date) }));
  }
  const semanas = new Map<string, BarraDaTendencia>();
  for (const p of pontos) {
    const d = fromLocalISODate(p.date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const segunda = toLocalISODate(d);
    const s = semanas.get(segunda) ?? { date: segunda, opened: 0, resolved: 0, rotulo: `sem. ${ddmm(segunda)}` };
    s.opened += p.opened;
    s.resolved += p.resolved;
    semanas.set(segunda, s);
  }
  return [...semanas.values()].sort((a, b) => a.date.localeCompare(b.date));
}
