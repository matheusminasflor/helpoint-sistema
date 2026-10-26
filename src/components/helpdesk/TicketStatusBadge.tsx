import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

interface TicketStatusBadgeProps {
  status: TicketStatus;
  /** O módulo do chamado: Compras tem nomes próprios ("Aguardando aprovação"…). */
  module?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Sem efeito desde a rodada 3: o ponto da pílula faz o papel do ícone. */
  showIcon?: boolean;
  showLabel?: boolean;
}

export function TicketStatusBadge({
  status,
  module,
  size = 'md',
  showLabel = true,
}: TicketStatusBadgeProps) {
  const config = getTicketStatusMeta(status, module);

  const sizeClasses = { sm: 'text-[12px]', md: 'text-[12.5px]', lg: 'text-[14px] px-3 py-1' };

  // Rodada 3: a pílula do estado — fundo suave, texto forte e o ponto (`.estado` no index.css). O ponto faz o papel
  // do ícone; `showIcon` fica na interface para quem já o passa. Sem a palavra, sobra só o ponto (com o nome lido).
  if (!showLabel) {
    return (
      <span className={cn('estado px-1.5', `estado-${config.familia}`)} role="img" aria-label={config.label} title={config.label} />
    );
  }
  return <span className={cn('estado', `estado-${config.familia}`, sizeClasses[size])}>{config.label}</span>;
}

// Indicador compacto para listas — mesma cor e mesmo rótulo do badge
export function TicketStatusDot({ status }: { status: TicketStatus }) {
  const config = getTicketStatusMeta(status);

  return (
    <span
      className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', config.dotClass)}
      role="img"
      aria-label={`Status: ${config.label}`}
      title={config.label}
    />
  );
}
