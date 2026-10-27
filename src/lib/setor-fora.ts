// Quais períodos de "setor fora" (20270212030000) pararam o prazo deste chamado: os que caem entre o dia em que ele
// abriu e o dia em que foi resolvido (ou hoje, se segue aberto). É a mesma janela que o banco recalcula.
import { toLocalISODate, todayISO } from '@/lib/dates';

interface Periodo { id: string; de: string; ate: string; motivo: string }
interface Chamado { created_at: string; resolved_at?: string | null; closed_at?: string | null }

export function periodosDoChamado<P extends Periodo>(periodos: P[], chamado: Chamado | null | undefined): P[] {
  if (!chamado) return [];
  const abriu = toLocalISODate(new Date(chamado.created_at));
  const fim = chamado.resolved_at ?? chamado.closed_at;
  const terminou = fim ? toLocalISODate(new Date(fim)) : todayISO();
  return periodos.filter((p) => p.de <= terminou && p.ate >= abriu);
}
