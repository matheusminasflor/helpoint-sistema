// Schemas de permissões por departamento (sistema ÚNICO de perfis de acesso).
// Cada departamento define seções (módulos) e, para cada seção, ações granulares.
// O grid renderizado e o storage em JSONB usam estes schemas como fonte da verdade.

export type Department = 'ti' | 'marketing' | 'rh' | 'qualidade' | 'financeiro' | 'comercial' | 'educacional';

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
  /** Departamentos com fila de chamados usam restrições de visibilidade. */
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

/** Ações granulares de fila de chamados (antes só existiam no módulo de TI). */
const TICKET_ACTIONS = [
  { key: 'view_all', label: 'Ver todos os chamados' },
  { key: 'view_own', label: 'Ver os próprios' },
  { key: 'create', label: 'Criar' },
  { key: 'edit_own', label: 'Editar os próprios' },
  { key: 'edit_any', label: 'Editar de qualquer um' },
  { key: 'assign', label: 'Atribuir' },
  { key: 'transfer', label: 'Transferir' },
  { key: 'change_priority', label: 'Alterar prioridade' },
  { key: 'change_due_date', label: 'Alterar prazo' },
  { key: 'internal_notes', label: 'Notas internas' },
  { key: 'close', label: 'Fechar' },
  { key: 'reopen', label: 'Reabrir' },
  { key: 'delete', label: 'Excluir', sensitive: true },
];

const REPORT_ACTIONS = [
  { key: 'view', label: 'Visualizar' },
  { key: 'export', label: 'Exportar' },
  { key: 'view_team_metrics', label: 'Ver métricas da equipe' },
];

const CONFIG_SECTIONS: ModuleSchema[] = [
  { key: 'forms', label: 'Formulários', actions: CRUD },
  { key: 'sla', label: 'SLA', actions: [
    { key: 'view', label: 'Visualizar' },
    { key: 'edit_policies', label: 'Editar políticas' },
    { key: 'edit_alerts', label: 'Editar alertas' },
  ]},
  { key: 'checklists', label: 'Checklists', actions: [
    ...CRUD,
    { key: 'bind_categories', label: 'Vincular a categorias' },
  ]},
  { key: 'categories', label: 'Categorias', actions: CRUD },
  { key: 'profiles', label: 'Perfis de acesso', actions: [
    ...CRUD,
    { key: 'assign_users', label: 'Atribuir a usuários', sensitive: true },
  ]},
];

export const DEPARTMENT_SCHEMAS: Record<Department, DepartmentSchema> = {
  ti: {
    department: 'ti',
    label: 'TI',
    hasTicketRestrictions: true,
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
    hasTicketRestrictions: true,
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
    hasTicketRestrictions: true,
    modules: [
      { key: 'tickets', label: 'Chamados RH', actions: TICKET_ACTIONS },
      { key: 'employees', label: 'Colaboradores', actions: [
        ...CRUD,
        { key: 'view_salary', label: 'Ver salário', sensitive: true },
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'payroll', label: 'Folha', actions: [
        ...CRUD,
        { key: 'run', label: 'Gerar folha', sensitive: true },
      ]},
      { key: 'benefits', label: 'Benefícios', actions: CRUD },
      { key: 'vacations', label: 'Férias e Folgas', actions: [
        ...CRUD,
        { key: 'approve', label: 'Aprovar/Reprovar' },
      ]},
      { key: 'certificates', label: 'Atestados', actions: [
        ...CRUD,
        { key: 'approve', label: 'Aprovar/Reprovar' },
      ]},
      { key: 'payslips', label: 'Holerites', actions: [
        ...CRUD,
        { key: 'upload', label: 'Enviar para colaborador' },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  qualidade: {
    department: 'qualidade',
    label: 'Qualidade',
    hasTicketRestrictions: true,
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
      { key: 'purchases', label: 'Solicitações de Compra', actions: [
        { key: 'view', label: 'Visualizar solicitações' },
        { key: 'approve', label: 'Aprovar / reprovar compra', sensitive: true },
        { key: 'execute', label: 'Executar compra e registrar laudo', sensitive: true },
        { key: 'manage_products', label: 'Gerenciar catálogo de produtos' },
        { key: 'manage_budget', label: 'Definir teto de gasto por setor', sensitive: true },
      ]},
      { key: 'tickets', label: 'Chamados do Financeiro', actions: [...TICKET_ACTIONS] },
      { key: 'cashflow', label: 'Fluxo de Caixa', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'export', label: 'Exportar' },
      ]},
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      { key: 'imports', label: 'Histórico de importações', actions: [
        { key: 'view', label: 'Visualizar' },
        { key: 'delete', label: 'Remover importação', sensitive: true },
      ]},
      { key: 'categories', label: 'Categorias e formulários', actions: CRUD },
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
  comercial: {
    department: 'comercial',
    label: 'Comercial',
    hasTicketRestrictions: true,
    modules: [
      { key: 'tickets', label: 'Chamados Comercial', actions: TICKET_ACTIONS },
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
  educacional: {
    department: 'educacional',
    label: 'Educacional',
    hasTicketRestrictions: true,
    modules: [
      { key: 'tickets', label: 'Chamados Educacional', actions: TICKET_ACTIONS },
      { key: 'dashboard', label: 'Painel', actions: [{ key: 'view', label: 'Visualizar' }] },
      ...CONFIG_SECTIONS,
      { key: 'reports', label: 'Indicadores', actions: REPORT_ACTIONS },
    ],
  },
};

export const DEPARTMENT_LIST: Department[] = ['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional'];

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

  // 2. chamados no formato antigo (view/edit/close sem granularidade)
  const legacyTickets = saved.tickets as Record<string, boolean> | undefined;
  if (legacyTickets) {
    const t = out.tickets;
    if (typeof legacyTickets.view === 'boolean' && legacyTickets.view) {
      t.view_all = true;
      t.view_own = true;
    }
    if (legacyTickets.edit) {
      t.edit_own = true;
      t.edit_any = true;
      if (typeof legacyTickets.change_priority !== 'boolean') t.change_priority = true;
      if (typeof legacyTickets.change_due_date !== 'boolean') t.change_due_date = true;
    }
    if (legacyTickets.assign && typeof legacyTickets.transfer !== 'boolean') t.transfer = true;
    if (legacyTickets.close && typeof legacyTickets.reopen !== 'boolean') t.reopen = true;
  }

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

// Lê uma permissão considerando perfil + overrides do usuário.
export function resolvePermission(
  perms: PermissionsMap | null | undefined,
  overrides: PermissionsMap | null | undefined,
  moduleKey: string,
  actionKey: string
): boolean {
  if (overrides?.[moduleKey]?.[actionKey] !== undefined) return !!overrides[moduleKey][actionKey];
  return !!perms?.[moduleKey]?.[actionKey];
}
