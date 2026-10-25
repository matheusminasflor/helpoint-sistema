// A meta fixa de um indicador de setor (decisão do dono, 2026-10-25). O número é o alvo; o sentido vem do indicador:
// onde "menos é melhor" a meta é um teto ("até 24h"), onde "mais é melhor" é um piso ("pelo menos 90%").

export type Sentido = 'mais' | 'menos';

export function foraDaMeta(valor: number | null, meta: number | undefined, sentido: Sentido): boolean {
  if (valor === null || meta === undefined) return false;
  return sentido === 'menos' ? valor > meta : valor < meta;
}

export function textoDaMeta(metaFormatada: string, sentido: Sentido): string {
  return sentido === 'menos' ? `meta: até ${metaFormatada}` : `meta: pelo menos ${metaFormatada}`;
}
