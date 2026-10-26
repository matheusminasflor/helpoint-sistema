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

/**
 * A família de cor do ESTADO (rodada 3, docs/proposta-rodada-3.md): cinco, as mesmas em chamado, pedido, compra e
 * indicador. "Atrasado" não é status gravado — quem calcula o prazo usa `estado-atraso` por cima do status.
 */
export type FamiliaDoEstado = 'recebido' | 'setor' | 'espera' | 'atraso' | 'concluido';

export interface TicketStatusMeta {
  label: string;
  icon: React.ElementType;
  /** A família de cor do estado. */
  familia: FamiliaDoEstado;
  /** Classe de badge (par claro/escuro com AA garantido) — painéis e selos antigos. */
  badgeClass: string;
  /** Classe do ponto compacto — MESMO matiz do badge */
  dotClass: string;
}

const BADGE_DA_FAMILIA: Record<FamiliaDoEstado, { badgeClass: string; dotClass: string }> = {
  recebido: { badgeClass: 'badge-neutral', dotClass: 'status-dot-neutral' },
  setor: { badgeClass: 'badge-info', dotClass: 'status-dot-info' },
  espera: { badgeClass: 'badge-warning', dotClass: 'status-dot-warning' },
  atraso: { badgeClass: 'badge-danger', dotClass: 'status-dot-danger' },
  concluido: { badgeClass: 'badge-success', dotClass: 'status-dot-success' },
};

const meta = (label: string, icon: React.ElementType, familia: FamiliaDoEstado): TicketStatusMeta =>
  ({ label, icon, familia, ...BADGE_DA_FAMILIA[familia] });

/**
 * Fonte única de verdade para status de chamado: rótulo, ícone e cor.
 * Badge e ponto compartilham o mesmo matiz, então a leitura visual é idêntica.
 */
export const TICKET_STATUS_META: Record<TicketStatus, TicketStatusMeta> = {
  open: meta('Aberto', Clock, 'recebido'),
  in_progress: meta('Em andamento', Play, 'setor'),
  // Um "Pendente" só (dono, 2026-10-04: Aberto, Em andamento, Pendente, Resolvido). Os dois valores
  // continuam no banco; os menus só oferecem `waiting_user`, e os dois aparecem iguais.
  waiting_user: meta('Pendente', Package, 'espera'),
  waiting_parts: meta('Pendente', Package, 'espera'),
  // Agendado (dono, 2026-10-07): quem atende marcou quando vai tratar; o prazo pausa até lá — é espera.
  scheduled: meta('Agendado', CalendarClock, 'espera'),
  resolved: meta('Resolvido', CheckCircle2, 'concluido'),
  // Não existe mais "Fechado" (dono, 2026-10-04: "está resolvido, está resolvido"). O `closed`
  // que sobrar no banco aparece igual ao Resolvido — ver `@/lib/status-do-chamado`.
  closed: meta('Resolvido', CheckCircle2, 'concluido'),
  // Cancelado não pede ação de ninguém: cinza, não vermelho (vermelho é atraso).
  cancelled: meta('Cancelado', XCircle, 'recebido'),
  rejected: meta('Reprovado', ThumbsDown, 'atraso'),
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
