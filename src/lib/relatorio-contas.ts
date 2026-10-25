// Contas pequenas dos relatórios da etapa 5.
/** Média de uma lista (nulos fora); nula se não sobrar nada. */
export function media(valores: Array<number | null | undefined>): number | null {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
export const soma = (valores: Array<number | null | undefined>) => valores.reduce<number>((s, x) => s + (Number(x) || 0), 0);
