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

const LETRA = '\\p{L}\\p{N}';
const HESITACAO = new RegExp(`(?<![${LETRA}])(?:e{2,}h*|é{2,}h*|eh+|éh+|ah{2,}|ãh+|ahn+|h[uü]m+|hm+|uhm+|m{2,})(?![${LETRA}])[,.]?`, 'giu');
const DUAS_REPETIDAS = /(?<![\p{L}\p{N}])(\p{L}+\s+\p{L}+)(?:\s+\1)+(?![\p{L}\p{N}])/giu;
const UMA_REPETIDA = /(?<![\p{L}\p{N}])(\p{L}+)(?:[\s,]+\1)+(?![\p{L}\p{N}])/giu;

/** Tira o "ééé", o "hum" e a palavra gaguejada, sem IA (dono, 2026-11-05). Reescrever a frase é do Organizar e do Melhorar. */
export const limparFala = (t: string) =>
  limpo(t.replace(HESITACAO, ' ').replace(DUAS_REPETIDAS, '$1').replace(UMA_REPETIDA, '$1')).replace(/^[,.;]\s*/, '');

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
