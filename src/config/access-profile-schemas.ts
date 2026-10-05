// Schemas de permissões por departamento (sistema ÚNICO de perfis de acesso).
// Cada departamento define seções (módulos) e, para cada seção, ações granulares.
// O grid renderizado e o storage em JSONB usam estes schemas como fonte da verdade.
import { ABAS_DE_CONFIGURACAO, chaveDaAba } from '@/config/abas-de-configuracao';

export type Department = 'ti' | 'marketing' | 'rh' | 'qualidade' | 'financeiro' | 'compras' | 'comercial' | 'educacional' | 'expedicao' | 'producao';

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
  { key: 'internal_notes', label: 'Nota interna' },
  { key: 'delete', label: 'Excluir', sensitive: true },
  // Quem recebe o aviso quando alguém do setor fica fora 2+ dias e escolhe quem assume as demandas
  // (decisão do dono, 2026-10-03; `gestores_da_pessoa`, 20261128010000). Não é atender chamado.
  { key: 'repassar_ausencias', label: 'Receber aviso de ausência e repassar as demandas', sensitive: true },
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

const CONFIG_SECTIONS: ModuleSchema[] = [
  { key: 'profiles', label: 'Perfis de acesso', actions: [
    ...CRUD,
    { key: 'assign_users', label: 'Atribuir a usuários', sensitive: true },
  ]},
];

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
      ]},
      { key: 'contracts', label: 'Contratos', actions: CRUD },
      { key: 'licenses', label: 'Licenças', actions: [
        ...CRUD,
        { key: 'assign', label: 'Atribuir licença' },
        { key: 'view_keys', label: 'Ver chaves', sensitive: true },
      ]},
      { key: 'maintenances', label: 'Manutenções', actions: CRUD },
      { key: 'knowledge', label: 'Base de Conhecimento', actions: [
        ...CRUD,
        { key: 'approve', label: 'Aprovar' },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
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
      { key: 'campaigns', label: 'Campanhas', actions: CRUD },
      { key: 'inventory', label: 'Inventário MKT', actions: [
        ...CRUD,
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'suppliers', label: 'Fornecedores', actions: CRUD },
      { key: 'quotations', label: 'Cotações', actions: [
        ...CRUD,
        { key: 'approve', label: 'Aprovar' },
      ]},
      { key: 'ugc', label: 'UGC', actions: [
        ...CRUD,
        { key: 'approve', label: 'Aprovar' },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
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
        { key: 'approve', label: 'Aprovar' },
        { key: 'publish', label: 'Publicar' },
      ]},
      { key: 'products', label: 'Produtos & Lotes', actions: [
        ...CRUD,
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'technical_reports', label: 'Laudos Técnicos', actions: [
        ...CRUD,
        { key: 'sign', label: 'Assinar/Finalizar', sensitive: true },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
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
        { key: 'approve_payment', label: 'Aprovar pagamento', sensitive: true },
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
      { key: 'cashflow', label: 'Fluxo de Caixa', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      { key: 'profiles', label: 'Perfis de acesso', actions: [
        ...CRUD,
        { key: 'assign_users', label: 'Atribuir a usuários', sensitive: true },
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
      { key: 'fornecedores', label: 'Fornecedores', actions: CRUD },
      { key: 'reports', label: 'Indicadores de Compras', actions: REPORT_ACTIONS },
      { key: 'profiles', label: 'Perfis de acesso', actions: [
        ...CRUD,
        { key: 'assign_users', label: 'Atribuir a usuários', sensitive: true },
      ]},
    ],
  },
  comercial: {
    department: 'comercial',
    label: 'Comercial',
    modules: [
      { key: 'tickets', label: 'Chamados Comercial', actions: TICKET_ACTIONS },
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      // Base de vendas do Forteplus (L6a): quem só vê o painel não precisa
      // poder importar, e importar não precisa poder substituir um mês já
      // gravado (substituir apaga dado — §4.6 do plano do Painel Comercial).
      { key: 'vendas', label: 'Base de vendas (Forteplus)', actions: [
        { key: 'view', label: 'Ver o painel' },
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
      { key: 'clientes', label: 'Cadastro de clientes', actions: [
        { key: 'cadastrar', label: 'Cadastrar cliente novo (Configurações › Cadastro de clientes)', sensitive: true },
      ]},
      // Lançamento salvo não muda para a vendedora (2026-10-02): cada contato é um lançamento. Quem
      // tem estas caixinhas corrige ou apaga — na tela e no banco (`com_pode_corrigir_lancamento`).
      { key: 'lancamentos', label: 'Lançamentos', actions: [
        { key: 'corrigir', label: 'Corrigir lançamento já salvo (cliente, data, indicadores, de qualquer vendedora)', sensitive: true },
        { key: 'apagar', label: 'Apagar lançamento', sensitive: true },
      ]},
      { key: 'carteiras', label: 'Carteiras', actions: [
        { key: 'gerir', label: 'Montar carteiras, mover clientes entre elas e ver os lançamentos da equipe', sensitive: true },
      ]},
      { key: 'metas', label: 'Metas', actions: [
        { key: 'definir', label: 'Definir metas (carteira, empresa e indicadores das vendedoras) e a lista de indicadores', sensitive: true },
      ]},
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  educacional: {
    department: 'educacional',
    label: 'Educacional',
    modules: [
      { key: 'tickets', label: 'Chamados Educacional', actions: TICKET_ACTIONS },
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
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
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  producao: {
    department: 'producao',
    label: 'Produção',
    modules: [
      { key: 'tickets', label: 'Chamados da Produção', actions: TICKET_ACTIONS },
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
};

export const DEPARTMENT_LIST: Department[] = ['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional', 'expedicao', 'producao'];

// As linhas das abas de configuração entram no TOPO de cada setor: é a primeira coisa que o
// dono procura ao montar um perfil (LEVA P, parte 7).
for (const setor of DEPARTMENT_LIST) {
  DEPARTMENT_SCHEMAS[setor].modules.unshift(...linhasDasAbas(setor));
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

  // 3. seção única "settings" antiga → seções de configuração granulares
  const legacySettings = saved.settings as Record<string, boolean> | undefined;
  if (legacySettings) {
    for (const section of CONFIG_SECTIONS) {
      const target = out[section.key];
      if (!target) continue;
      if (legacySettings.view && typeof target.view === 'boolean') target.view = true;
      if (legacySettings.edit) {
        for (const a of section.actions) {
          if (a.key !== 'delete' && !a.sensitive) target[a.key] = true;
        }
      }
    }
  }

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
