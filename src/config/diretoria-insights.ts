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

export type VisaoDiretoria = 'resumo' | 'metas' | 'clientes' | 'produtos';

export const VISAO_DIRETORIA_PADRAO: VisaoDiretoria = 'resumo';

/**
 * Etapa 4 (2026-09-25): sete visões viraram quatro. O dono, 2026-09-24: "no
 * diretoria há diversas informações poderiam estar em uma única aba, veja o
 * que está redundante e o que duplica informações. E aba Setores fica muito
 * simplório… o que o diretor faz ali? nome não condiz também."
 *
 * Os `valor` são contrato com a URL e com os links salvos — por isso os três
 * que saíram não somem: viram APELIDOS do lugar novo. Quem tinha
 * `?visao=conciliacao` nos favoritos continua chegando onde a conciliação
 * mora agora, em vez de cair no Resumo sem entender por quê.
 *
 * `carteiras` e `conciliacao` → `metas`, que agora é "Metas e carteiras" e
 * contém as duas. `setores` → `resumo`, que absorveu os objetivos da empresa
 * e os chamados por setor.
 *
 * É um `Map`, e não um objeto literal, por um motivo que o teste pegou: num
 * objeto, `'constructor' in obj` é VERDADEIRO por herança, e o valor é uma
 * função — `?visao=constructor` devolvia `Object` como se fosse uma visão.
 * `Map` só conhece o que foi posto nele.
 */
const APELIDOS = new Map<string, VisaoDiretoria>([
  ['carteiras', 'metas'],
  ['conciliacao', 'metas'],
  ['setores', 'resumo'],
]);

export interface VisaoDiretoriaInsight {
  valor: VisaoDiretoria;
  rotulo: string;
  /** Vira o `title` do item no menu — a frase que explica sem abrir. */
  descricao: string;
}

/** A ordem aqui é a ordem do menu, e a ordem do plano (item 4): abre em Resumo. */
export const VISOES_DIRETORIA: VisaoDiretoriaInsight[] = [
  { valor: 'resumo', rotulo: 'Resumo', descricao: 'O ano até aqui, os objetivos da empresa e quais setores estão atrasados' },
  { valor: 'metas', rotulo: 'Metas e carteiras', descricao: 'Metas por carteira, simulador, o realizado mês a mês e a conciliação' },
  { valor: 'clientes', rotulo: 'Clientes', descricao: 'Faturamento por cliente e evolução por faixa A/B/C' },
  { valor: 'produtos', rotulo: 'Produtos', descricao: 'Tendência de cada produto, o detalhe de quem compra e a matriz produto × cliente' },
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
  if (VISOES_DIRETORIA.some((v) => v.valor === bruto)) return bruto as VisaoDiretoria;
  // Endereço velho de uma das três visões fundidas — vai para onde o
  // conteúdo dela mora agora, em vez de cair no padrão.
  return (bruto != null && APELIDOS.get(bruto)) || VISAO_DIRETORIA_PADRAO;
}
