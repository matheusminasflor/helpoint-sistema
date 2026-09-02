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
  open: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  waiting_user: 'bg-violet-400',
  waiting_parts: 'bg-orange-400',
  resolved: 'bg-emerald-400',
  closed: 'bg-slate-500',
  cancelled: 'bg-red-400',
};

export function TerminalTicketRow({ ticket, isSelected, onSelect }: TerminalTicketRowProps) {
  const sla = getSLATimeRemaining(ticket.sla_due_at, ticket);
  const dot = statusDot[ticket.status] || 'bg-slate-500';

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 h-8 px-4 cursor-pointer transition-colors font-mono text-[11px]",
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
        sla.isOverdue ? "text-red-400 font-bold" : "text-muted-foreground/60"
      )}>
        {sla.isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
        {sla.label.replace(' restantes', '').replace(' atrasado', '')}
      </div>
    </div>
  );
}