import { cn } from '@/lib/utils';
import type { TicketPriority } from '@/types/helpdesk';

const priorityConfig: Record<TicketPriority, { label: string; bg: string }> = {
  critical: { label: 'Crítico', bg: 'badge-danger' },
  high: { label: 'Alta', bg: 'badge-orange' },
  medium: { label: 'Média', bg: 'badge-warning' },
  low: { label: 'Baixa', bg: 'badge-success' },
};

interface PriorityCellProps {
  priority: TicketPriority;
  size?: 'sm' | 'md';
}

export function PriorityCell({ priority, size = 'md' }: PriorityCellProps) {
  const config = priorityConfig[priority];
  
  return (
    <div className={cn(
      "workos-priority-cell",
      config.bg,
      size === 'sm' && 'py-0.5 text-[11px] min-w-[50px]'
    )}>
      {config.label}
    </div>
  );
}
