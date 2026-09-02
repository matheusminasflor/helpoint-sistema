import { useState, useMemo, ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, AlertTriangle, type LucideIcon } from 'lucide-react';
import { getSLATimeRemaining } from '@/types/helpdesk';
import type { TicketWithDetails } from '@/types/helpdesk';

interface WorkOSGroupProps {
  title: string;
  /** Real SVG icon (lucide) — emojis are not used as icons */
  icon: LucideIcon;
  accentColor: string;
  tickets: TicketWithDetails[];
  defaultOpen?: boolean;
  children: ReactNode;
}

export function WorkOSGroup({ 
  title, 
  icon: Icon, 
  accentColor, 
  tickets, 
  defaultOpen = true,
  children 
}: WorkOSGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  
  const stats = useMemo(() => ({
    total: tickets.length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
    slaViolated: tickets.filter(t => (() => { const s = getSLATimeRemaining(t.sla_due_at, t); return s.isOverdue && !s.isFrozen; })()).length,
    unassigned: tickets.filter(t => !t.assigned_to).length,
  }), [tickets]);

  const progressPercentage = stats.total > 0 
    ? Math.round((stats.resolved / stats.total) * 100) 
    : 0;

  const isEmpty = stats.total === 0;
  
  const chip = isEmpty ? 'bg-muted-foreground/10 text-muted-foreground' : 'bg-primary/10 text-primary';

  return (
    <div className="mb-0.5">
      <button 
        type="button"
        onClick={() => !isEmpty && setIsOpen(!isOpen)}
        aria-expanded={isEmpty ? false : isOpen}
        aria-controls={panelId}
        className={cn(
          "workos-group-header w-full text-left border-l-[6px] rounded-t-lg bg-card",
          isEmpty ? "text-muted-foreground border-l-border cursor-default" : "text-foreground",
          !isEmpty && accentColor
        )}
      >
        <ChevronRight className={cn(
          "w-4 h-4 transition-transform duration-200",
          isOpen && !isEmpty && "rotate-90",
          isEmpty && "opacity-40"
        )} aria-hidden="true" />
        
        <Icon className="w-4 h-4" aria-hidden="true" />
        
        <span className="font-bold text-sm">{title}</span>
        
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold font-mono", chip)}>
          {stats.total}
        </span>

        {isEmpty && <span className="text-xs font-normal">Nenhum chamado</span>}
        
        {stats.slaViolated > 0 && (
          <span className="text-xs gap-1 py-0.5 px-2 rounded-full badge-danger flex items-center font-semibold">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span className="font-mono">{stats.slaViolated}</span> SLA
          </span>
        )}

        {stats.unassigned > 0 && (
          <span className="text-xs py-0.5 px-2 rounded-full font-medium bg-muted text-muted-foreground">
            {stats.unassigned} sem atribuição
          </span>
        )}
        
        {/* Progresso: resolvidos / total (mesma métrica no número e na barra) */}
        {!isEmpty && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs font-normal text-muted-foreground">
              <span className="font-mono">{stats.resolved}/{stats.total}</span> resolvidos
            </span>
            <span
              className="block w-16 h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Resolvidos no grupo ${title}`}
            >
              <span
                className="block h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </span>
          </span>
        )}
      </button>
      
      {isOpen && !isEmpty && (
        <div id={panelId}>
          {children}
        </div>
      )}
    </div>
  );
}
