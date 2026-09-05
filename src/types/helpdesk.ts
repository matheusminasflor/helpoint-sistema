// HELPOINT Helpdesk Types

export type AssetStatus = 'active' | 'inactive' | 'maintenance' | 'decommissioned' | 'in_use' | 'in_stock';
export type AssetCategory = 'hardware' | 'software' | 'network' | 'peripheral' | 'mobile' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'waiting_parts' | 'resolved' | 'closed' | 'cancelled' | 'rejected';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Asset {
  id: string;
  tenant_id: string;
  asset_tag: string;
  serial_number: string | null;
  name: string;
  description: string | null;
  category: AssetCategory;
  subcategory: string | null;
  manufacturer: string | null;
  model: string | null;
  assigned_to: string | null;
  department: string | null;
  location: string | null;
  specs: Record<string, unknown>;
  status: AssetStatus;
  purchase_date: string | null;
  warranty_expiry: string | null;
  purchase_value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  ticket_number: number;
  title: string;
  description: string;
  category_id: string | null;
  category: string | null;
  subcategory: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  requester_id: string;
  assigned_to: string | null;
  asset_id: string | null;
  due_date: string | null;
  sla_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
  satisfaction_rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface SLAPolicy {
  id: string;
  tenant_id: string;
  name: string;
  priority: TicketPriority;
  first_response_time: number;
  resolution_time: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketMention {
  id: string;
  tenant_id: string;
  ticket_id: string;
  mentioned_user_id: string;
  mentioned_by: string;
  message: string | null;
  created_at: string;
}

// Extended types with relations
export interface TicketWithDetails extends Ticket {
  requester?: {
    id: string;
    full_name: string | null;
    email: string;
    department: string | null;
  };
  assignee?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  asset?: Asset | null;
}

// Helper functions
export const getTicketStatusLabel = (status: TicketStatus): string => {
  const labels: Record<TicketStatus, string> = {
    open: 'Aberto',
    in_progress: 'Em Andamento',
    waiting_user: 'Aguardando Retorno do Usuário',
    waiting_parts: 'Pendente',
    resolved: 'Resolvido',
    closed: 'Fechado',
    cancelled: 'Cancelado',
    rejected: 'Reprovado',
  };
  return labels[status];
};

export const getTicketPriorityLabel = (priority: TicketPriority): string => {
  const labels: Record<TicketPriority, string> = {
    critical: 'Crítico',
    high: 'Alto',
    medium: 'Médio',
    low: 'Baixo',
  };
  return labels[priority];
};

export const getAssetCategoryLabel = (category: AssetCategory): string => {
  const labels: Record<AssetCategory, string> = {
    hardware: 'Hardware',
    software: 'Software',
    network: 'Rede',
    peripheral: 'Periférico',
    mobile: 'Dispositivo Móvel',
    other: 'Outro',
  };
  return labels[category];
};

export const getAssetStatusLabel = (status: AssetStatus): string => {
  const labels: Record<AssetStatus, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    maintenance: 'Em Manutenção',
    decommissioned: 'Descontinuado',
    in_use: 'Em uso',
    in_stock: 'Em estoque',
  };
  return labels[status];
};

// SLA calculation helpers
export interface SLATimeRemaining {
  /** Texto completo, ex.: "2h restantes" / "2h em atraso" */
  label: string;
  /** Apenas a magnitude, ex.: "2h" — nunca use sozinho na UI */
  value: string;
  isOverdue: boolean;
  hasSLA: boolean;
  /**
   * Quanto da janela do SLA já foi consumido: 0 no minuto em que o chamado
   * abriu, 100 quando o prazo venceu. Cresce conforme o prazo aperta — é o
   * sentido que "80% do SLA consumido" tem, e o que `AISecretarySummary` usa
   * para contar "SLA em risco". Sem significado quando `isFrozen`.
   */
  percentage: number;
  /** true quando o relógio do SLA já parou (resolvido/fechado/cancelado) */
  isFrozen: boolean;
}

/** Estados em que o relógio do SLA já parou de correr. */
export const SLA_STOPPED_STATUSES = ['resolved', 'closed', 'cancelled', 'rejected'] as const;

export const isSLAStopped = (status?: string | null): boolean =>
  !!status && (SLA_STOPPED_STATUSES as readonly string[]).includes(status);

interface SLAContext {
  status?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  /** Início do relógio do SLA. Sem ele não há janela para medir o consumo. */
  created_at?: string | null;
}

/**
 * Fração da janela do SLA já gasta, de 0 a 100.
 *
 * ponytail: sem `created_at` não existe janela, e o melhor palpite é a última
 * hora. O teto é esse; a saída é passar o chamado inteiro na chamada, como os
 * sete chamadores já fazem.
 */
const slaConsumedPercentage = (createdAt: string | null | undefined, due: Date, now: Date): number => {
  const start = createdAt ? new Date(createdAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return due.getTime() - now.getTime() <= 3600_000 ? 100 : 0;
  }
  const window = due.getTime() - start.getTime();
  if (window <= 0) return 100;
  return Math.min(Math.max(((now.getTime() - start.getTime()) / window) * 100, 0), 100);
};

/**
 * Calcula o SLA. Se o chamado já foi resolvido/fechado/cancelado, o relógio PARA:
 * o cumprimento é medido comparando resolved_at (marco final) com sla_due_at.
 * O tempo aguardando avaliação nunca conta como atraso.
 */
export const getSLATimeRemaining = (
  slaDueAt: string | null,
  ticket?: SLAContext | null,
): SLATimeRemaining => {
  if (!slaDueAt) return { label: 'Sem SLA', value: 'Sem SLA', isOverdue: false, hasSLA: false, percentage: 0, isFrozen: false };

  const due = new Date(slaDueAt);
  const stopped = isSLAStopped(ticket?.status);

  if (stopped) {
    if (ticket?.status === 'cancelled' || ticket?.status === 'rejected') {
      return { label: 'SLA encerrado', value: '—', isOverdue: false, hasSLA: true, percentage: 0, isFrozen: true };
    }
    const marker = ticket?.resolved_at ? new Date(ticket.resolved_at) : null;
    if (!marker || Number.isNaN(marker.getTime())) {
      return { label: 'SLA encerrado', value: '—', isOverdue: false, hasSLA: true, percentage: 0, isFrozen: true };
    }
    const lateMs = marker.getTime() - due.getTime();
    if (lateMs > 0) {
      const mins = Math.floor(lateMs / 60000);
      const value = mins < 60 ? `${mins}min` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
      return { label: `Resolvido ${value} após o prazo`, value, isOverdue: true, hasSLA: true, percentage: 100, isFrozen: true };
    }
    return { label: 'Resolvido no prazo', value: 'No prazo', isOverdue: false, hasSLA: true, percentage: 0, isFrozen: true };
  }

  const now = new Date();
  const diff = due.getTime() - now.getTime();

  if (diff < 0) {
    const overdueMins = Math.abs(Math.floor(diff / 60000));
    const value = overdueMins < 60 ? `${overdueMins}min` : `${Math.floor(overdueMins / 60)}h`;
    return { label: `${value} em atraso`, value, isOverdue: true, hasSLA: true, percentage: 100, isFrozen: false };
  }


  const percentage = slaConsumedPercentage(ticket?.created_at, due, now);
  const remainingMins = Math.floor(diff / 60000);
  if (remainingMins < 60) {
    const value = `${remainingMins}min`;
    return { label: `${value} restantes`, value, isOverdue: false, hasSLA: true, percentage, isFrozen: false };
  }
  if (remainingMins < 1440) {
    const value = `${Math.floor(remainingMins / 60)}h`;
    return { label: `${value} restantes`, value, isOverdue: false, hasSLA: true, percentage, isFrozen: false };
  }
  const value = `${Math.floor(remainingMins / 1440)}d`;
  return { label: `${value} restantes`, value, isOverdue: false, hasSLA: true, percentage, isFrozen: false };
};

