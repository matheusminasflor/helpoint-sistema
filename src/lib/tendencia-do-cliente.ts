// A tendência do cliente na Carteira (dono, 2026-10-15): a média dos últimos 3 meses contra a de 12 — "Em alta" a
// partir de 110%, "Esfriando" abaixo de 80%, "Estável" entre os dois; "Inativo" quem não compra há mais de 120 dias.
// Sem média de 12 meses não há base para comparar.
export type Tendencia = 'alta' | 'estavel' | 'esfriando' | 'inativo' | 'sem_base';

export function tendenciaDoCliente(l: { situacao: string; media_3m: number; media_12m: number }): Tendencia {
  if (l.situacao === 'inativo') return 'inativo';
  if (l.media_12m <= 0) return 'sem_base';
  const razao = l.media_3m / l.media_12m;
  if (razao >= 1.1) return 'alta';
  if (razao < 0.8) return 'esfriando';
  return 'estavel';
}
