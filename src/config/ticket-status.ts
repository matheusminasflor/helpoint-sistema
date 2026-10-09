import {
  Clock,
  Play,
  Package,
  CheckCircle2,
  XCircle,
  ThumbsDown,
  CalendarClock,
} from 'lucide-react';
import type { TicketStatus } from '@/types/helpdesk';

export interface TicketStatusMeta {
  label: string;
  icon: React.ElementType;
  /** Classe de badge (par claro/escuro com AA garantido) */
  badgeClass: string;
  /** Classe do ponto compacto — MESMO matiz do badge */
  dotClass: string;
}

/**
 * Fonte única de verdade para status de chamado: rótulo, ícone e cor.
 * Badge e ponto compartilham o mesmo matiz, então a leitura visual é idêntica.
 */
export const TICKET_STATUS_META: Record<TicketStatus, TicketStatusMeta> = {
  open: {
    label: 'Aberto',
    icon: Clock,
    badgeClass: 'badge-info',
    dotClass: 'status-dot-info',
  },
  in_progress: {
    label: 'Em andamento',
    icon: Play,
    badgeClass: 'badge-warning',
    dotClass: 'status-dot-warning',
  },
  // Um "Pendente" só (dono, 2026-10-04: Aberto, Em andamento, Pendente, Resolvido). Os dois valores
  // continuam no banco; os menus só oferecem `waiting_user`, e os dois aparecem iguais.
  waiting_user: {
    label: 'Pendente',
    icon: Package,
    badgeClass: 'badge-orange',
    dotClass: 'status-dot-orange',
  },
  waiting_parts: {
    label: 'Pendente',
    icon: Package,
    badgeClass: 'badge-orange',
    dotClass: 'status-dot-orange',
  },
  // Agendado (dono, 2026-10-07): quem atende marcou quando vai tratar; o prazo pausa até lá.
  scheduled: {
    label: 'Agendado',
    icon: CalendarClock,
    badgeClass: 'badge-purple',
    dotClass: 'status-dot-purple',
  },
  resolved: {
    label: 'Resolvido',
    icon: CheckCircle2,
    badgeClass: 'badge-success',
    dotClass: 'status-dot-success',
  },
  // Não existe mais "Fechado" (dono, 2026-10-04: "está resolvido, está resolvido"). O `closed`
  // que sobrar no banco aparece igual ao Resolvido — ver `@/lib/status-do-chamado`.
  closed: {
    label: 'Resolvido',
    icon: CheckCircle2,
    badgeClass: 'badge-success',
    dotClass: 'status-dot-success',
  },
  cancelled: {
    label: 'Cancelado',
    icon: XCircle,
    badgeClass: 'badge-danger',
    dotClass: 'status-dot-danger',
  },
  rejected: {
    label: 'Reprovado',
    icon: ThumbsDown,
    badgeClass: 'badge-danger',
    dotClass: 'status-dot-danger',
  },
};

/**
 * Compras fala a língua do pedido (dono, 2026-10-09): o chamado segue a compra no banco
 * (`compras_chamado_segue_a_compra`, 20261221010000) e os mesmos status têm outro nome lá.
 */
const ROTULO_EM_COMPRAS: Partial<Record<TicketStatus, string>> = {
  waiting_parts: 'Aguardando aprovação',
  waiting_user: 'Aguardando quem pediu',
  in_progress: 'Aprovada · aguardando compra',
  rejected: 'Reprovada',
};

export function getTicketStatusMeta(status: TicketStatus, module?: string | null): TicketStatusMeta {
  const meta = TICKET_STATUS_META[status] ?? TICKET_STATUS_META.open;
  const rotulo = module === 'compras' ? ROTULO_EM_COMPRAS[status] : undefined;
  return rotulo ? { ...meta, label: rotulo } : meta;
}
