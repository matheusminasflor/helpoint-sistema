import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

interface StatusCellProps {
  status: TicketStatus;
  size?: 'sm' | 'md';
}

export function StatusCell({ status, size = 'md' }: StatusCellProps) {
  const config = getTicketStatusMeta(status);
  
  return (
    <div className={cn(
      "workos-status-cell",
      config.badgeClass,

      size === 'sm' && 'py-0.5 text-[11px] min-w-[70px]'
    )}>
      {config.label}
    </div>
  );
}
