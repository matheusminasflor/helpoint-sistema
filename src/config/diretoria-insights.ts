// As visões do Insights da Diretoria — mesmo mecanismo do Comercial
// (`@/config/comercial-insights.ts`), não outro (plano da Frente 3, item
// 4). A lista mora aqui, e não dentro da página, pelo mesmo motivo: o menu
// lateral não pode importar a página para saber os nomes dos itens.
//
// Os `valor` são contrato com a URL (`?visao=`) e com os links salvos das
// pessoas — não se renomeiam. Nome do item pai: o dono perguntou se o
// painel do diretor não deveria se chamar Insights também, como o do
// Comercial — sim, é mais fácil de achar uma palavra só para "as páginas
// de número".

export type VisaoDiretoria = 'resumo' | 'metas' | 'carteiras' | 'clientes' | 'produtos' | 'conciliacao' | 'setores';

export const VISAO_DIRETORIA_PADRAO: VisaoDiretoria = 'resumo';

export interface VisaoDiretoriaInsight {
  valor: VisaoDiretoria;
  rotulo: string;
  /** Vira o `title` do item no menu — a frase que explica sem abrir. */
  descricao: string;
}

/** A ordem aqui é a ordem do menu, e a ordem do plano (item 4): abre em Resumo. */
export const VISOES_DIRETORIA: VisaoDiretoriaInsight[] = [
  { valor: 'resumo', rotulo: 'Resumo', descricao: 'Os cinco indicadores do ano e o gráfico meta × realizado' },
  { valor: 'metas', rotulo: 'Metas', descricao: 'A grade de metas por carteira, o simulador e quem responde por cada uma' },
  { valor: 'carteiras', rotulo: 'Carteiras', descricao: 'Carteiras mês a mês, no ano e o comparativo entre anos' },
  { valor: 'clientes', rotulo: 'Clientes', descricao: 'Faturamento por cliente e evolução por faixa A/B/C' },
  { valor: 'produtos', rotulo: 'Produtos', descricao: 'Tendência de cada produto, o detalhe de quem compra e a matriz produto × cliente' },
  { valor: 'conciliacao', rotulo: 'Conciliação', descricao: 'A diferença entre a apresentação comercial e o Forteplus' },
  { valor: 'setores', rotulo: 'Setores', descricao: 'Objetivos da empresa e chamados por setor' },
];

/** O endereço de uma visão. Uma rota só (`/diretoria`); a escolha vive na query. */
export function rotaDaVisaoDiretoria(valor: VisaoDiretoria): string {
  return valor === VISAO_DIRETORIA_PADRAO ? '/diretoria' : `/diretoria?visao=${valor}`;
}

/**
 * O que `?visao=` significa para a Diretoria, resolvido uma vez só — a
 * página e o menu usam esta mesma função (mesmo motivo de `resolverVisao`
 * em `comercial-insights.ts`, achado A4 da auditoria de 2026-09-21).
 */
export function resolverVisaoDiretoria(bruto: string | null | undefined): VisaoDiretoria {
  return VISOES_DIRETORIA.some((v) => v.valor === bruto) ? (bruto as VisaoDiretoria) : VISAO_DIRETORIA_PADRAO;
}
