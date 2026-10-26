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
    deOndeVem: 'A meta vem de Diretoria › Metas e carteiras (o que a Diretoria define). O realizado é a VENDA: as notas importadas do Forteplus (venda menos devolução) até a última importação e, depois dela, os lançamentos do Comercial com Nº da nota fiscal — o mesmo número do Comercial. Objetivos vêm de Início › Metas; chamados, das filas de cada setor.',
    comoLer: [
      'Simplificado: o vendido no ano até hoje, a meta até hoje e o %, o gráfico mês a mês e atalhos para cada relatório.',
      'Até hoje inclui o mês corrente: a venda dele até hoje e a meta dele proporcional aos dias que já passaram. % da meta: verde bateu, âmbar de 70% a 99%, vermelho abaixo de 70%.',
      'A comparação com os anos anteriores fica no Comparativo, em Metas e carteiras (link no Resumo).',
      'No gráfico, barra verde = mês que bateu a meta; vermelha = não bateu; cinza = mês sem dado.',
      'Analítico: a tela completa, com os objetivos e os chamados de cada setor.',
    ],
  },
  'diretoria-indicadores': {
    titulo: 'Diretoria › Indicadores dos setores',
    oQueE: 'Os números principais de cada setor num mês: Comercial, conferência de pedidos, Financeiro, RH, Compras, SAC e Marketing.',
    deOndeVem: 'Cada bloco lê o próprio setor no banco (lançamentos do Comercial, contas do Financeiro, pedidos de compra, SACs da Qualidade, posts do Marketing). A Diretoria vê só totais, nunca o detalhe sensível (salário, por exemplo).',
    comoLer: [
      'Escolha o mês ou o período no topo; todos os blocos seguem o mesmo recorte.',
      'Conferência de pedidos: uma linha com o resumo do período; o painel completo está no Financeiro.',
      'Simplificado: os três números principais de cada setor. Analítico: todos.',
      'Para o detalhe de um setor, abra o relatório do próprio setor.',
    ],
  },
  'diretoria-metas': {
    titulo: 'Diretoria › Metas e carteiras',
    oQueE: 'Onde a Diretoria define a meta de cada carteira por mês e acompanha o realizado, com o simulador e a comparação com o ano anterior.',
    deOndeVem: 'A meta é digitada aqui. O realizado NÃO se digita: é a venda dos clientes de cada carteira — notas importadas do Forteplus até a última importação e, depois, os lançamentos com Nº da nota (o mesmo número do Comercial).',
    comoLer: [
      'Simplificado (abre assim na primeira vez): as carteiras, o simulador e o ano por carteira, com a cobertura em cores.',
      'Analítico: a grade editável de meta, quem responde por cada carteira, as carteiras mês a mês (venda, peso, meta e cobertura de cada mês) e o comparativo com os anos anteriores.',
      'Peso = quanto a carteira representa da venda da empresa. Passe o mouse no título das colunas para a explicação.',
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
    deOndeVem: 'A VENDA é o FATURADO: as notas importadas do Forteplus (toda sexta) dos clientes da carteira de cada vendedora, até a última importação; depois dela, os lançamentos com Nº da nota fiscal. Lançamento sem nota não conta como venda. Contatos, clientes relacionados e ações vêm dos LANÇAMENTOS (Comercial › Lançamentos). A meta de valor é a da carteira, definida pela Diretoria; as outras metas o gestor define aqui.',
    comoLer: [
      'Escolha uma vendedora no topo para ver só ela; "Equipe toda" mostra todas.',
      'Simplificado: o cartão de cada vendedora (meta, realizado, farol). Analítico: soma o farol de ações, o resumo das carteiras e, com uma vendedora escolhida, os lançamentos dela.',
      'Notas que não bateram: depois de cada importação, a nota lançada é conferida com a do Forteplus. O que não bateu (número, cliente, valor ou data) aparece no cartão da vendedora com o valor certo. A venda já conta pelo Forteplus — é só para conferir da próxima vez.',
      'Farol: verde = bateu a meta; amarelo = a partir de 70%; vermelho = abaixo; "—" = sem meta.',
      'Acima dos números a tela diz até quando há nota importada; o que veio depois é dos lançamentos com nota.',
      'Lançamento com nota de antes da última importação não soma por cima: aquele período já está na nota importada.',
      'Carteira com duas vendedoras: a nota conta para as duas.',
      'Ativo = comprou nos últimos 120 dias.',
    ],
  },
  'comercial-carteiras': {
    titulo: 'Comercial › Carteiras',
    oQueE: 'O acompanhamento de uma carteira: cada cliente, quanto comprou, se está comprando mais ou menos que o normal dele e o último contato.',
    deOndeVem: 'Clientes do cadastro; a venda = notas importadas do Forteplus até a última importação e, depois, os lançamentos com Nº da nota fiscal (os dois nunca se somam); "A faturar" = pedidos fechados no lançamento que ainda não têm nota; a meta da carteira definida pela Diretoria.',
    comoLer: [
      'No topo: a carteira, um mês ou um período (ex.: de janeiro até hoje), a filial (INBRAS, MF ou as duas) e a situação do cliente. Mês depois do atual não abre: ainda não tem venda.',
      'Simplificado: cliente, Comprou (no mês ou período, com o mês anterior embaixo), Média mensal, Ritmo, Pedido sem nota e último contato. Analítico: soma a média de 3 meses, a venda de 12 meses, contatos, próximo prazo, códigos e o ano mês a mês. A tela lembra a sua escolha.',
      'Passe o mouse no título de cada coluna para ver de onde vem o número e como é a conta.',
      'Média mensal: o normal do cliente — a venda dos 12 meses antes do mês escolhido ÷ os meses que existem no sistema (se a importação começa em janeiro, divide só por esses meses). O título da coluna diz quais meses.',
      'Ritmo: a média dos últimos 3 meses FECHADOS contra a média mensal (o mês que está correndo não entra). Comprando mais = 110% ou mais; Normal = de 80% a 110%; Comprando menos = abaixo de 80%; Parado = sem compra há mais de 120 dias. Passe o mouse no selo para ver as duas médias.',
      'A bolinha ao lado do nome: verde ativo, vermelho parado, cinza nunca comprou. Valor vermelho: comprou menos que no mês anterior; verde: comprou mais. Clique no nome para ver a venda do cliente mês a mês.',
      'Os cartões de cima dizem a quem procurar; clique num para filtrar a lista.',
      'Cobertura = venda ÷ meta do mês. A meta é mensal: no período, escolha "Um mês" para comparar.',
    ],
  },
  'comercial-vendas': {
    titulo: 'Comercial › Relatórios › Vendas',
    oQueE: 'O faturamento pelas notas fiscais: mês a mês, curva ABC, ranking de clientes e caixas.',
    deOndeVem: 'Venda importada do Forteplus (Configurações › Importações › Vendas), por filial.',
    comoLer: [
      'Aqui é só o que veio do Forteplus (as notas importadas). A Carteira e os Indicadores somam também os lançamentos com nota feitos depois da última importação, por isso podem ser maiores na semana.',
      'Confira no rodapé até quando a venda foi importada.',
    ],
  },
  'comercial-clientes': {
    titulo: 'Comercial › Relatórios › Clientes parados',
    oQueE: 'Quem parou de comprar e há quanto tempo, para a equipe retomar.',
    deOndeVem: 'Última compra de cada cliente, pela venda importada do Forteplus e pelos lançamentos com nota fiscal.',
    comoLer: ['Os dias contam a partir da última compra registrada do cliente.'],
  },
  'comercial-bonificacao': {
    titulo: 'Comercial › Relatórios › Bonificação',
    oQueE: 'Quanto foi bonificado e para quem.',
    deOndeVem: 'Remessa gratuita (CFOP 5910/6910) da SÉRIE 75 importada do Forteplus. A da série 1 é publicidade e a da série 76 é cashback: as duas aparecem separadas em Comercial › Relatórios › Vendas.',
    comoLer: ['Os números seguem o período escolhido no topo.', 'Bonificação é só a série 75 (regra da empresa, 2026-10-16): publicidade (série 1) e cashback (série 76) não entram aqui.'],
  },
  'comercial-cashback': {
    titulo: 'Comercial › Relatórios › Cashback',
    oQueE: 'O cashback gerado e liberado por cliente, mês a mês, pela grade configurada em Comercial › Configurações › Cashback.',
    deOndeVem: 'As notas importadas do Forteplus com CFOP de VENDA (série 1 ou 75), menos devolução, e a grade de cashback da tabela de preço do cliente.',
    comoLer: [
      'Só conta CFOP de venda. Bonificação, publicidade e o próprio cashback (CFOP 5910, 6910 e 7949) não contam, em nenhuma série.',
      'Cashback gerado no mês = a compra do mês × a porcentagem da faixa da tabela do cliente.',
      'Compra para ativar = metade da compra do mês. O cashback só é LIBERADO se no mês seguinte o cliente comprar pelo menos esse valor.',
      'Situação: "Liberado" (o mês seguinte já bateu a metade), "Aguardando o mês seguinte" (ainda não bateu e o mês seguinte não fechou no sistema) e "Não liberado" (o mês seguinte fechou abaixo).',
      'Mudar a grade em Configurações muda o cálculo daqui para a frente.',
    ],
  },
  'comercial-diretrizes': {
    titulo: 'Comercial › Relatórios › Benefícios a conceder',
    oQueE: 'Quem atingiu uma diretriz comercial no mês (ex.: comprou 36 OX 6 vol → R$ 100 de cashback na próxima compra), quem está perto e o que já foi concedido.',
    deOndeVem: 'As notas fiscais importadas do Forteplus (venda menos devolução), contadas em unidades por família ou produto, e as regras de Comercial › Configurações › Diretrizes.',
    comoLer: [
      'A diretriz é mensal: o período vale pelos meses inteiros que ele toca.',
      '"A conceder": atingiu o mínimo e ninguém marcou ainda. Quem aplica o benefício clica em "Marcar concedido" e informa o pedido — a data e quem marcou ficam registrados. Cada cliente recebe uma vez por diretriz e por mês.',
      '"Perto de atingir": comprou 75% do mínimo ou mais e não chegou lá. "Falta" é quantas unidades faltam — é a ligação que a vendedora faz.',
      'Cashback em %: é sobre o valor que o cliente comprou daquela família ou produto no mês.',
      'Só quem altera a aba Diretrizes ou o gestor do Comercial marca e desfaz concessão; a vendedora vê a lista.',
    ],
  },
  'comercial-atendimento': {
    titulo: 'Comercial › Relatórios › Atendimento (chamados)',
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
    oQueE: 'Os chamados do Marketing e o cronograma social.',
    deOndeVem: 'A fila de chamados do Marketing e o Cronograma Social.',
    comoLer: [
      'Escolha o período no topo.',
      'Visão Geral: os painéis — números, tendência, prioridade, categoria, redes sociais e padrões.',
      'Análise Detalhada: a mesma da TI — a tabela de indicadores com a variação, categoria por status, o que pede atenção, o desempenho de cada atendente e quem mais pede.',
    ],
  },
  'rh-indicadores': {
    titulo: 'RH › Indicadores',
    oQueE: 'Os chamados do RH e o quadro de pessoas.',
    deOndeVem: 'A fila de chamados do RH e o cadastro de colaboradores.',
    comoLer: ['Escolha o período no topo.'],
  },
  'qualidade-indicadores': {
    titulo: 'Qualidade › Indicadores do SAC',
    oQueE: 'Os SACs de clientes: quantos abriram, em aberto, taxa de resolução e tempo da primeira resposta.',
    deOndeVem: 'Os SACs registrados pelo portal do cliente e pela equipe da Qualidade.',
    comoLer: ['Escolha o período no topo.'],
  },
  'qualidade-atendimento': {
    titulo: 'Qualidade › Indicadores',
    oQueE: 'Os chamados internos da Qualidade: quantos abriram, prazos de 1ª resposta e de resolução, e o tempo médio.',
    deOndeVem: 'A fila de chamados da Qualidade (os SACs de clientes têm o painel próprio, "Indicadores do SAC").',
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
    oQueE: 'Quanto foi comprado, os setores que mais gastaram (no período e mês a mês), o tempo de aprovação e os produtos e fornecedores mais comprados.',
    deOndeVem: 'Os pedidos de compra do setor. "Gasto" é o que foi comprado (registrado como feito), pelo total aprovado.',
    comoLer: [
      'Escolha o período no topo: vale para "Comprado no período" e para os setores que mais gastaram.',
      'Em "Este mês", a barra de cada setor compara com o teto mensal dele (quando ligado no Financeiro).',
      'O "Gasto mês a mês" tem o ano à parte: escolha o ano no canto do cartão.',
    ],
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
