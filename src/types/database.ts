// HELPOINT Database Types

export type AppRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  granted_by: string | null;
  granted_at: string;
}

export interface Task {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: 1 | 2 | 3 | 4 | 5;
  status: TaskStatus;
  due_date: string | null;
  source_type: string | null;
  source_id: string | null;
  is_ai_suggested: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Extended types with relations
export interface ProfileWithRole extends Profile {
  role: AppRole;
}

export interface TaskWithPriority extends Task {
  priorityLabel: 'Crítico' | 'Alto' | 'Médio' | 'Baixo' | 'Nenhum';
  statusLabel: 'Pendente' | 'Em Progresso' | 'Concluído' | 'Cancelado';
}

// Helper functions
export const getPriorityLabel = (priority: number): string => {
  const labels: Record<number, string> = {
    1: 'Crítico',
    2: 'Alto',
    3: 'Médio',
    4: 'Baixo',
    5: 'Nenhum',
  };
  return labels[priority] || 'Médio';
};

export const getStatusLabel = (status: TaskStatus): string => {
  const labels: Record<TaskStatus, string> = {
    pending: 'Pendente',
    in_progress: 'Em Progresso',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };
  return labels[status];
};

export const getRoleLabel = (role: AppRole): string => {
  const labels: Record<AppRole, string> = {
    owner: 'Proprietário',
    admin: 'Administrador',
    manager: 'Gerente',
    member: 'Membro',
    viewer: 'Visualizador',
  };
  return labels[role];
};

export const getRoleDescription = (role: AppRole): string => {
  const descriptions: Record<AppRole, string> = {
    owner: 'Proprietário da conta com controle total',
    admin: 'Pode gerenciar todos os usuários e configurações',
    manager: 'Pode gerenciar equipes e módulos que tem acesso',
    member: 'Acesso operacional aos módulos liberados',
    viewer: 'Apenas visualização, sem edição',
  };
  return descriptions[role];
};

// Plan configuration interface
export interface PlanConfig {
  plan: 'free' | 'starter' | 'enterprise' | 'custom';
  trial_ends_at: string | null;
  max_users: number;
  available_modules: string[];
  features: {
    lyra_advanced: boolean;
    advanced_reports: boolean;
    export_data: boolean;
  };
}

// Module access types
export const ALL_MODULES = [
  'ti',
  'crm',
  'comercial',
  'marketing',
  'rh',
  'financeiro',
  'producao',
  'expedicao',
  'educacional',
  'qualidade',
] as const;

export type ModuleId = typeof ALL_MODULES[number];

export const MODULE_LABELS: Record<ModuleId, string> = {
  ti: 'TI (Helpdesk, Inventário, Rede...)',
  crm: 'CRM (Funil, Contatos, Pedidos)',
  comercial: 'Comercial (Chamados)',
  marketing: 'Marketing (Campanhas, Métricas)',
  rh: 'RH (Gestão de Pessoas)',
  financeiro: 'Financeiro',
  producao: 'Produção',
  expedicao: 'Expedição',
  educacional: 'Educacional',
  qualidade: 'Qualidade',
};
