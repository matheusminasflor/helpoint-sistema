// A explicação de cada indicador, ao passar o mouse (decisão do dono, 2026-10-04: "é muito
// importante que em cada indicador você passe o cursor do mouse e tenha um tutorial de como
// funciona").
//
// Um lugar só, como `tutoriais-dos-relatorios.ts`: o dono revisa os textos juntos, e quem mudar uma
// conta num hook acha aqui o texto que precisa mudar junto. Cada texto diz O QUE é o número, DE
// ONDE vem e COMO é calculado — e foi escrito lendo a conta de verdade (o hook citado em cada
// bloco). Se a conta mudar, o texto muda; um texto que descreve outra conta é pior que nenhum.
//
// O tutorial da tela (botão "Como ler") continua sendo a visão geral; isto é o detalhe de cada
// número.

export interface Explicacao {
  titulo: string;
  oQueE: string;
  deOndeVem: string;
  comoCalcula: string;
}

// ── Chamados: TI, Marketing, RH e os setores do molde (Comercial, Educacional, Expedição,
//    Produção). A conta é uma só: `useTicketMetrics` em `@/hooks/useHelpdeskMetrics`. ──────────
const PERIODO_DOS_CHAMADOS =
  'Entram os chamados ABERTOS dentro do período escolhido no topo (pela data de abertura), só do setor desta tela.';
const RESOLVIDO =
  'Conta como resolvido o chamado com status Resolvido (os antigos que estavam "Fechado" também — desde 2026-10-04 não existe mais "Fechado").';
const REGRA_DO_SLA =
  'O prazo (SLA) de cada chamado nasce quando ele é aberto: o tempo de resolução da prioridade, definido em Configurações › Chamados › Prazos de atendimento. O prazo é em tempo útil: o relógio só anda no expediente do setor (ex.: 8h às 18h), de segunda a sexta, fora feriados — um chamado de 8 horas aberto às 17h vence no dia seguinte às 15h. Se quem atende tem horário de almoço no cadastro do RH, o relógio também para no almoço, e trocar o atendente recalcula o prazo. Setor que trabalha no fim de semana pode fazer o sábado e o domingo contarem.';

