// A lista "Falta informar a nota": o rótulo de cada situação e há quantos dias o pedido foi aprovado.
import { differenceInCalendarDays } from 'date-fns';
import { fromLocalISODate } from '@/lib/dates';

export type SituacaoParaResolver = 'falta_nota' | 'corrigir' | 'valor_diferente';

export const TITULOS: Record<SituacaoParaResolver, { rotulo: string; classe: string }> = {
  falta_nota: { rotulo: 'Falta a nota', classe: 'badge-warning' },
  corrigir: { rotulo: 'Corrigir: nota não encontrada', classe: 'badge-danger' },
  valor_diferente: { rotulo: 'Corrigida pelo Forteplus', classe: 'badge-warning' },
};

/** "Aprovado há 5 dias": a partir de 3 dias o selo fica vermelho, para o atraso saltar na lista. */
export function esperaDaNota(dias: number) {
  const rotulo = dias === 0 ? 'Aprovado hoje' : dias === 1 ? 'Aprovado ontem' : `Aprovado há ${dias} dias`;
  return { rotulo, atrasada: dias >= 3 };
}

export const diasDesde = (quando: string, hoje: string) =>
  Math.max(0, differenceInCalendarDays(fromLocalISODate(hoje), new Date(quando)));
