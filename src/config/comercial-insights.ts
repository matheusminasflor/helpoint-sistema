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

export type Visao = 'vendas' | 'curva' | 'clientes' | 'bonificacao' | 'atendimento';

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
  { valor: 'clientes', rotulo: 'Clientes', descricao: 'Quem comprava e parou de comprar' },
  { valor: 'bonificacao', rotulo: 'Bonificação', descricao: 'Bonificação por cliente e os pedidos em condição' },
  { valor: 'atendimento', rotulo: 'Atendimento', descricao: 'Indicadores dos chamados do Comercial' },
];

/** O endereço de uma visão. Uma rota só; a escolha vive na query. */
export function rotaDaVisao(valor: Visao): string {
  return valor === VISAO_PADRAO ? '/comercial/insights' : `/comercial/insights?visao=${valor}`;
}
