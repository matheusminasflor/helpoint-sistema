// A lista "Falta informar a nota": o rótulo de cada situação e há quantos dias o pedido foi aprovado.
import { differenceInCalendarDays } from 'date-fns';
import { fromLocalISODate } from '@/lib/dates';

export type SituacaoParaResolver = 'falta_nota' | 'corrigir' | 'valor_diferente';

export const TITULOS: Record<SituacaoParaResolver, { rotulo: string; classe: string }> = {
  falta_nota: { rotulo: 'Falta a nota', classe: 'badge-warning' },
  corrigir: { rotulo: 'Nota não encontrada', classe: 'badge-danger' },
  valor_diferente: { rotulo: 'Valor corrigido pelo Forteplus', classe: 'badge-info' },
};

export const diasDesde = (quando: string, hoje: string) =>
  Math.max(0, differenceInCalendarDays(fromLocalISODate(hoje), new Date(quando)));
