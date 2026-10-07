import { cn } from '@/lib/utils';
import { getSLATimeRemaining } from '@/types/helpdesk';
import { AlertTriangle } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface TerminalTicketRowProps {
  ticket: TicketWithDetails;
  isSelected: boolean;
  onSelect: () => void;
}

const statusDot: Record<string, string> = {
  open: 'bg-status-info',
  in_progress: 'bg-status-warning',
  waiting_user: 'bg-primary',
  waiting_parts: 'bg-status-warning',
  scheduled: 'bg-primary',
  resolved: 'bg-status-success',
  closed: 'bg-muted',
  cancelled: 'bg-status-danger',
};

export function TerminalTicketRow({ ticket, isSelected, onSelect }: TerminalTicketRowProps) {
  const sla = getSLATimeRemaining(ticket.sla_due_at, ticket);
  const dot = statusDot[ticket.status] || 'bg-muted';

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 h-8 px-4 cursor-pointer transition-colors font-mono text-[12px]",
        "border-l-2 border-l-transparent border-b border-b-border-subtle",
        "hover:bg-surface-2 hover:border-l-primary",
        isSelected && "bg-primary/[0.06] border-l-primary"
      )}
    >
      {/* Status dot */}
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />

      {/* ID */}
      <span className="text-primary font-bold w-14 shrink-0">#{ticket.ticket_number}</span>

      {/* Title */}
      <span className="flex-1 truncate text-foreground/70">{ticket.title}</span>

      {/* Assignee */}
      <span className="text-muted-foreground/50 w-20 truncate text-right shrink-0">
        {ticket.assignee?.full_name?.split(' ')[0] || '—'}
      </span>

      {/* SLA */}
      <div className={cn(
        "w-16 text-right shrink-0",
        sla.isOverdue ? "text-status-danger font-bold" : "text-muted-foreground/60"
      )}>
        {sla.isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
        {sla.label.replace(' restantes', '').replace(' atrasado', '')}
      </div>
    </div>
  );
}