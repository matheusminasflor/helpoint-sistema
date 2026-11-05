// O Android manda a mesma fala mais de uma vez: o resultado vem acumulado ("abre", "abre um", "abre um chamado") e marca
// `isFinal` em trecho ainda provisório (dono, 2026-11-05: "repetindo as frases"). Nada aqui confia em `isFinal`.
const limpo = (t: string) => t.trim().replace(/\s+/g, ' ');
const comparavel = (t: string) => limpo(t).toLocaleLowerCase('pt-BR');
const comecaCom = (t: string, inicio: string) => t === inicio || t.startsWith(`${inicio} `);

/** Junta o trecho ao que já veio, sem repetir o que o aparelho mandou de novo. */
export function somarTrecho(acumulado: string, trecho: string): string {
  const a = comparavel(acumulado);
  const t = comparavel(trecho);
  if (!t) return limpo(acumulado);
  if (!a || comecaCom(t, a)) return limpo(trecho);
  if (a === t || a.endsWith(` ${t}`)) return limpo(acumulado);
  return `${limpo(acumulado)} ${limpo(trecho)}`;
}

/** O texto de uma escuta inteira, a partir dos resultados que o aparelho entregou até agora. */
export const textoDaEscuta = (transcritos: string[]) => transcritos.reduce(somarTrecho, '');

/** O que esta escuta traz de novo em relação à anterior; vazio quando ela só repetiu. */
export function trechoNovo(anterior: string, atual: string): string {
  const a = comparavel(anterior);
  const t = comparavel(atual);
  if (!a) return limpo(atual);
  if (a === t) return '';
  return comecaCom(t, a) ? limpo(atual).slice(limpo(anterior).length).trim() : limpo(atual);
}
