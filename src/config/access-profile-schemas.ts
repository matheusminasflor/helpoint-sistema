// Schemas de permissões por departamento (sistema ÚNICO de perfis de acesso).
// Cada departamento define seções (módulos) e, para cada seção, ações granulares.
// O grid renderizado e o storage em JSONB usam estes schemas como fonte da verdade.
import { ABAS_DE_CONFIGURACAO, chaveDaAba } from '@/config/abas-de-configuracao';

export type Department = 'ti' | 'marketing' | 'rh' | 'qualidade' | 'financeiro' | 'compras' | 'comercial' | 'educacional' | 'expedicao' | 'producao' | 'diretoria';

export type ActionKey = string;

export interface ModuleSchema {
  key: string;
  label: string;
  description?: string;
  actions: { key: ActionKey; label: string; sensitive?: boolean }[];
}

export interface DepartmentSchema {
  department: Department;
  label: string;
  modules: ModuleSchema[];
  /**
   * Mostrava o bloco "Restrições da fila de chamados" no editor. Nenhum setor liga mais (2026-10-01):
   * o bloco nunca foi lido por tela nem banco, e "ver os chamados do setor" virou caixinha que vale.
   */
  hasTicketRestrictions?: boolean;
}

// ---------------------------------------------------------------------------
// Conjuntos reutilizáveis
// ---------------------------------------------------------------------------

