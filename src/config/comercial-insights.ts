// As visões do Insights do Comercial — a lista que o MENU LATERAL desenha e
// que `ComercialInsights` usa para decidir o que renderizar.
//
// Mora aqui, e não dentro da página, porque o menu lateral não pode importar
// uma página só para saber os nomes dos itens: puxaria o código da tela (e o
// dos gráficos) para dentro do bundle do menu, que é carregado em toda rota.
//
// Os `valor` são contrato com a URL (`?visao=`) e com os links salvos das
// pessoas — não se renomeiam. Os `rotulo` são o que se MEDE, não o artefato:
// dentro do módulo Comercial tudo é comercial, então "Painel Comercial" não
// distinguia nada (decisão do dono, 2026-09-21).

export type Visao = 'vendas' | 'curva' | 'produtos' | 'clientes' | 'bonificacao' | 'cashback' | 'atendimento';

export const VISAO_PADRAO: Visao = 'vendas';

export interface VisaoInsight {
  valor: Visao;
  rotulo: string;
  /** Vira o `title` do item no menu — a frase que explica sem abrir. */
  descricao: string;
}

/** A ordem aqui é a ordem do menu. A L6b entra como mais itens desta lista. */
export const VISOES: VisaoInsight[] = [
  { valor: 'vendas', rotulo: 'Vendas', descricao: 'Faturamento, clientes e produtos, do relatório do Forteplus' },
  { valor: 'curva', rotulo: 'Curva ABC', descricao: 'Os produtos que fazem o faturamento, por faixa A, B e C' },
  { valor: 'produtos', rotulo: 'Produtos', descricao: 'Tendência de cada produto — novo, descontinuado, crescendo, caindo — e o detalhe de quem compra' },
  { valor: 'clientes', rotulo: 'Clientes', descricao: 'Quem comprava e parou de comprar' },
  { valor: 'bonificacao', rotulo: 'Bonificação', descricao: 'Bonificação por cliente e os pedidos em condição' },
  { valor: 'cashback', rotulo: 'Cashback', descricao: 'A apuração mês a mês do cashback, por cliente' },
  { valor: 'atendimento', rotulo: 'Atendimento', descricao: 'Indicadores dos chamados do Comercial' },
];

/** O endereço de uma visão. Uma rota só; a escolha vive na query. */
export function rotaDaVisao(valor: Visao): string {
  return valor === VISAO_PADRAO ? '/comercial/insights' : `/comercial/insights?visao=${valor}`;
}

/**
 * O que `?visao=` significa, resolvido uma vez só — **a página e o menu usam
 * esta mesma função**. Ausente ou desconhecido (link velho, digitação) vira o
 * padrão: a tela renderiza Vendas, e o item de Vendas é o que acende.
 *
 * Existe porque os dois lados resolviam por conta própria e discordavam com
 * `?visao=xyz`: a tela mostrava Vendas e o menu não acendia nada (achado A4
 * da auditoria de 2026-09-21).
 */
export function resolverVisao(bruto: string | null | undefined): Visao {
  return VISOES.some((v) => v.valor === bruto) ? (bruto as Visao) : VISAO_PADRAO;
}
