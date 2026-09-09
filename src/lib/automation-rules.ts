import {
  ACTION_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TEAM_LABELS,
  TRIGGER_LABELS,
  WEEKDAY_LABELS,
  type AutomationRule,
} from '@/hooks/useAutomationRules';

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