export const EXPLICACOES = {
  'chamados.total': {
    titulo: 'Chamados no período',
    oQueE: 'Quantos chamados chegaram ao setor no período.',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta todos, em qualquer status — inclusive cancelados.`,
  },
  'chamados.abertos': {
    titulo: 'Chamados abertos',
    oQueE: 'Chamados que ainda ninguém assumiu (status Aberto).',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta só o status Aberto: o que está Em andamento ou Pendente tem número próprio. Passe o mouse na linha para ver quais são.`,
  },
  'chamados.em_andamento': {
    titulo: 'Em andamento',
    oQueE: 'Chamados que alguém assumiu e está atendendo.',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta o status Em andamento.`,
  },
  'chamados.em_aberto': {
    titulo: 'Em aberto',
    oQueE: 'Tudo o que ainda não terminou: aberto, em andamento e pendente (aguardando retorno ou peça).',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Fica de fora o que foi resolvido, cancelado ou reprovado.`,
  },
  'chamados.resolvidos': {
    titulo: 'Resolvidos',
    oQueE: 'Chamados do período que já foram resolvidos.',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} ${RESOLVIDO} A avaliação do solicitante é opcional e não muda nada aqui.`,
  },
  'chamados.sla_cumprido': {
    titulo: 'SLA cumprido',
    oQueE: 'De cada 100 chamados com prazo, quantos estão dentro dele.',
    deOndeVem: 'O prazo (SLA) gravado em cada chamado e a data em que foi resolvido.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Cumpriu: resolvido até o prazo, ou ainda aberto e com o prazo correndo. Chamado sem prazo não entra na conta; cancelado sem resolução não cumpre nem viola. ${REGRA_DO_SLA}`,
  },
  'chamados.sla_violados': {
    titulo: 'SLA violados',
    oQueE: 'Chamados ainda em aberto cujo prazo já passou.',
    deOndeVem: 'O prazo (SLA) gravado em cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta o chamado que não foi resolvido nem cancelado e cujo prazo já venceu agora. ${REGRA_DO_SLA}`,
  },
  'chamados.tempo_medio_resolucao': {
    titulo: 'Tempo médio de resolução',
    oQueE: 'Quanto tempo, em média, um chamado leva da abertura até ser resolvido.',
    deOndeVem: 'As datas de abertura e de resolução de cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Média, em horas corridas (com noite e fim de semana), entre os que já têm data de resolução.`,
  },
  'chamados.primeira_resposta': {
    titulo: '1ª resposta média',
    oQueE: 'Quanto tempo, em média, o setor leva para dar a primeira resposta.',
    deOndeVem: 'A data em que o chamado foi assumido pela primeira vez.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Média, em horas corridas, entre os que já foram assumidos.`,
  },
  'chamados.indicadores_do_periodo': {
    titulo: 'Indicadores do período',
    oQueE: 'Os números principais do atendimento, lado a lado com o período anterior.',
    deOndeVem: 'A fila de chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} "Anterior" é o mesmo tamanho de período, logo antes deste. A seta mostra quanto subiu ou desceu em %. Nas linhas com ícone de informação, passe o mouse para ver os chamados.`,
  },
  'chamados.evolucao': {
    titulo: 'Evolução: abertos × resolvidos',
    oQueE: 'Dia a dia, quantos chamados foram abertos e quantos foram resolvidos.',
    deOndeVem: 'As datas de abertura e de resolução dos chamados do setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} A linha de abertos usa o dia da abertura; a de resolvidos, o dia da resolução — de chamados abertos no período.`,
  },
  'chamados.por_prioridade': {
    titulo: 'Por prioridade',
    oQueE: 'Como os chamados do período se dividem entre Crítica, Alta, Média e Baixa.',
    deOndeVem: 'A prioridade gravada em cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta os chamados de cada prioridade, em qualquer status.`,
  },
  'chamados.por_categoria': {
    titulo: 'Por categoria',
    oQueE: 'As categorias com mais chamados no período.',
    deOndeVem: 'A categoria escolhida ao abrir o chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta os chamados de cada categoria e mostra as 8 maiores.`,
  },
  'chamados.categoria_x_status': {
    titulo: 'Chamados por categoria',
    oQueE: 'Cada categoria, com quantos chamados estão em cada situação.',
    deOndeVem: 'A categoria e o status de cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Aguardando = aguardando retorno do usuário + pendente. ${RESOLVIDO} Passe o mouse num número para ver os chamados dele; clique para abrir.`,
  },
  'chamados.o_que_pede_atencao': {
    titulo: 'O que pede atenção agora',
    oQueE: 'A lista do que precisa de ação: chamados com prazo vencido e, na TI, licenças e contratos vencendo e manutenções marcadas.',
    deOndeVem: 'A fila de chamados do setor e, na TI, os cadastros de licenças, contratos e manutenções.',
    comoCalcula: 'É uma foto de HOJE, não do período: chamado em aberto com o prazo já vencido (de qualquer data de abertura); licença e contrato que vencem nos próximos 30 dias; manutenção agendada para os próximos 30 dias.',
  },
  'chamados.sla_violado_lista': {
    titulo: 'Chamados com SLA violado',
    oQueE: 'Os chamados em aberto cujo prazo já venceu, do mais atrasado para o menos.',
    deOndeVem: 'O prazo (SLA) gravado em cada chamado.',
    comoCalcula: `Foto de HOJE, de qualquer data de abertura: não resolvido, não cancelado, prazo menor que agora. "Atraso" é quanto tempo passou desde o prazo. ${REGRA_DO_SLA}`,
  },
  'chamados.desempenho_por_pessoa': {
    titulo: 'Desempenho por pessoa',
    oQueE: 'Para cada pessoa do setor: quantos chamados recebeu, quantos resolveu, tempo médio, prazo e nota.',
    deOndeVem: 'Os chamados atribuídos a quem atende o setor.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Só entra quem é do setor. ${RESOLVIDO} SLA: dos resolvidos que tinham prazo, quantos dentro dele. Nota: média das avaliações (opcionais) dos solicitantes.`,
  },
  'chamados.solicitantes': {
    titulo: 'Quem mais abre chamados',
    oQueE: 'As 10 pessoas que mais abriram chamados para o setor no período.',
    deOndeVem: 'Quem abriu cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} O selo vermelho conta os de prioridade Alta ou Crítica. Clique na pessoa para ver os chamados dela.`,
  },

  // ── TI: cartões da Visão Geral (`TIRelatorios`) e linhas do parque (`IndicatorsView`). ─────────
  'ti.em_aberto': {
    titulo: 'Chamados TI em aberto',
    oQueE: 'Chamados da TI que ainda ninguém assumiu.',
    deOndeVem: 'A fila de chamados da TI.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Conta só o status Aberto. Clique para ir à fila.`,
  },
  'ti.vencidos': {
    titulo: 'Vencidos',
    oQueE: 'Licenças e contratos com a data de vencimento já passada.',
    deOndeVem: 'TI › Licenças e TI › Contratos.',
    comoCalcula: 'Foto de HOJE, sem período: licença com validade antes de hoje + contrato com fim antes de hoje.',
  },
  'ti.a_vencer': {
    titulo: 'A vencer',
    oQueE: 'Licenças e contratos que vencem em breve.',
    deOndeVem: 'TI › Licenças e TI › Contratos.',
    comoCalcula: 'Foto de HOJE: licenças e contratos que vencem nos próximos 30 dias; o texto mostra também quantas licenças vencem em 90 dias.',
  },
  'ti.inventario': {
    titulo: 'Inventário de TI',
    oQueE: 'O parque de equipamentos pela situação de cada um.',
    deOndeVem: 'Inventário (cadastro de ativos).',
    comoCalcula: 'Foto de HOJE, sem período: conta os ativos pela situação gravada (em uso, em estoque, em manutenção). "Com responsável" é outro fato: ativo com pessoa nomeada. Por categoria: com responsável = em uso, sem = estoque.',
  },
  'ti.ativos': {
    titulo: 'Ativos de TI',
    oQueE: 'Quantos equipamentos estão em uso, em estoque e no total.',
    deOndeVem: 'Inventário (cadastro de ativos).',
    comoCalcula: 'Foto de HOJE, pela situação gravada em cada ativo.',
  },
  'ti.licencas_30d': {
    titulo: 'Licenças expirando (30 dias)',
    oQueE: 'Licenças que vencem nos próximos 30 dias.',
    deOndeVem: 'TI › Licenças.',
    comoCalcula: 'Foto de HOJE: validade depois de hoje e antes de hoje + 30 dias.',
  },
  'ti.contratos_30d': {
    titulo: 'Contratos expirando (30 dias)',
    oQueE: 'Contratos que terminam nos próximos 30 dias.',
    deOndeVem: 'TI › Contratos.',
    comoCalcula: 'Foto de HOJE: data de fim depois de hoje e antes de hoje + 30 dias.',
  },
  'ti.manutencoes': {
    titulo: 'Manutenções agendadas',
    oQueE: 'Manutenções marcadas para os próximos 30 dias.',
    deOndeVem: 'TI › Manutenções.',
    comoCalcula: 'Foto de HOJE: agendadas ou em andamento, com data nos próximos 30 dias.',
  },
  'ti.sla_violados': {
    titulo: 'SLA violados',
    oQueE: 'Chamados da TI em aberto com o prazo já vencido.',
    deOndeVem: 'O prazo (SLA) gravado em cada chamado.',
    comoCalcula: `${PERIODO_DOS_CHAMADOS} Atraso médio: média de horas desde o prazo. "% do total": violados ÷ chamados que têm prazo. ${REGRA_DO_SLA}`,
  },

  // ── Marketing (`MKTRelatorios`). ─────────────────────────────────────────────────────────────
  'mkt.plataformas': {
    titulo: 'Plataformas com mais posts agendados',
    oQueE: 'Em quais redes sociais há mais posts esperando a data de publicação.',
    deOndeVem: 'Marketing › Cronograma Social.',
    comoCalcula: 'Foto de HOJE, sem período: conta os posts com status Agendado por plataforma; mostra as 5 maiores.',
  },
  'mkt.cronograma': {
    titulo: 'Cronograma social',
    oQueE: 'Quantos posts estão agendados.',
    deOndeVem: 'Marketing › Cronograma Social.',
    comoCalcula: 'Foto de HOJE: posts com status Agendado.',
  },

  // ── RH (`DetailedRHTable`, `RHRelatorios`). Pessoas, folha e benefícios são do MÊS ATUAL. ─────
  'rh.headcount': {
    titulo: 'Headcount ativo',
    oQueE: 'Quantas pessoas estão trabalhando hoje.',
    deOndeVem: 'RH › Colaboradores.',
    comoCalcula: 'Foto de HOJE: colaboradores com situação Ativo (afastado e desligado ficam de fora).',
  },
  'rh.admissoes': {
    titulo: 'Admissões no mês',
    oQueE: 'Quem entrou na empresa no mês atual.',
    deOndeVem: 'RH › Colaboradores (data de admissão).',
    comoCalcula: 'Data de admissão dentro do mês corrente. Não segue o período do topo.',
  },
  'rh.desligamentos': {
    titulo: 'Desligamentos no mês',
    oQueE: 'Quem saiu da empresa no mês atual.',
    deOndeVem: 'RH › Colaboradores (data de desligamento).',
    comoCalcula: 'Data de desligamento dentro do mês corrente. Não segue o período do topo.',
  },
  'rh.aniversariantes': {
    titulo: 'Aniversariantes do mês',
    oQueE: 'Quem faz aniversário neste mês.',
    deOndeVem: 'RH › Colaboradores (data de nascimento).',
    comoCalcula: 'Pessoas na empresa (desligado não entra) com nascimento no mês corrente.',
  },
  'rh.tempo_de_casa': {
    titulo: 'Aniversários de empresa',
    oQueE: 'Quem completa mais um ano de casa neste mês.',
    deOndeVem: 'RH › Colaboradores (data de admissão).',
    comoCalcula: 'Pessoas na empresa com admissão neste mês do calendário e pelo menos 1 ano de casa.',
  },
  'rh.faltas': {
    titulo: 'Faltas no mês',
    oQueE: 'Quantos registros de ausência houve no mês atual.',
    deOndeVem: 'RH › Faltas.',
    comoCalcula: 'Todos os registros do mês corrente — faltas, atestados e atrasos juntos. Atestados e atrasos também aparecem separados nas linhas abaixo.',
  },
  'rh.atestados': {
    titulo: 'Atestados no mês',
    oQueE: 'Ausências justificadas por atestado no mês atual.',
    deOndeVem: 'RH › Faltas (tipo Atestado).',
    comoCalcula: 'Registros do tipo Atestado no mês corrente.',
  },
  'rh.atrasos': {
    titulo: 'Atrasos no mês',
    oQueE: 'Atrasos registrados no mês atual.',
    deOndeVem: 'RH › Faltas (tipo Atraso).',
    comoCalcula: 'Registros do tipo Atraso no mês corrente.',
  },
  'rh.folha_bruta': {
    titulo: 'Folha bruta',
    oQueE: 'O total de salário bruto da folha do mês atual.',
    deOndeVem: 'RH › Folha (lançamentos do mês).',
    comoCalcula: 'Soma do salário bruto de todos os lançamentos da folha do mês corrente.',
  },
  'rh.folha_liquida': {
    titulo: 'Folha líquida',
    oQueE: 'O total pago às pessoas, depois dos descontos.',
    deOndeVem: 'RH › Folha (lançamentos do mês).',
    comoCalcula: 'Soma do salário líquido dos lançamentos do mês corrente.',
  },
  'rh.inss': {
    titulo: 'INSS recolhido',
    oQueE: 'O INSS descontado na folha do mês.',
    deOndeVem: 'RH › Folha.',
    comoCalcula: 'Soma da coluna INSS dos lançamentos do mês corrente.',
  },
  'rh.irpf': {
    titulo: 'IRPF retido',
    oQueE: 'O imposto de renda retido na folha do mês.',
    deOndeVem: 'RH › Folha.',
    comoCalcula: 'Soma da coluna IRPF dos lançamentos do mês corrente.',
  },
  'rh.va': {
    titulo: 'VA pago',
    oQueE: 'Vale-alimentação do mês.',
    deOndeVem: 'RH › Folha; se a folha não tiver o valor, RH › Benefícios › Vale-alimentação.',
    comoCalcula: 'Soma do VA nos lançamentos da folha do mês corrente; sem valor na folha, soma dos lançamentos de VA do mês.',
  },
  'rh.vt': {
    titulo: 'VT pago',
    oQueE: 'Vale-transporte do mês.',
    deOndeVem: 'RH › Folha; se a folha não tiver o valor, RH › Benefícios › Vale-transporte.',
    comoCalcula: 'Soma do VT nos lançamentos da folha do mês corrente; sem valor na folha, soma dos lançamentos de VT do mês.',
  },
  'rh.combustivel': {
    titulo: 'Combustível reembolsado',
    oQueE: 'O reembolso de combustível do mês.',
    deOndeVem: 'RH › Benefícios › Combustível.',
    comoCalcula: 'Soma dos reembolsos lançados no mês corrente.',
  },
  'rh.folha_por_empresa': {
    titulo: 'Folha por empresa',
    oQueE: 'A folha do mês separada por empresa do grupo.',
    deOndeVem: 'RH › Folha.',
    comoCalcula: 'Lançamentos do mês corrente agrupados pela empresa: quantas pessoas e a soma de bruto, líquido, INSS e IRPF.',
  },
  'rh.folha_por_departamento': {
    titulo: 'Folha por departamento',
    oQueE: 'Quanto custa cada departamento no mês.',
    deOndeVem: 'RH › Folha e o departamento de cada colaborador.',
    comoCalcula: 'Lançamentos do mês corrente agrupados pelo departamento. Custo médio = custo total ÷ pessoas.',
  },
  'rh.top_faltas': {
    titulo: 'Top colaboradores com faltas',
    oQueE: 'As 10 pessoas com mais registros de ausência no mês.',
    deOndeVem: 'RH › Faltas.',
    comoCalcula: 'Registros do mês corrente por pessoa: atrasos numa coluna, faltas e atestados na outra.',
  },
  'rh.top_combustivel': {
    titulo: 'Top reembolsos de combustível',
    oQueE: 'As 10 pessoas com maior reembolso de combustível no mês.',
    deOndeVem: 'RH › Benefícios › Combustível.',
    comoCalcula: 'Soma do km e do valor por pessoa no mês corrente.',
  },
  'rh.pessoas_do_mes': {
    titulo: 'Aniversariantes e tempo de casa',
    oQueE: 'Quem faz aniversário e quem completa ano de casa neste mês.',
    deOndeVem: 'RH › Colaboradores.',
    comoCalcula: 'Mês corrente, sem seguir o período do topo. Quem foi desligado não aparece.',
  },

  // ── Qualidade: SAC (`QualidadeDashboard`, `DetailedSACTable`). ───────────────────────────────
  'sac.total': {
    titulo: 'Total de SACs',
    oQueE: 'Quantos SACs de clientes chegaram no período.',
    deOndeVem: 'Os SACs registrados pelo portal do cliente e pela equipe da Qualidade.',
    comoCalcula: 'SACs abertos dentro do período escolhido no topo (pela data de abertura), em qualquer status.',
  },
  'sac.em_aberto': {
    titulo: 'Em aberto',
    oQueE: 'SACs que ainda não terminaram.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'Status Aberto, Em análise ou Aguardando cliente, entre os SACs abertos no período.',
  },
  'sac.resolvidos': {
    titulo: 'Resolvidos',
    oQueE: 'SACs que terminaram.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'Status Resolvido ou Encerrado, entre os SACs abertos no período (no SAC, "Encerrado" é a finalização com laudo — os dois contam como resolvidos).',
  },
  'sac.encerrados': {
    titulo: 'Encerrados',
    oQueE: 'SACs finalizados com o laudo técnico concluído.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'Status Encerrado, entre os SACs abertos no período. Eles já estão contados em Resolvidos.',
  },
  'sac.taxa_resolucao': {
    titulo: 'Taxa de resolução',
    oQueE: 'De cada 100 SACs do período, quantos terminaram.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'Resolvidos (Resolvido + Encerrado) ÷ total de SACs do período.',
  },
  'sac.primeira_resposta': {
    titulo: '1ª resposta',
    oQueE: 'Quanto tempo, em média, a equipe leva para responder o cliente pela primeira vez.',
    deOndeVem: 'A data da primeira resposta de cada SAC.',
    comoCalcula: 'Média, em horas corridas, entre abertura e primeira resposta, dos SACs do período que já foram respondidos.',
  },
  'sac.resolucao': {
    titulo: 'Resolução',
    oQueE: 'Quanto tempo, em média, um SAC leva para ser resolvido.',
    deOndeVem: 'As datas de abertura e de resolução.',
    comoCalcula: 'Média, em horas corridas, entre abertura e resolução, dos SACs do período que já têm data de resolução.',
  },
  'sac.resposta_24h': {
    titulo: '% atendido em 24h',
    oQueE: 'De cada 100 SACs respondidos, quantos tiveram a primeira resposta em até 24 horas.',
    deOndeVem: 'A data da primeira resposta.',
    comoCalcula: 'Entre os SACs do período já respondidos: primeira resposta até 24h depois da abertura ÷ respondidos.',
  },
  'sac.sla_cumprido': {
    titulo: 'SLA cumprido',
    oQueE: 'De cada 100 SACs com prazo, quantos foram resolvidos dentro dele.',
    deOndeVem: 'O prazo de cada SAC e a data de resolução.',
    comoCalcula: 'Resolvidos até o prazo ÷ SACs do período que têm prazo. (O prazo do SAC é do próprio SAC, não o dos chamados internos.)',
  },
  'sac.sla_estourado': {
    titulo: 'SLA estourado',
    oQueE: 'SACs que passaram do prazo.',
    deOndeVem: 'O prazo de cada SAC.',
    comoCalcula: 'Resolvido depois do prazo, ou ainda aberto com o prazo vencido agora. Cancelado e reprovado não contam.',
  },
  'sac.tempo_encerramento': {
    titulo: 'Tempo de encerramento',
    oQueE: 'Quanto tempo passa entre resolver e encerrar o SAC.',
    deOndeVem: 'As datas de resolução e de encerramento.',
    comoCalcula: 'Média, em horas, entre resolução e encerramento, dos SACs que têm as duas datas.',
  },
  'sac.reaberturas': {
    titulo: 'Reaberturas',
    oQueE: 'SACs em que o cliente voltou a escrever depois de resolvido.',
    deOndeVem: 'As mensagens do cliente no SAC.',
    comoCalcula: 'SACs do período com mensagem do cliente depois da data de resolução. O % é sobre o total do período.',
  },
  'sac.auto_atendimento': {
    titulo: 'Auto-atendimento',
    oQueE: 'SACs resolvidos sem resposta da equipe.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'Resolvidos (Resolvido + Encerrado) sem data de primeira resposta. O % é sobre o total do período.',
  },
  'sac.taxa_solucao': {
    titulo: 'Taxa de solução',
    oQueE: 'Na avaliação do cliente, de cada 100, quantos disseram que o problema foi resolvido.',
    deOndeVem: 'A pesquisa de satisfação respondida pelo cliente.',
    comoCalcula: 'Respostas "resolvido" ÷ SACs avaliados no período.',
  },
  'sac.solucao_parcial': {
    titulo: 'Solução parcial',
    oQueE: 'Clientes que disseram que o problema foi resolvido em parte.',
    deOndeVem: 'A pesquisa de satisfação.',
    comoCalcula: 'Quantidade de respostas "parcial" no período.',
  },
  'sac.sem_solucao': {
    titulo: 'Sem solução',
    oQueE: 'Clientes que disseram que o problema não foi resolvido.',
    deOndeVem: 'A pesquisa de satisfação.',
    comoCalcula: 'Quantidade de respostas "não resolvido" no período.',
  },
  'sac.satisfacao': {
    titulo: 'Satisfação do cliente',
    oQueE: 'O que os clientes acharam do atendimento do SAC.',
    deOndeVem: 'A pesquisa de satisfação que o cliente responde no portal.',
    comoCalcula: 'Avaliações FEITAS no período (pela data da avaliação). Média: média das notas de 1 a 5. % solucionados: respostas "resolvido" ÷ avaliações. NPS simplificado: (notas 5 − notas até 3) ÷ avaliações × 100.',
  },
  'sac.evolucao': {
    titulo: 'Evolução de SACs',
    oQueE: 'Dia a dia, quantos SACs chegaram e quantos foram resolvidos.',
    deOndeVem: 'As datas de abertura e de resolução.',
    comoCalcula: 'SACs abertos no período: a linha de abertos usa o dia da abertura; a de resolvidos, o dia da resolução.',
  },
  'sac.atendentes': {
    titulo: 'Atendentes',
    oQueE: 'Para cada atendente: SACs recebidos, resolvidos e tempo médio.',
    deOndeVem: 'Os SACs atribuídos a cada pessoa.',
    comoCalcula: 'SACs do período com atendente. Resolvido = Resolvido ou Encerrado. Tempo médio: da abertura à resolução, em horas.',
  },
  'sac.por_prioridade': {
    titulo: 'Por prioridade',
    oQueE: 'Como os SACs se dividem por prioridade e quanto cada uma leva para resolver.',
    deOndeVem: 'A prioridade de cada SAC.',
    comoCalcula: 'SACs do período por prioridade; % sobre o total; resolução média em horas.',
  },
  'sac.categoria_x_status': {
    titulo: 'SACs por categoria',
    oQueE: 'Cada categoria de SAC, com quantos estão em cada situação.',
    deOndeVem: 'A categoria e o status de cada SAC.',
    comoCalcula: 'SACs do período, contados por categoria e status. Passe o mouse num número para ver os SACs dele.',
  },
  'sac.produtos': {
    titulo: 'Produtos mais reclamados',
    oQueE: 'Os 8 produtos que mais aparecem nos SACs do período.',
    deOndeVem: 'O produto informado no SAC e os produtos adicionais de cada SAC.',
    comoCalcula: 'Conta cada vez que o produto aparece num SAC do período (um SAC com dois produtos conta para os dois). % sobre o total de SACs. Passe o mouse para ver os SACs.',
  },
  'sac.lotes': {
    titulo: 'Lotes problemáticos',
    oQueE: 'Os lotes de produto com mais SACs, e se houve surto.',
    deOndeVem: 'Produto e lote informados nos SACs do período.',
    comoCalcula: 'Ocorrências por produto + lote. "Surto" = 3 ou mais SACs do mesmo lote dentro de 7 dias.',
  },
  'sac.clientes': {
    titulo: 'Clientes que mais abriram SAC',
    oQueE: 'Os 5 clientes com mais SACs no período.',
    deOndeVem: 'O nome do cliente em cada SAC.',
    comoCalcula: 'SACs do período por cliente; % sobre o total de SACs. Passe o mouse para ver os SACs.',
  },
  'sac.equipe': {
    titulo: 'Performance da equipe',
    oQueE: 'Para cada atendente: volume, resolução, tempos, prazo e o que está parado.',
    deOndeVem: 'Os SACs do período atribuídos a cada pessoa.',
    comoCalcula: 'Resolvidos = Resolvido ou Encerrado. SLA estourado: resolvido depois do prazo ou aberto com prazo vencido. Parados +7d: ainda abertos há mais de 7 dias.',
  },
  'sac.nao_solucao': {
    titulo: 'Motivos de não-solução',
    oQueE: 'SACs em que o cliente disse que o problema não foi (ou foi em parte) resolvido, com o comentário dele.',
    deOndeVem: 'A pesquisa de satisfação.',
    comoCalcula: 'SACs do período com resposta "não resolvido" ou "parcial"; mostra os 10 primeiros.',
  },
  'sac.indicadores_do_periodo': {
    titulo: 'Indicadores do período',
    oQueE: 'Os números do SAC no período, com a variação sobre o período anterior.',
    deOndeVem: 'Os SACs do período.',
    comoCalcula: 'O período anterior tem o mesmo tamanho, logo antes deste. Nas linhas com ícone de informação, passe o mouse para ver os SACs.',
  },

  // ── Financeiro (`FinIndicators`). ────────────────────────────────────────────────────────────
  'fin.saldo': {
    titulo: 'Saldo realizado no período',
    oQueE: 'O que entrou menos o que saiu, de verdade, no período.',
    deOndeVem: 'Contas a pagar e a receber do Financeiro.',
    comoCalcula: 'Recebido − pago, pela data em que cada conta foi baixada (paga/recebida) dentro do período. A seta compara com o período anterior do mesmo tamanho.',
  },
  'fin.a_pagar': {
    titulo: 'Total a pagar no período',
    oQueE: 'Quanto vence de contas a pagar no período.',
    deOndeVem: 'Contas a pagar.',
    comoCalcula: 'Soma das contas a pagar com vencimento no período, pagas ou não (canceladas ficam fora).',
  },
  'fin.a_receber': {
    titulo: 'Total a receber no período',
    oQueE: 'Quanto vence de contas a receber no período.',
    deOndeVem: 'Contas a receber.',
    comoCalcula: 'Soma das contas a receber com vencimento no período, recebidas ou não (canceladas ficam fora).',
  },
  'fin.inadimplencia': {
    titulo: 'Inadimplência',
    oQueE: 'Quanto do que a empresa tem a receber já está atrasado.',
    deOndeVem: 'Contas a receber.',
    comoCalcula: 'Foto de HOJE, sem período: a receber vencido ÷ todo o a receber em aberto (vencido + a vencer).',
  },
  'fin.prazo_pagamento': {
    titulo: 'Prazo médio de pagamento',
    oQueE: 'Em média, quantos dias antes ou depois do vencimento a empresa paga.',
    deOndeVem: 'Contas a pagar já pagas.',
    comoCalcula: 'Contas a pagar com vencimento no período e já pagas: média de (dia do pagamento − vencimento). Negativo = pagou antes.',
  },
  'fin.prazo_recebimento': {
    titulo: 'Prazo médio de recebimento',
    oQueE: 'Em média, quantos dias antes ou depois do vencimento a empresa recebe.',
    deOndeVem: 'Contas a receber já recebidas.',
    comoCalcula: 'Contas a receber com vencimento no período e já recebidas: média de (dia do recebimento − vencimento). Negativo = recebeu antes.',
  },
  'fin.vence_7_dias': {
    titulo: 'Vence nos próximos 7 dias',
    oQueE: 'Contas em aberto que vencem esta semana.',
    deOndeVem: 'Contas a pagar e a receber.',
    comoCalcula: 'Foto de HOJE: contas pendentes com vencimento de hoje até daqui a 7 dias. Mostra as 8 primeiras.',
  },
  'fin.vencidos': {
    titulo: 'Já vencidos em aberto',
    oQueE: 'Contas atrasadas que ainda não foram baixadas.',
    deOndeVem: 'Contas a pagar e a receber.',
    comoCalcula: 'Foto de HOJE: contas não pagas com vencimento antes de hoje. Mostra as 8 mais antigas.',
  },
  'fin.gastos_fora_do_padrao': {
    titulo: 'Gastos fora do padrão',
    oQueE: 'Categorias de despesa que subiram muito.',
    deOndeVem: 'Contas a pagar, pela categoria.',
    comoCalcula: 'Soma por categoria das contas a pagar com vencimento no período, comparada com o período anterior do mesmo tamanho. Aparece a categoria 30% ou mais acima.',
  },

  // ── Compras (`ComprasIndicadores`, `usePurchaseIndicators`). Ano e mês do calendário. ────────
  'compras.aprovado_mes': {
    titulo: 'Aprovado no mês',
    oQueE: 'Quanto foi aprovado em compras no mês atual.',
    deOndeVem: 'As solicitações de compra.',
    comoCalcula: 'Soma do valor estimado das solicitações aprovadas ou concluídas, pela data da aprovação, no mês corrente.',
  },
  'compras.aguardando': {
    titulo: 'Aguardando aprovação',
    oQueE: 'Solicitações esperando alguém aprovar.',
    deOndeVem: 'As solicitações de compra.',
    comoCalcula: 'Solicitações deste ano com status Aguardando aprovação.',
  },
  'compras.tempo_aprovacao': {
    titulo: 'Tempo médio de aprovação',
    oQueE: 'Quanto tempo, em média, uma solicitação espera até ser aprovada.',
    deOndeVem: 'As solicitações de compra.',
    comoCalcula: 'Solicitações deste ano já aprovadas: média do tempo entre o pedido e a aprovação (h ou dias, corridos).',
  },
  'compras.produtos_ano': {
    titulo: 'Produtos comprados no ano',
    oQueE: 'Quantos produtos diferentes foram comprados neste ano.',
    deOndeVem: 'As solicitações de compra.',
    comoCalcula: 'Produtos distintos (pelo nome) entre as solicitações aprovadas ou concluídas deste ano.',
  },
  'compras.gasto_por_setor': {
    titulo: 'Gasto do mês por setor',
    oQueE: 'Quanto cada setor aprovou em compras no mês, e o teto dele.',
    deOndeVem: 'As solicitações de compra e o teto por setor (Financeiro › Configurações).',
    comoCalcula: 'Valor estimado das aprovadas/concluídas do mês corrente, por setor. A barra compara com o teto mensal quando ele está ligado.',
  },
  'compras.top_produtos': {
    titulo: 'Produtos mais comprados (ano)',
    oQueE: 'Os 8 produtos mais comprados no ano.',
    deOndeVem: 'As solicitações de compra.',
    comoCalcula: 'Aprovadas ou concluídas deste ano, por produto: quantas compras e o valor estimado somado.',
  },
  'compras.fornecedores': {
    titulo: 'Ranking de fornecedores (ano)',
    oQueE: 'Os 8 fornecedores que mais receberam no ano.',
    deOndeVem: 'O orçamento escolhido em cada aprovação.',
    comoCalcula: 'Aprovadas ou concluídas deste ano, pelo fornecedor do orçamento aprovado: quantas compras e o valor do orçamento.',
  },
} satisfies Record<string, Explicacao>;

export type IdDaExplicacao = keyof typeof EXPLICACOES;
