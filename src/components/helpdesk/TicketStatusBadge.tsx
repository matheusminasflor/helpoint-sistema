import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

interface TicketStatusBadgeProps {
  status: TicketStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
}

export function TicketStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
}: TicketStatusBadgeProps) {
  const config = getTicketStatusMeta(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border border-transparent',
        config.badgeClass,
        sizeClasses[size],
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} aria-hidden="true" />}
      {showLabel ? <span>{config.label}</span> : <span className="sr-only">{config.label}</span>}
    </span>
  );
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
