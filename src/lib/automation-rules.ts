import type { Database } from '@/integrations/supabase/types';

// Tipos e rótulos moram aqui, e não no hook, para este módulo continuar
// puro: o teste Vitest o importa, e importar o hook arrastaria o cliente
// Supabase — que exige VITE_SUPABASE_URL e não existe no CI.

export type AutomationModule = 'tickets' | 'marketing' | 'qualidade' | 'rh' | 'financeiro';
export type TriggerKind = 'ticket_created' | 'ticket_status_changed' | 'ticket_deadline_expired' | 'schedule';
export type ActionKind = 'notify' | 'create_ticket' | 'create_task' | 'assign' | 'set_priority';

export type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  ticket_created: 'um chamado é aberto',
  ticket_status_changed: 'um chamado muda de status',
  ticket_deadline_expired: 'o prazo de um chamado estoura',
  schedule: 'chega o dia e a hora marcados',
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  notify: 'avisar',
  create_ticket: 'abrir um chamado',
  create_task: 'criar uma tarefa',
  assign: 'atribuir o chamado a alguém',
  set_priority: 'mudar a prioridade',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  waiting_parts: 'Aguardando peça',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
  rejected: 'Reprovado',
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const TEAM_LABELS: Record<string, string> = {
  ti: 'Equipe de TI',
  marketing: 'Equipe de Marketing',
  rh: 'Equipe de RH',
  qualidade: 'Equipe de Qualidade',
  financeiro: 'Equipe do Financeiro',
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
  7: 'domingo',
};

export const MODULE_TARGET_LABELS: Record<AutomationModule, string> = {
  tickets: 'TI',
  marketing: 'Marketing',
  rh: 'RH',
  qualidade: 'Qualidade',
  financeiro: 'Financeiro',
};

export interface RulePersonRef {
  id: string;
  name: string;
}

export interface RuleCategoryRef {
  id: string;
  name: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function describeTrigger(
  kind: string,
  config: Record<string, unknown>,
  categories: RuleCategoryRef[],
): string {
  if (kind === 'schedule') {
    const time = typeof config.time === 'string' ? config.time : '--:--';
    const weekday = Number(config.weekday);
    const every =
      config.every === 'week'
        ? `toda ${WEEKDAY_LABELS[weekday] ?? '?'}`
        : 'todo dia';
    return `${every} às ${time}`;
  }

  let base = TRIGGER_LABELS[kind as keyof typeof TRIGGER_LABELS] ?? kind;

  if (kind === 'ticket_status_changed' && typeof config.status === 'string') {
    const statusLabel = STATUS_LABELS[config.status] ?? config.status;
    base = `um chamado muda para "${statusLabel}"`;
  }

  const categoryId = typeof config.category_id === 'string' ? config.category_id : undefined;
  if (categoryId) {
    const category = categories.find((c) => c.id === categoryId);
    if (category) {
      base = base.replace('um chamado', `um chamado da categoria ${category.name}`);
    }
  }

  const priority = typeof config.priority === 'string' ? config.priority : undefined;
  if (priority) {
    const priorityLabel = PRIORITY_LABELS[priority] ?? priority;
    base = `${base} (prioridade ${priorityLabel})`;
  }

  return base;
}

function describeAction(
  kind: string,
  config: Record<string, unknown>,
  people: RulePersonRef[],
): string {
  switch (kind) {
    case 'notify': {
      if (typeof config.user_id === 'string') {
        const person = people.find((p) => p.id === config.user_id);
        return `avisar ${person?.name ?? 'a pessoa selecionada'}`;
      }
      if (typeof config.team_module === 'string') {
        const teamLabel = TEAM_LABELS[config.team_module] ?? config.team_module;
        return `avisar ${teamLabel}`;
      }
      return ACTION_LABELS.notify;
    }
    case 'create_ticket':
      return ACTION_LABELS.create_ticket;
    case 'create_task':
      return ACTION_LABELS.create_task;
    case 'assign': {
      const userId = typeof config.user_id === 'string' ? config.user_id : undefined;
      const person = people.find((p) => p.id === userId);
      return `atribuir o chamado a ${person?.name ?? 'alguém'}`;
    }
    case 'set_priority': {
      const priority = typeof config.priority === 'string' ? config.priority : undefined;
      const priorityLabel = priority ? PRIORITY_LABELS[priority] ?? priority : '?';
      return `mudar a prioridade para ${priorityLabel}`;
    }
    default:
      return ACTION_LABELS[kind as keyof typeof ACTION_LABELS] ?? kind;
  }
}

/**
 * Monta as frases "quando ... / então ..." em português para uma regra de
 * automação — usada tanto na lista (resumo de cada regra) quanto em telas
 * futuras que precisem descrever a regra sem repetir esta lógica.
 */
export function describeRule(
  rule: AutomationRule,
  people: RulePersonRef[],
  categories: RuleCategoryRef[],
): { quando: string; entao: string } {
  const triggerConfig = asRecord(rule.trigger_config);
  const actionConfig = asRecord(rule.action_config);

  return {
    quando: describeTrigger(rule.trigger_kind, triggerConfig, categories),
    entao: describeAction(rule.action_kind, actionConfig, people),
  };
}
