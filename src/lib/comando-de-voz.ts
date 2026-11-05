// Exportar relatório por voz, sem IA: regras simples sobre o texto falado (proposta aprovada em 2026-11-04). Só TI e
// Marketing têm o PDF de Indicadores; o resto segue como chamado.
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PERIODOS: [RegExp, string][] = [
  [/semana passada/, 'semana_passada'],
  [/esta semana|essa semana/, 'esta_semana'],
  [/mes passado/, 'mes_passado'],
  [/este mes|esse mes/, 'este_mes'],
];

const SETORES: [RegExp, string][] = [
  [/\bti\b|tecnologia/, '/ti/indicadores'],
  [/marketing|\bmkt\b/, '/mkt/indicadores'],
];

/** O endereço que abre a exportação, ou nulo se o texto não pede um relatório que sabemos exportar. */
export function rotaDeExportacao(texto: string): string | null {
  const t = semAcento(texto);
  if (!/export|pdf|relatorio|indicador/.test(t)) return null;
  if (/abr(e|ir) (um )?chamado/.test(t)) return null;
  const rota = SETORES.find(([re]) => re.test(t))?.[1];
  if (!rota) return null;
  const periodo = PERIODOS.find(([re]) => re.test(t))?.[1] ?? 'semana_passada';
  return `${rota}?periodo=${periodo}&exportar=1`;
}

const CRIAR = /(?:cri|mont|abr|adicion|cadastr|fa[cz]|nov)[a-z]*(?:\s+[a-z]+){0,3}\s+/.source;
const pedeCriar = (texto: string, coisa: string) => {
  const t = semAcento(texto);
  return !t.includes('chamado') && new RegExp(`${CRIAR}${coisa}(?![a-z])`).test(t);
};
/** "Cria uma rotina…": vai para Rotinas. Falar da rotina dentro de um chamado não conta. */
export const pedeRotina = (texto: string) => pedeCriar(texto, 'rotina');
/** "Abre um projeto…": vai para Novo projeto. */
export const pedeProjeto = (texto: string) => pedeCriar(texto, 'projeto');

/** Compra não se pede por voz: precisa de proposta anexada (dono, 2026-11-04). */
export const pedeCompra = (texto: string) => /\b(comprar|compra|compre|orcamento)\b/.test(semAcento(texto));
