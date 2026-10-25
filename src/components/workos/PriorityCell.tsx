import { cn } from '@/lib/utils';
import type { TicketPriority } from '@/types/helpdesk';

// Cor só onde pede atenção (etapa 4 · Chamados, 2026-10-24): Crítica em vermelho, Alta em âmbar, Média e Baixa
// neutras. Antes Média e Alta tinham a mesma cor, e na cara nova a Alta ficou mais apagada que a Média.
const priorityConfig: Record<TicketPriority, { label: string; bg: string }> = {
  critical: { label: 'Crítico', bg: 'badge-danger' },
  high: { label: 'Alta', bg: 'badge-warning' },
  medium: { label: 'Média', bg: 'badge-neutral' },
  low: { label: 'Baixa', bg: 'badge-neutral' },
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
      size === 'sm' && 'py-0.5 text-[12px] min-w-[50px]'
    )}>
      {config.label}
    </div>
  );
}