const CRUD = [
  { key: 'view', label: 'Visualizar' },
  { key: 'create', label: 'Criar' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
];

/**
 * As ações de chamado, iguais em todo setor (decisão do dono, 2026-10-01). Cada uma é lida pela tela
 * (`usePodeNoChamado`) e pelo banco (`pode_no_chamado`, guarda `chamado_guarda_o_perfil`) — antes
 * desta data nenhuma era. "Abrir chamado" não é ação de perfil: qualquer pessoa abre para qualquer setor.
 */
export const TICKET_ACTIONS = [
  { key: 'view_all', label: 'Ver os chamados do setor' },
  { key: 'assume', label: 'Assumir / atender' },
  { key: 'change_status', label: 'Mudar status' },
  // A chave continua `close` (o banco pergunta por ela); só o rótulo mudou — não existe mais
  // "fechar" (dono, 2026-10-04). Cancelar também passa por esta caixinha.
  { key: 'close', label: 'Resolver' },
  { key: 'reopen', label: 'Reabrir' },
  { key: 'transfer', label: 'Transferir para outra pessoa' },
  { key: 'change_priority', label: 'Mudar prioridade e prazo' },
  // Agendar é caixinha própria desde 2026-10-14 (dono: todo operador agenda); antes vinha com a de cima.
  { key: 'schedule', label: 'Agendar' },
  // Só para categoria do mesmo setor (dono, 2026-10-05; guarda `chamado_guarda_o_perfil`).
  { key: 'change_category', label: 'Mudar categoria' },
  { key: 'internal_notes', label: 'Nota interna' },
  { key: 'delete', label: 'Excluir', sensitive: true },
  // Quem recebe o aviso quando alguém do setor fica fora 2+ dias e escolhe quem assume as demandas
  // (decisão do dono, 2026-10-03; `gestores_da_pessoa`, 20261128010000). Não é atender chamado.
  { key: 'repassar_ausencias', label: 'Receber aviso de ausência e repassar as demandas', sensitive: true },
  // Quatro ações que pegavam carona em outras (etapa 0b, 2026-10-24; migration 20270130020000). Nasceram ligadas
  // em quem passava pela carona: "Assumir" → abrir em nome; "Transferir" → atender junto e viagem; "Configurar
  // chamados · alterar" → automações.
  { key: 'abrir_em_nome', label: 'Abrir chamado em nome de outra pessoa (vale para qualquer setor)' },
  { key: 'atender_junto', label: 'Chamar alguém para atender junto (em chamado de outro atendente)' },
  { key: 'registrar_viagem', label: 'Registrar viagem de quem atende (pausa o prazo)' },
  { key: 'automacoes', label: 'Criar e editar automações', sensitive: true },
];

/** O trio de toda tela (decisão do dono, 2026-10-01): ver, criar e editar, excluir. */
const VER_EDITAR_EXCLUIR = [
  { key: 'view', label: 'Ver' },
  { key: 'edit', label: 'Criar e editar' },
  { key: 'delete', label: 'Excluir', sensitive: true },
];

const REPORT_ACTIONS = [
  { key: 'view', label: 'Visualizar' },
  { key: 'export', label: 'Exportar' },
  { key: 'view_team_metrics', label: 'Ver métricas da equipe' },
];

/**
 * CONFIGURAÇÕES DO SETOR, ABA POR ABA (LEVA P, parte 7 — o dono escolheu em 2026-09-29): cada aba
 * da configuração é uma linha do perfil, com "Abrir" e "Alterar". As linhas vêm de
 * `ABAS_DE_CONFIGURACAO` e entram no topo de cada setor, logo abaixo desta declaração.
 *
 * Saíram daqui, por estarem cobertas pelas abas: "Formulários", "SLA", "Checklists" e
 * "Categorias" (a tela lia essas chaves só para esconder botão; o banco decidia pelo cargo), e a
 * chave única `settings` da parte 6, que o banco converte em uma chave por aba.
 */
function linhasDasAbas(setor: Department): ModuleSchema[] {
  return ABAS_DE_CONFIGURACAO[setor].map((a) => ({
    key: chaveDaAba(a.aba),
    label: `Configurações › ${a.rotulo}`,
    actions: a.soAbrir
      ? [{ key: 'view', label: 'Abrir' }]
      : [{ key: 'view', label: 'Abrir' }, { key: 'edit', label: 'Alterar', sensitive: true }],
  }));
}

// "Perfis de acesso" saiu de todos os setores (dono, 2026-10-24, decisão 4 da proposta): nenhuma tela nem regra lia a
// caixinha; quem edita perfis continua sendo só dono e administrador. Saíram junto as opções que não valiam nada:
// Painel (a fila já tem opção), Campanhas, Cotações e UGC (sem tela), Aprovar pagamento (o banco só a usava como
// sinônimo de editar), Caixinha · lançar (quem lança é o responsável) e Aprovar tutorial (nunca perguntado).

export const DEPARTMENT_SCHEMAS: Record<Department, DepartmentSchema> = {
  ti: {
    department: 'ti',
    label: 'TI',
    modules: [
      { key: 'tickets', label: 'Chamados', actions: TICKET_ACTIONS },
      { key: 'inventory', label: 'Inventário', actions: [
        ...CRUD,
        { key: 'transfer', label: 'Transferir equipamento' },
        { key: 'export', label: 'Exportar' },
        // Etapa 0b (2026-10-24): o checklist de devolução e a conferência do mês pegavam carona em "Editar".
        { key: 'conferir', label: 'Conferir devolução e a conferência do mês (marcar itens, anexar o termo)' },
      ]},
      { key: 'contracts', label: 'Contratos', actions: CRUD },
      // Termos de responsabilidade de equipamento (dono, 2026-10-20; 20270129080000): seção própria na matriz.
      { key: 'termos', label: 'Termos de responsabilidade', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'create', label: 'Gerar termo' },
        { key: 'edit', label: 'Anexar assinado e registrar devolução' },
        { key: 'delete', label: 'Excluir', sensitive: true },
      ]},
      { key: 'licenses', label: 'Licenças', actions: [
        ...CRUD,
        { key: 'assign', label: 'Atribuir licença' },
        { key: 'view_keys', label: 'Ver chaves', sensitive: true },
      ]},
      { key: 'maintenances', label: 'Manutenções', actions: CRUD },
      // Portal do Distribuidor (etapa 6, decisão do dono de 2026-10-25): só o Gestor da TI nasce com elas.
      { key: 'distribuidores', label: 'Distribuidores (Portal do Distribuidor)', actions: [
        { key: 'view', label: 'Ver os pedidos e os distribuidores' },
        { key: 'liberar', label: 'Liberar, recusar e suspender distribuidor', sensitive: true },
      ]},
      { key: 'knowledge', label: 'Base de Conhecimento', actions: CRUD },
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  marketing: {
    department: 'marketing',
    label: 'Marketing',
    modules: [
      { key: 'tickets', label: 'Chamados MKT', actions: TICKET_ACTIONS },
      { key: 'calendar', label: 'Calendário de Redes Sociais', actions: [
        ...CRUD,
        { key: 'publish', label: 'Publicar/Aprovar' },
      ]},
      // Estoque no lugar do Inventário (dono, 2026-10-19): Ver; Criar = lançar entrada e retirada; Editar = cadastrar
      // produto; Excluir = apagar lançamento manual. Vale no banco (`pode_no_estoque_mkt`, 20270128010000).
      { key: 'estoque', label: 'Estoque', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'create', label: 'Lançar entrada e retirada' },
        { key: 'edit', label: 'Cadastrar produto' },
        { key: 'delete', label: 'Apagar lançamento', sensitive: true },
      ]},
      // Benefício de sexta (dono, 2026-10-20; 20270129080000). Quem libera quem atrasou fica na aba de configuração.
      { key: 'beneficio', label: 'Benefício de sexta', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'create', label: 'Registrar retirada e devolução' },
        { key: 'edit', label: 'Cadastrar produtos, lotes e linhas' },
      ]},
      { key: 'suppliers', label: 'Fornecedores', actions: CRUD },
      // Jornal da empresa (decisão do dono, 2026-10-04): o Marketing escreve; ler é de todos. Vale no
      // banco (`pode_no_setor('marketing', 'jornal', …)`, migrations 20261204020000 e 20261205070000).
      { key: 'jornal', label: 'Jornal da empresa', actions: [
        { key: 'edit', label: 'Criar e editar' },
        { key: 'publish', label: 'Publicar e despublicar', sensitive: true },
        { key: 'delete', label: 'Excluir', sensitive: true },
      ]},
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  rh: {
    department: 'rh',
    label: 'RH',
    modules: [
      // Cada seção é uma tela do menu e vale na tela e no banco (`pode_no_rh`, migration
      // 20261119020000; decisão do dono, 2026-10-01). Sem "Painel" e sem "Perfis de acesso".
      { key: 'tickets', label: 'Chamados RH', actions: TICKET_ACTIONS },
      { key: 'employees', label: 'Colaboradores', actions: [
        ...VER_EDITAR_EXCLUIR,
        { key: 'view_salary', label: 'Ver salário', sensitive: true },
      ]},
      { key: 'payroll', label: 'Folha', actions: [
        ...VER_EDITAR_EXCLUIR,
        { key: 'run', label: 'Rodar folha', sensitive: true },
      ]},
      { key: 'benefits', label: 'Benefícios', actions: VER_EDITAR_EXCLUIR },
      { key: 'vacations', label: 'Férias', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'approve', label: 'Aprovar e recusar', sensitive: true },
      ]},
      { key: 'certificates', label: 'Atestados', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'approve', label: 'Aprovar e recusar', sensitive: true },
      ]},
      { key: 'absences', label: 'Faltas', actions: VER_EDITAR_EXCLUIR },
      { key: 'payslips', label: 'Holerites', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'edit', label: 'Enviar' },
      ]},
      { key: 'documents', label: 'Documentos', actions: VER_EDITAR_EXCLUIR },
      // Etapa 0b (2026-10-24): até aqui só dono e administrador; o Gestor do RH nasceu com ela.
      { key: 'reembolsos', label: 'Reembolsos (vale-alimentação, transporte, combustível e descontos)', actions: VER_EDITAR_EXCLUIR },
      { key: 'reports', label: 'Indicadores', actions: [{ key: 'view', label: 'Ver' }] },
    ],
  },
  qualidade: {
    department: 'qualidade',
    label: 'Qualidade',
    modules: [
      { key: 'tickets', label: 'Chamados SAC', actions: TICKET_ACTIONS },
      { key: 'pops', label: 'POPs / Base de Conhecimento', actions: [
        ...CRUD,
        { key: 'publish', label: 'Publicar' },
      ]},
      // Etapa 0b (2026-10-24): bastava ter o módulo. "Produtos & Lotes" saiu: nada a lia (o cadastro é a aba
      // "SAC: produtos e lotes" das configurações). Vale no banco: `ve_o_sac`, `pode_atender_o_sac`, laudo.
      { key: 'sacs', label: 'SACs de clientes', actions: [
        { key: 'view', label: 'Ver todos os SACs' },
        { key: 'edit', label: 'Atender e alterar' },
      ]},
      { key: 'technical_reports', label: 'Laudos Técnicos', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'edit', label: 'Escrever o laudo' },
        { key: 'sign', label: 'Assinar/Finalizar', sensitive: true },
      ]},
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  financeiro: {
    department: 'financeiro',
    label: 'Financeiro',
    modules: [
      { key: 'payables', label: 'Contas a Pagar', actions: [
        ...CRUD,
        { key: 'import', label: 'Importar planilha' },
        { key: 'settle', label: 'Baixar pagamento' },
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'receivables', label: 'Contas a Receber', actions: [
        ...CRUD,
        { key: 'import', label: 'Importar planilha' },
        { key: 'settle', label: 'Baixar recebimento' },
        { key: 'export', label: 'Exportar' },
      ]},
      // COMPRAS SAIU DAQUI em 2026-09-27 (leva N). O teto de gasto (`budgets.manage`) ficou
      // no Financeiro até a LEVA P, parte 7: agora é a aba "Teto de gasto" de Compras.
      { key: 'tickets', label: 'Chamados do Financeiro', actions: [...TICKET_ACTIONS] },
      // Checklist de pedidos do Comercial (LEVA S, 2026-09-29). As três ações são as portas de
      // `ped_ve_todos`, `ped_pode_decidir` e `ped_pode_registrar_pagamento` no banco.
      { key: 'conferencia', label: 'Conferência de pedidos', actions: [
        { key: 'view', label: 'Ver todos os checklists' },
        { key: 'decidir', label: 'Aprovar e recusar', sensitive: true },
        { key: 'pagamento', label: 'Registrar pagamento e finalizar', sensitive: true },
      ]},
      // Caixinha do dia a dia (dono, 2026-10-14): as portas de `pode_na_caixinha` no banco. Não há "Editar":
      // lançamento salvo não muda; errou, apaga e lança de novo.
      { key: 'caixinha', label: 'Caixinha', actions: [
        // O responsável sempre vê a dele; esta caixinha abre as de todos (o relatório também).
        { key: 'view', label: 'Ver todas as caixinhas' },
        { key: 'delete', label: 'Excluir lançamento' },
      ]},
      // Etapa 0b (2026-10-24): pegava carona em "Contas a pagar". Lê as compras (`compras_ve_as_solicitacoes`).
      { key: 'relatorio_compras', label: 'Relatório de compras', actions: [{ key: 'view', label: 'Abrir' }] },
      { key: 'cashflow', label: 'Fluxo de Caixa', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'reports', label: 'Indicadores', actions: [
        ...REPORT_ACTIONS,
        { key: 'view_financial_indicators', label: 'Ver indicadores financeiros', sensitive: true },
      ]},
    ],
  },
  /**
   * COMPRAS, departamento próprio desde 2026-09-27 (leva N).
   *
   * Sem `tickets`: o dono decidiu que **a solicitação de compra já é o pedido**, e uma
   * segunda caixa de entrada seria dois lugares para olhar a mesma coisa. Sem
   * `budgets`: o teto ficou no Financeiro, porque quem paga define o limite.
   *
   * `solicitacoes:view` existe além do módulo porque são coisas diferentes: ter o
   * módulo abre a tela; ver as solicitações **de todos** é a permissão. Quem abriu a
   * própria sempre vê a dela — isso é policy, não permissão (`compras_solicitacoes_select`).
   */
  compras: {
    department: 'compras',
    label: 'Compras',
    modules: [
      { key: 'solicitacoes', label: 'Solicitações de Compra', actions: [
        { key: 'view', label: 'Visualizar todas as solicitações' },
        { key: 'approve', label: 'Aprovar / reprovar compra', sensitive: true },
        { key: 'execute', label: 'Executar compra e registrar laudo', sensitive: true },
      ]},
      { key: 'catalogo', label: 'Catálogo de Produtos', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'edit', label: 'Criar e editar produtos' },
      ]},
      // Estoque de suprimentos (20270118010000): ver o saldo, lançar retirada/entrada, apagar lançamento.
      { key: 'estoque', label: 'Estoque de suprimentos', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'create', label: 'Registrar retirada e entrada' },
        { key: 'delete', label: 'Apagar lançamento', sensitive: true },
        // Além do comprador de "Quem compra" (20270120010000): trocar de comprador não deixa o aviso sem dono.
        { key: 'aviso', label: 'Recebe o aviso de estoque mínimo' },
      ]},
      { key: 'fornecedores', label: 'Fornecedores', actions: CRUD },
      // Só a caixinha de ausência (revisão de permissões, 2026-10-04): Compras não tem fila de
      // chamados, mas o gestor precisa receber o aviso quando um comprador sai 2+ dias e repassar
      // as demandas. A chave é a mesma dos outros setores (`gestores_da_pessoa`, 20261205010000).
      { key: 'tickets', label: 'Ausências da equipe', actions: TICKET_ACTIONS.filter((a) => a.key === 'repassar_ausencias' || a.key === 'abrir_em_nome') },
      // Sem "Ver métricas da equipe": Compras não tem fila de chamados (2026-10-24).
      { key: 'reports', label: 'Indicadores de Compras', actions: REPORT_ACTIONS.filter((a) => a.key !== 'view_team_metrics') },
    ],
  },
  comercial: {
    department: 'comercial',
    label: 'Comercial',
    modules: [
      { key: 'tickets', label: 'Chamados Comercial', actions: TICKET_ACTIONS },
      // CADA TELA COM A SUA CAIXINHA (dono, 2026-10-14: "eu posso querer liberar 1 relatório para X usuário ou perfil;
      // ex.: indicadores, o Operador vê os dele e não da equipe, o gestor vê de todos"). "Ver a equipe" é a caixinha
      // do escopo: sem ela, a pessoa vê só o que é dela (no banco: 20270112010000). Saiu `dashboard`, sem uso.
      // Base de vendas do Forteplus (L6a): quem só vê o painel não precisa
      // poder importar, e importar não precisa poder substituir um mês já
      // gravado (substituir apaga dado — §4.6 do plano do Painel Comercial).
      { key: 'vendas', label: 'Vendas (faturado do Forteplus)', actions: [
        { key: 'view', label: 'Abrir a tela Vendas' },
        { key: 'importar', label: 'Importar planilha', sensitive: true },
        { key: 'substituir', label: 'Substituir um mês já importado', sensitive: true },
      ]},
      // A grade de cashback (L6c) é a aba "Cashback" das configurações desde a LEVA P,
      // parte 7 — a chave `cashback.configurar` foi convertida em `config_cashback`.
      // Carteiras e metas: a chave técnica `carteiras.gerir` não mudou (evita
      // migrar perfis já atribuídos) desde que a Frente 2 desfez a atribuição
      // de cliente a carteira (carteira não existe no ERP) — só o rótulo
      // muda, para o que a permissão faz de verdade hoje: dizer quem
      // responde por cada carteira, e é essa pessoa que o sino avisa.
      // LEVA O (2026-09-28): as duas chaves passaram a governar mais, e os rótulos dizem o
      // quê — perfil de acesso com rótulo que esconde metade do poder é permissão dada sem
      // saber. `carteiras.gerir` agora também move cliente de carteira (a vendedora só traz
      // do Histórico para a dela) e lê os lançamentos da equipe; `metas.definir` também
      // define a meta de cada indicador por vendedora e edita a lista de indicadores.
      // Cadastrar cliente novo (2026-10-01, decisão do dono): só em Configurações › Cadastro de
      // clientes e só com esta caixinha — vale na tela e no banco (`com_clientes_insert`). Completar
      // os dados de um cliente que já existe continua com a vendedora, no Comercial.
      { key: 'clientes', label: 'Clientes (parados e ficha)', actions: [
        { key: 'view', label: 'Abrir Clientes parados e a ficha do cliente' },
        { key: 'cadastrar', label: 'Cadastro de clientes (Configurações) — dono e administradores sempre têm', sensitive: true },
      ]},
      // Lançamento salvo não muda para a vendedora (2026-10-02): cada contato é um lançamento. Quem
      // tem estas caixinhas corrige ou apaga — na tela e no banco (`com_pode_corrigir_lancamento`).
      { key: 'lancamentos', label: 'Lançamentos', actions: [
        { key: 'view', label: 'Abrir Lançamentos (registrar os contatos do dia)' },
        { key: 'equipe', label: 'Ver os lançamentos da equipe (sem ela, só os seus)', sensitive: true },
        { key: 'corrigir', label: 'Corrigir lançamento já salvo (cliente, data, indicadores, de qualquer vendedora)', sensitive: true },
        { key: 'apagar', label: 'Apagar lançamento', sensitive: true },
      ]},
      // Marcar e desfazer "benefício concedido" (revisão de permissões, 2026-10-04): caixinha própria,
      // para quem aplica o benefício no pedido não ganhar junto o poder de mudar a regra ou as
      // carteiras. Vale no banco (`com_pode_conceder_diretriz`, 20261205020000).
      { key: 'diretrizes_beneficio', label: 'Benefícios a conceder (diretrizes comerciais)', actions: [
        { key: 'view', label: 'Abrir Benefícios a conceder' },
        { key: 'conceder', label: 'Conceder benefício (marcar e desfazer "concedido")', sensitive: true },
      ]},
      { key: 'carteiras', label: 'Carteiras', actions: [
        { key: 'view', label: 'Abrir a carteira (a sua)' },
        { key: 'equipe', label: 'Ver todas as carteiras (sem ela, só a sua)', sensitive: true },
        { key: 'gerir', label: 'Montar carteiras, mover clientes entre elas (e, por isso, ver tudo da equipe)', sensitive: true },
      ]},
      { key: 'metas', label: 'Metas', actions: [
        { key: 'definir', label: 'Definir metas (carteira, empresa e indicadores das vendedoras) e a lista de indicadores', sensitive: true },
      ]},
      { key: 'reports', label: 'Indicadores (meta × realizado)', actions: [
        { key: 'view', label: 'Abrir Indicadores (os seus)' },
        { key: 'export', label: 'Exportar' },
        { key: 'view_team_metrics', label: 'Ver os indicadores da equipe toda (sem ela, só os seus)', sensitive: true },
      ]},
      { key: 'bonificacao', label: 'Bonificação', actions: [{ key: 'view', label: 'Abrir Bonificação' }] },
      { key: 'cashback', label: 'Cashback', actions: [{ key: 'view', label: 'Abrir Cashback (apuração por cliente)' }] },
      { key: 'atendimento', label: 'Atendimento (indicadores dos chamados)', actions: [{ key: 'view', label: 'Abrir Atendimento' }] },
    ],
  },
  educacional: {
    department: 'educacional',
    label: 'Educacional',
    modules: [
      { key: 'tickets', label: 'Chamados Educacional', actions: TICKET_ACTIONS },
      // Etapa 0b (2026-10-24): ver e inscrever bastava o módulo; montar era só do administrador.
      { key: 'treinamentos', label: 'Treinamentos', actions: [
        { key: 'view', label: 'Ver' },
        { key: 'create', label: 'Inscrever e marcar presença' },
        { key: 'edit', label: 'Montar treinamento e abrir turma' },
        { key: 'delete', label: 'Apagar inscrição', sensitive: true },
      ]},
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  // Expedição e Produção são setores de atendimento (decisão do dono, 2026-10-02): fila de
  // chamados, indicadores e configurações — o molde do Educacional, sem treinamentos.
  expedicao: {
    department: 'expedicao',
    label: 'Expedição',
    modules: [
      { key: 'tickets', label: 'Chamados da Expedição', actions: TICKET_ACTIONS },
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  producao: {
    department: 'producao',
    label: 'Produção',
    modules: [
      { key: 'tickets', label: 'Chamados da Produção', actions: TICKET_ACTIONS },
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  // Diretoria vira setor (decisão 5 do dono, 2026-10-24): "Ver" por tela. Vale no banco em `dir_pode_ver`
  // (migration 20270130010000); o perfil "Diretor" nasce com tudo ligado para quem já tinha a Diretoria.
  diretoria: {
    department: 'diretoria',
    label: 'Diretoria',
    modules: [
      { key: 'resumo', label: 'Resumo', actions: [{ key: 'view', label: 'Ver' }] },
      { key: 'indicadores', label: 'Indicadores dos setores', actions: [{ key: 'view', label: 'Ver' }, { key: 'definir_metas', label: 'Definir as metas' }] },
      { key: 'metas', label: 'Metas e carteiras', actions: [{ key: 'view', label: 'Ver' }] },
      { key: 'clientes', label: 'Clientes', actions: [{ key: 'view', label: 'Ver' }] },
      { key: 'produtos', label: 'Produtos', actions: [{ key: 'view', label: 'Ver' }] },
      { key: 'diretrizes', label: 'Diretrizes de todos os setores', actions: [{ key: 'view', label: 'Ver' }] },
    ],
  },
};

export const DEPARTMENT_LIST: Department[] = ['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional', 'expedicao', 'producao', 'diretoria'];

// As linhas das abas de configuração entram no TOPO de cada setor: é a primeira coisa que o
// dono procura ao montar um perfil (LEVA P, parte 7).
for (const setor of DEPARTMENT_LIST) {
  DEPARTMENT_SCHEMAS[setor].modules.unshift(...linhasDasAbas(setor));
}

/**
 * DIRETRIZES DO SETOR (decisão do dono, 2026-10-04): a mesma seção em todo setor. O Comercial entrou em
 * 2026-10-20 (a regra de benefício é outra seção, `diretrizes_beneficio`). Vale no banco: `pode_no_setor(setor, 'diretrizes', …)`
 * (migration 20261204010000). Ler não precisa de caixinha — quem é do setor lê; "Ver" abre as
 * diretrizes do setor para quem é de fora dele.
 */
export const DIRETRIZES_ACTIONS = [
  { key: 'view', label: 'Ver (mesmo sem ser do setor)' },
  { key: 'edit', label: 'Criar e editar' },
  { key: 'publish', label: 'Publicar e arquivar', sensitive: true },
  { key: 'delete', label: 'Excluir rascunho', sensitive: true },
];
// A Diretoria lê as de todos os setores (a seção dela, acima) e não tem diretrizes próprias.
for (const setor of DEPARTMENT_LIST.filter((s) => s !== 'diretoria')) {
  DEPARTMENT_SCHEMAS[setor].modules.push({ key: 'diretrizes', label: 'Diretrizes do setor', actions: DIRETRIZES_ACTIONS });
}

// Permissions JSON format: { [moduleKey]: { [actionKey]: boolean } }
export type PermissionsMap = Record<string, Record<string, boolean>>;

export interface ProfileRestrictions {
  /** Visibilidade da fila de chamados. */
  ticket_visibility: 'all' | 'own' | 'unassigned';
  /** IDs de categorias permitidas (vazio = todas). */
  categories: string[];
  /** Prioridades permitidas (vazio = todas). */
  priorities: string[];
}

export const DEFAULT_RESTRICTIONS: ProfileRestrictions = {
  ticket_visibility: 'own',
  categories: [],
  priorities: [],
};

export function normalizeRestrictions(raw: unknown): ProfileRestrictions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const legacyVisibility = r.visibility as ProfileRestrictions['ticket_visibility'] | undefined;
  const visibility = (r.ticket_visibility as ProfileRestrictions['ticket_visibility']) ?? legacyVisibility;
  return {
    ticket_visibility: visibility === 'all' || visibility === 'unassigned' || visibility === 'own'
      ? visibility
      : DEFAULT_RESTRICTIONS.ticket_visibility,
    categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
    priorities: Array.isArray(r.priorities) ? (r.priorities as string[]) : [],
  };
}

export function buildEmptyPermissions(dept: Department): PermissionsMap {
  const schema = DEPARTMENT_SCHEMAS[dept];
  const out: PermissionsMap = {};
  for (const m of schema.modules) {
    out[m.key] = {};
    for (const a of m.actions) out[m.key][a.key] = false;
  }
  return out;
}

export function buildFullPermissions(dept: Department): PermissionsMap {
  const schema = DEPARTMENT_SCHEMAS[dept];
  const out: PermissionsMap = {};
  for (const m of schema.modules) {
    out[m.key] = {};
    for (const a of m.actions) out[m.key][a.key] = true;
  }
  return out;
}

/**
 * Converte perfis salvos no formato antigo (ações simples view/create/edit/delete
 * na seção de chamados, e uma seção única "settings") para o schema granular
 * atual, sem perder nenhuma configuração já feita.
 */
export function normalizePermissions(dept: Department, raw: unknown): PermissionsMap {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as PermissionsMap;
  const out = buildEmptyPermissions(dept);

  // 1. copia o que já casa exatamente com o schema atual
  for (const m of DEPARTMENT_SCHEMAS[dept].modules) {
    const savedSection = saved[m.key];
    if (!savedSection) continue;
    for (const a of m.actions) {
      if (typeof savedSection[a.key] === 'boolean') out[m.key][a.key] = savedSection[a.key];
    }
  }

  // 2. (chamados no formato antigo) — não há mais: o banco traduz todo perfil com chaves antigas no
  //    momento em que é gravado (`perfil_chamados_no_formato_novo`, migration 20261119010000).


  return out;
}

/**
 * Lê uma permissão considerando perfil + overrides do usuário — o espelho de
 * `tem_permissao` no banco (`20261014020000_comercial_correcoes_da_auditoria.sql`).
 *
 * Dois casos em que um valor presente não conta como "o override falou"
 * (achado 2a da auditoria do Painel Comercial): JSON `null` (`!== undefined`
 * era verdadeiro para `null`, e a tela negava onde o banco caía pro perfil)
 * e qualquer valor que não seja `true`/`false` de verdade — o banco só aceita
 * o override quando `jsonb_typeof(...) = 'boolean'`; aqui o equivalente é
 * `typeof === 'boolean'`. Mesma regra no perfil, pela mesma razão.
 */
export function resolvePermission(
  perms: PermissionsMap | null | undefined,
  overrides: PermissionsMap | null | undefined,
  moduleKey: string,
  actionKey: string
): boolean {
  const overrideValue: unknown = overrides?.[moduleKey]?.[actionKey];
  if (typeof overrideValue === 'boolean') return overrideValue;
  const profileValue: unknown = perms?.[moduleKey]?.[actionKey];
  if (typeof profileValue === 'boolean') return profileValue;
  return false;
}

// Solicitações (etapa 4b, migration 20270201010000): os pedidos com etapas que cada setor atende. "Ver" a fila do setor;
// "Decidir" aceitar, recusar com motivo, entregar, liberar, conferir. Nasceram ligadas para quem já atende os chamados.
for (const setor of ['marketing', 'ti', 'financeiro', 'rh'] as const) {
  DEPARTMENT_SCHEMAS[setor].modules.push({
    key: 'solicitacoes', label: 'Solicitações (pedidos com etapas)',
    actions: [{ key: 'view', label: 'Ver' }, { key: 'decidir', label: 'Decidir: aceitar, recusar, entregar, liberar' }],
  });
}
