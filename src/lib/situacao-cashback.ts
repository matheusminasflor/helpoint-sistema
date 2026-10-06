// A situação do cashback de um mês, em português (dono, 2026-10-06 — docs/regra-cashback.md):
// o cashback gerado só é liberado se o mês seguinte comprar pelo menos a metade.
import type { SituacaoCashback } from '@/types/comercial';

export function rotuloSituacaoCashback(s: SituacaoCashback | null): string {
  if (s === 'liberado') return 'Liberado';
  if (s === 'aguardando') return 'Aguardando o mês seguinte';
  if (s === 'nao_liberado') return 'Não liberado';
  return '—';
}
