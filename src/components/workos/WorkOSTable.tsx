import { useMemo, useState, useEffect } from 'react';
import { WorkOSTableHeader } from './WorkOSTableHeader';
import { WorkOSGroup } from './WorkOSGroup';
import { WorkOSTableRow } from './WorkOSTableRow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Inbox, AlertOctagon, ArrowUp, Minus, ArrowDown, AlertTriangle, CalendarDays, CalendarRange, Archive, ChevronLeft, ChevronRight, Rows3, Rows4, Plus, FilterX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useIsBelow } from '@/hooks/use-mobile';
import { isToday, isThisWeek, isBefore } from 'date-fns';
import type { TicketWithDetails } from '@/types/helpdesk';

const PAGE_SIZE = 50;

interface WorkOSTableProps {
  tickets: TicketWithDetails[];
  isLoading?: boolean;
  selectedTicketId?: string | null;
  onSelectTicket: (ticket: TicketWithDetails) => void;
  onUpdate?: () => void;
  emptyMessage?: string;
  groupBy?: 'priority' | 'time' | 'none';
  simplified?: boolean;
  /** Há filtros aplicados? Muda a explicação e a ação do estado vazio. */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreate?: () => void;
  createLabel?: string;
}

export function WorkOSTable({ 
  tickets, 
  isLoading,
  selectedTicketId,
  onSelectTicket,
  onUpdate,
  emptyMessage = 'Nenhum chamado encontrado',
  groupBy = 'priority',
  simplified = false,
  hasActiveFilters = false,
  onClearFilters,
  onCreate,
  createLabel = 'Nova solicitação',
}: WorkOSTableProps) {
  const { density, toggleDensity, rowHeight } = useTableDensity();
  const isMobile = useIsBelow(768);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [tickets.length, groupBy]);

  // Paginação: no máximo 50 chamados renderizados por vez
  const pageTickets = useMemo(
    () => tickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [tickets, page],
  );

  const groupedTickets = useMemo(() => {
    if (groupBy === 'none') {
      return { all: pageTickets } as Record<string, TicketWithDetails[]>;
    }

    if (groupBy === 'priority') {
      return {
        critical: pageTickets.filter(t => t.priority === 'critical'),
        high: pageTickets.filter(t => t.priority === 'high'),
        medium: pageTickets.filter(t => t.priority === 'medium'),
        low: pageTickets.filter(t => t.priority === 'low'),
      };
    }

    // Group by time — cada chamado cai em EXATAMENTE um balde
    const now = new Date();
    const buckets: Record<string, TicketWithDetails[]> = {
      overdue: [], today: [], thisWeek: [], older: [],
    };

    return pageTickets.reduce((acc, t) => {
      const created = new Date(t.created_at);
      const isOpen = !['resolved', 'closed', 'cancelled'].includes(t.status);
      const deadlineRaw = t.sla_due_at || t.due_date;
      const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
      const hasValidDeadline = deadline && !Number.isNaN(deadline.getTime());

      if (isOpen && hasValidDeadline && isBefore(deadline!, now)) acc.overdue.push(t);
      else if (!Number.isNaN(created.getTime()) && isToday(created)) acc.today.push(t);
      else if (!Number.isNaN(created.getTime()) && isThisWeek(created)) acc.thisWeek.push(t);
      else acc.older.push(t);
      return acc;
    }, buckets);

  }, [pageTickets, groupBy]);

  /** Apenas o PRIMEIRO grupo com itens abre por padrão */
  const firstFilledKey = useMemo(() => {
    const order = groupBy === 'priority'
      ? ['critical', 'high', 'medium', 'low']
      : ['overdue', 'today', 'thisWeek', 'older'];
    return order.find(k => (groupedTickets[k]?.length ?? 0) > 0);
  }, [groupedTickets, groupBy]);

  const gridCols = simplified 
    ? 'grid-cols-[60px_1fr_100px]'
    : 'grid-cols-[60px_1fr_100px_80px_100px_90px]';

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {!isMobile && <WorkOSTableHeader gridCols={gridCols} simplified={simplified} />}
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{ height: isMobile ? 96 : rowHeight }}
              className={isMobile
                ? 'border-b border-border bg-card px-4 py-3 space-y-2'
                : `grid items-center gap-3 px-4 border-b border-border bg-card ${gridCols}`}
            >
              {isMobile ? (
                <>
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                </>
              ) : (
                Array.from({ length: simplified ? 3 : 6 }).map((__, c) => (
                  <div key={c} className="h-3 bg-muted animate-pulse rounded" />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        icon={FilterX}
        title="Nenhum resultado para os filtros aplicados"
        description="Os filtros atuais escondem todos os registros. Limpe os filtros para ver a lista completa."
        actionLabel={onClearFilters ? 'Limpar filtros' : undefined}
        actionIcon={FilterX}
        onAction={onClearFilters}
      />
    ) : (
      <EmptyState
        icon={Inbox}
        title={emptyMessage}
        description="Não há nada nesta lista agora. Quando um novo registro chegar, ele aparece aqui automaticamente."
        actionLabel={onCreate ? createLabel : undefined}
        actionIcon={Plus}
        onAction={onCreate}
      />
    );
  }

  const renderRows = (ticketList: TicketWithDetails[]) => (
    ticketList.map(ticket => (
      <WorkOSTableRow
        key={ticket.id}
        ticket={ticket}
        isSelected={selectedTicketId === ticket.id}
        onSelect={() => onSelectTicket(ticket)}
        onUpdate={onUpdate}
        gridCols={gridCols}
        simplified={simplified}
        rowHeight={rowHeight}
        asCard={isMobile}
      />
    ))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-card">
        <span className="text-[11px] text-muted-foreground">
          <span className="font-mono">{tickets.length}</span> registros
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleDensity}
          className="h-7 gap-1.5 text-[11px]"
          aria-label={density === 'compact' ? 'Usar densidade confortável' : 'Usar densidade compacta'}
        >
          {density === 'compact'
            ? <Rows3 className="w-3.5 h-3.5" aria-hidden="true" />
            : <Rows4 className="w-3.5 h-3.5" aria-hidden="true" />}
          {density === 'compact' ? 'Compacto' : 'Confortável'}
        </Button>
      </div>

      {!isMobile && <WorkOSTableHeader gridCols={gridCols} simplified={simplified} />}
      
      <ScrollArea className="flex-1">
        {groupBy === 'priority' && (
          <>
            <WorkOSGroup
              title="Críticos"
              icon={AlertOctagon}
              accentColor="border-l-red-500"
              tickets={groupedTickets.critical || []}
              defaultOpen={firstFilledKey === 'critical'}
            >
              {renderRows(groupedTickets.critical || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Alta Prioridade"
              icon={ArrowUp}
              accentColor="border-l-orange-500"
              tickets={groupedTickets.high || []}
              defaultOpen={firstFilledKey === 'high'}
            >
              {renderRows(groupedTickets.high || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Prioridade Média"
              icon={Minus}
              accentColor="border-l-yellow-500"
              tickets={groupedTickets.medium || []}
              defaultOpen={firstFilledKey === 'medium'}
            >
              {renderRows(groupedTickets.medium || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Baixa Prioridade"
              icon={ArrowDown}
              accentColor="border-l-emerald-500"
              tickets={groupedTickets.low || []}
              defaultOpen={firstFilledKey === 'low'}
            >
              {renderRows(groupedTickets.low || [])}
            </WorkOSGroup>
          </>
        )}
        
        {groupBy === 'time' && (
          <>
            <WorkOSGroup
              title="Atrasados"
              icon={AlertTriangle}
              accentColor="border-l-red-500"
              tickets={groupedTickets.overdue || []}
              defaultOpen={firstFilledKey === 'overdue'}
            >
              {renderRows(groupedTickets.overdue || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Hoje"
              icon={CalendarDays}
              accentColor="border-l-blue-500"
              tickets={groupedTickets.today || []}
              defaultOpen={firstFilledKey === 'today'}
            >
              {renderRows(groupedTickets.today || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Esta Semana"
              icon={CalendarRange}
              accentColor="border-l-slate-400"
              tickets={groupedTickets.thisWeek || []}
              defaultOpen={firstFilledKey === 'thisWeek'}
            >
              {renderRows(groupedTickets.thisWeek || [])}
            </WorkOSGroup>
            
            <WorkOSGroup
              title="Anteriores"
              icon={Archive}
              accentColor="border-l-slate-300"
              tickets={groupedTickets.older || []}
              defaultOpen={firstFilledKey === 'older'}
            >
              {renderRows(groupedTickets.older || [])}
            </WorkOSGroup>
          </>
        )}
        
        {groupBy === 'none' && (
          <div>
            {renderRows(pageTickets)}
          </div>
        )}
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-card">
          <span className="text-[11px] text-muted-foreground">
            Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages}</span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
