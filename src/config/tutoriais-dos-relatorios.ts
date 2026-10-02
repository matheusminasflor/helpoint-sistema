// O texto do tutorial de cada relatório (revisão do sistema, 2026-10-01). Um lugar só, em português
// de quem usa — o dono revisa aqui e o `TutorialDoRelatorio` mostra. "De onde vêm os números" diz a
// FONTE, porque é a pergunta que evita ler um número de planilha como se fosse do ERP.
export interface Tutorial {
  titulo: string;
  oQueE: string;
  deOndeVem: string;
  comoLer: string[];
}

export const TUTORIAIS = {
  'diretoria-resumo': {
    titulo: 'Diretoria › Resumo',
    oQueE: 'A abertura do painel do diretor: como está o ano em vendas contra a meta, e o que está atrasado na empresa.',
    deOndeVem: 'Meta e realizado vêm de Diretoria › Metas e carteiras (o que a Diretoria informa mês a mês). No modo analítico aparece também a venda importada do Forteplus (com e sem nota), para comparar com o informado. Objetivos vêm de Início › Metas; chamados, das filas de cada setor.',
    comoLer: [
      'Simplificado: os números grandes do ano, o gráfico mês a mês e atalhos para cada relatório.',
      'No gráfico, barra verde = mês que bateu a meta; vermelha = não bateu; cinza = mês sem dado.',
      'Analítico: a tela completa, com o que o ERP importou, os objetivos e os chamados de cada setor.',
    ],
  },
  'diretoria-indicadores': {
    titulo: 'Diretoria › Indicadores dos setores',
    oQueE: 'Os números principais de cada setor num mês: Comercial, conferência de pedidos, Financeiro, RH, Compras, SAC e Marketing.',
    deOndeVem: 'Cada bloco lê o próprio setor no banco (lançamentos do Comercial, contas do Financeiro, solicitações de Compras, SACs da Qualidade, posts do Marketing). A Diretoria vê só totais, nunca o detalhe sensível (salário, por exemplo).',
    comoLer: [
      'Escolha o mês no topo; todos os blocos seguem o mesmo mês.',
      'Para o detalhe de um setor, abra o relatório do próprio setor.',
    ],
  },
  'diretoria-metas': {
    titulo: 'Diretoria › Metas e carteiras',
    oQueE: 'Onde a Diretoria define a meta de cada carteira por mês e informa o realizado, com o simulador e a comparação com o ano anterior.',
    deOndeVem: 'Meta e realizado são digitados aqui (ou importados em Configurações › Importações › Metas). A conciliação compara o informado com a venda importada do Forteplus.',
    comoLer: [
      'Simplificado: as carteiras, o simulador e o ano por carteira.',
      'Analítico: a grade editável de meta e realizado, quem responde por cada carteira e a conciliação.',
      'Renomear uma carteira aqui muda o nome em tudo (clientes, vendedoras e metas).',
    ],
  },
  'diretoria-clientes': {
    titulo: 'Diretoria › Clientes',
    oQueE: 'Quanto cada cliente comprou, a evolução por faixa (A, B, C) e os maiores clientes.',
    deOndeVem: 'Venda importada do Forteplus (notas fiscais), nas duas filiais.',
    comoLer: [
      'Faixa A = os clientes que somam a maior parte do faturamento; C = a cauda.',
      'O ranking mostra os 10 maiores do período escolhido.',
    ],
  },
  'diretoria-produtos': {
    titulo: 'Diretoria › Produtos',
    oQueE: 'A tendência de cada produto, os que estão caindo ou parados, e quais clientes compram cada um.',
    deOndeVem: 'Venda importada do Forteplus, item a item.',
    comoLer: [
      'O farol aponta produto em queda, parado ou concentrado num mês só.',
      'Clique num produto para ver o detalhe e os clientes dele.',
    ],
  },
  'comercial-indicadores': {
    titulo: 'Comercial › Indicadores',
    oQueE: 'O Painel do Gestor da planilha: meta, realizado e farol de cada vendedora, as ações do mês e o resumo das carteiras.',
    deOndeVem: 'Tudo vem dos LANÇAMENTOS das vendedoras (Comercial › Lançamentos), não da nota fiscal. A meta de valor é a da carteira, definida pela Diretoria; as outras metas o gestor define aqui.',
    comoLer: [
      'Escolha uma vendedora no topo para ver só ela, com os lançamentos dela no mês; "Equipe toda" mostra todas.',
      'Farol: verde = bateu a meta; amarelo = a partir de 70%; vermelho = abaixo; "—" = sem meta.',
      'Venda só conta quando o lançamento está Concluído e tem valor.',
      'Ativo = comprou nos últimos 120 dias.',
    ],
  },
  'comercial-carteiras': {
    titulo: 'Comercial › Carteiras',
    oQueE: 'O acompanhamento de uma carteira: os clientes dela, quem comprou, quem está parado, e a meta contra a venda mês a mês.',
    deOndeVem: 'Clientes do cadastro, lançamentos das vendedoras e a meta da carteira definida pela Diretoria.',
    comoLer: [
      'Escolha a carteira no topo (o gestor vê todas; a vendedora, as dela).',
      'Cobertura = venda ÷ meta do mês.',
    ],
  },
  'comercial-vendas': {
    titulo: 'Comercial › Insights › Vendas',
    oQueE: 'O faturamento pelas notas fiscais: mês a mês, curva ABC, ranking de clientes e caixas.',
    deOndeVem: 'Venda importada do Forteplus (Configurações › Importações › Vendas), por filial.',
    comoLer: [
      'Este é o número FISCAL; os Indicadores do Comercial usam o lançamento da vendedora, por isso podem diferir.',
      'Confira no rodapé até quando a venda foi importada.',
    ],
  },
  'comercial-clientes': {
    titulo: 'Comercial › Insights › Clientes',
    oQueE: 'Quem parou de comprar e há quanto tempo, para a equipe retomar.',
    deOndeVem: 'Última compra de cada cliente, pela venda importada do Forteplus e pelos lançamentos concluídos.',
    comoLer: ['Os dias contam a partir da última compra registrada do cliente.'],
  },
  'comercial-bonificacao': {
    titulo: 'Comercial › Insights › Bonificação',
    oQueE: 'Quanto foi bonificado e para quem.',
    deOndeVem: 'Itens de bonificação da venda importada do Forteplus.',
    comoLer: ['Os números seguem o período escolhido no topo.'],
  },
  'comercial-cashback': {
    titulo: 'Comercial › Insights › Cashback',
    oQueE: 'O cashback acumulado e resgatado por cliente, pela regra configurada em Comercial › Configurações › Cashback.',
    deOndeVem: 'Venda importada do Forteplus e a grade de cashback do setor.',
    comoLer: ['Mudar a regra em Configurações muda o cálculo daqui para a frente.'],
  },
  'comercial-atendimento': {
    titulo: 'Comercial › Insights › Atendimento',
    oQueE: 'Os chamados do Comercial: quantos abriram, quantos foram resolvidos e o tempo médio.',
    deOndeVem: 'A fila de chamados do Comercial.',
    comoLer: ['Escolha o período no topo; a tendência compara com o período anterior.'],
  },
  'ti-indicadores': {
    titulo: 'TI › Indicadores',
    oQueE: 'Os chamados da TI (abertos, resolvidos, prazo) e o parque: inventário, licenças, contratos e manutenções.',
    deOndeVem: 'A fila de chamados da TI e os cadastros do próprio setor.',
    comoLer: [
      'Ligue e desligue os blocos que quer ver; a escolha fica guardada.',
      'A seta compara com o período anterior.',
    ],
  },
  'mkt-indicadores': {
    titulo: 'Marketing › Indicadores',
    oQueE: 'Os chamados do Marketing e o desempenho dos posts do cronograma social.',
    deOndeVem: 'A fila de chamados do Marketing e o Cronograma Social.',
    comoLer: ['Escolha o período no topo.'],
  },
  'rh-indicadores': {
    titulo: 'RH › Indicadores',
    oQueE: 'Os chamados do RH e o quadro de pessoas.',
    deOndeVem: 'A fila de chamados do RH e o cadastro de colaboradores.',
    comoLer: ['Escolha o período no topo.'],
  },
  'qualidade-indicadores': {
    titulo: 'Qualidade › Indicadores',
    oQueE: 'Os SACs de clientes: quantos abriram, em aberto, taxa de resolução e tempo da primeira resposta.',
    deOndeVem: 'Os SACs registrados pelo portal do cliente e pela equipe da Qualidade.',
    comoLer: ['Escolha o período no topo.'],
  },
  'financeiro-indicadores': {
    titulo: 'Financeiro › Indicadores',
    oQueE: 'A pagar, a receber, saldo e inadimplência, com o que vence nos próximos 7 dias e o que está atrasado.',
    deOndeVem: 'Contas a pagar e a receber do Financeiro.',
    comoLer: ['A seta compara com o período anterior.'],
  },
  'compras-indicadores': {
    titulo: 'Compras › Indicadores',
    oQueE: 'As solicitações de compra: aprovadas, aguardando, tempo médio e os produtos e fornecedores mais pedidos.',
    deOndeVem: 'As solicitações de compra do setor.',
    comoLer: ['Escolha o período no topo.'],
  },
  'educacional-indicadores': {
    titulo: 'Educacional › Indicadores',
    oQueE: 'Os chamados do Educacional: quantos abriram, quantos foram resolvidos e o tempo médio.',
    deOndeVem: 'A fila de chamados do Educacional.',
    comoLer: ['Escolha o período no topo.'],
  },
  'expedicao-indicadores': {
    titulo: 'Expedição › Indicadores',
    oQueE: 'Os chamados da Expedição: quantos abriram, quantos foram resolvidos e o tempo médio.',
    deOndeVem: 'A fila de chamados da Expedição.',
    comoLer: ['Escolha o período no topo.'],
  },
  'producao-indicadores': {
    titulo: 'Produção › Indicadores',
    oQueE: 'Os chamados da Produção: quantos abriram, quantos foram resolvidos e o tempo médio.',
    deOndeVem: 'A fila de chamados da Produção.',
    comoLer: ['Escolha o período no topo.'],
  },
} satisfies Record<string, Tutorial>;

export type IdDoTutorial = keyof typeof TUTORIAIS;
