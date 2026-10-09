import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

interface StatusCellProps {
  status: TicketStatus;
  /** Compras tem nomes próprios ("Aguardando aprovação"…). */
  module?: string | null;
  size?: 'sm' | 'md';
}

export function StatusCell({ status, module, size = 'md' }: StatusCellProps) {
  const config = getTicketStatusMeta(status, module);
  
  return (
    <div className={cn(
      "workos-status-cell",
      config.badgeClass,

      size === 'sm' && 'py-0.5 text-[12px] min-w-[70px]'
    )}>
      {config.label}
    </div>
  );
}
