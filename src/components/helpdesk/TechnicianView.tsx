import { useState, useMemo, useCallback } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { useTicketQueue, useTicketHistory } from '@/hooks/useHelpdesk';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useTicketActions } from '@/hooks/useTicketActions';
import { WorkOSTable } from '@/components/workos/WorkOSTable';
import { AISecretarySummary } from '@/components/workos/AISecretarySummary';
import { TicketDetailSheet } from './TicketDetailSheet';
import { cn } from '@/lib/utils';
import { getSLATimeRemaining } from '@/types/helpdesk';
import { History, Calendar, AlertTriangle, User, Inbox, UserX, Flame } from 'lucide-react';

import { KPICard } from '@/components/glpi/KPICard';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import type { TicketWithDetails, TicketStatus, TicketPriority } from '@/types/helpdesk';

type DateFilter = 'all' | '7d' | '30d' | '90d';

interface TechnicianViewProps {
  module?: string;
}

// Kanban view removed — table-only helpdesk

export function TechnicianView({ module }: TechnicianViewProps) {
  const { user, profile, role } = useAuth();
  const { tickets, isLoading, refetch } = useTicketQueue(module);
  const { tickets: historyTickets, isLoading: historyLoading, refetch: refetchHistory } = useTicketHistory(module);

  const { data: tenantSettings } = useTenantSettings();
  const { changeStatus } = useTicketActions();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useQueryState<'all' | 'unassigned' | 'mine' | 'history'>('aba', 'all');
  const [dateFilter, setDateFilter] = useQueryState<DateFilter>('periodo', 'all');
  

  const visibilityMode = tenantSettings?.helpdesk?.ticketVisibility || 'all';
  const isSupervisorOrHigher = ['owner', 'admin', 'manager'].includes(role || '');

  const visibleTickets = useMemo(() => {
    let list = tickets || [];
    if (module) {
      list = list.filter(t => (t as any).module === module);
    }
    if (isSupervisorOrHigher) return list;
    if (visibilityMode === 'all') return list;
    return list.filter(t => !t.assigned_to || t.assigned_to === user?.id);
  }, [tickets, visibilityMode, isSupervisorOrHigher, user?.id, module]);

  const filteredTickets = visibleTickets.filter(t => {
    if (filter === 'unassigned') return !t.assigned_to;
    if (filter === 'mine') return t.assigned_to === user?.id;
    return true;
  });

  const filteredHistoryTickets = useMemo(() => {
    let list = historyTickets || [];
    if (module) {
      list = list.filter(t => (t as any).module === module);
    }
    if (dateFilter === 'all') return list;
    const now = new Date();
    const days = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return list.filter(ticket => {
      const date = new Date(ticket.resolved_at || ticket.closed_at || ticket.updated_at);
      return date >= cutoff;
    });
  }, [historyTickets, dateFilter, module]);

  const handleSelectTicket = (ticket: TicketWithDetails) => {
    setSelectedTicket(ticket);
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
  };

  const handleUpdate = () => {
    if (filter === 'history') {
      refetchHistory();
    } else {
      refetch();
    }
  };


  const showHistory = filter === 'history';

  const stats = {
    total: showHistory ? filteredHistoryTickets.length : filteredTickets.length,
    slaViolated: filteredTickets.filter(t => (() => { const s = getSLATimeRemaining(t.sla_due_at, t); return s.isOverdue && !s.isFrozen; })()).length,
    unassigned: filteredTickets.filter(t => !t.assigned_to).length,
    resolved: filteredHistoryTickets.length,
  };

  const allCount = visibleTickets.length;
  const unassignedCount = visibleTickets.filter(t => !t.assigned_to).length;
  const mineCount = visibleTickets.filter(t => t.assigned_to === user?.id).length;
  const historyCount = historyTickets.length;
  const criticalCount = visibleTickets.filter(t => t.priority === 'critical').length;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <AISecretarySummary 
        tickets={filteredTickets}
        userName={profile?.full_name || 'Técnico'}
        isLoading={isLoading}
        onRefresh={refetch}
        currentUserId={user?.id}
      />

      {/* KPI Cards — Qualidade-style pastel */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <KPIGrid lgCols={5} className="mb-2">
          <KPICard value={allCount} label="Na Fila" icon={Inbox} color="blue" />
          <KPICard value={stats.slaViolated} label="SLA Violados" icon={AlertTriangle} color="red" />
          <KPICard value={unassignedCount} label="Não Atribuídos" icon={UserX} color="yellow" />
          <KPICard value={mineCount} label="Meus" icon={User} color="purple" />
          <KPICard value={criticalCount} label="Críticos" icon={Flame} color="orange" />
        </KPIGrid>
      </div>
      
      {/* Filter Tabs + View Toggle */}
      <div className="h-10 border-b border-border/50 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex gap-1">
          {(['all', 'unassigned', 'mine', 'history'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5",
                filter === f 
                  ? "bg-primary/15 text-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {f === 'all' && `Todos (${allCount})`}
              {f === 'unassigned' && `Não Atribuídos (${unassignedCount})`}
              {f === 'mine' && `Meus (${mineCount})`}
              {f === 'history' && (
                <>
                  <History className="w-3.5 h-3.5" />
                  {`Histórico (${historyCount})`}
                </>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {showHistory && (
            <div className="flex items-center gap-1.5 ml-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex gap-0.5">
                {(['all', '7d', '30d', '90d'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDateFilter(d)}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-sm transition-colors",
                      dateFilter === d
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    {d === 'all' ? 'Todos' : d === '7d' ? '7d' : d === '30d' ? '30d' : '90d'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        <WorkOSTable
          tickets={showHistory ? filteredHistoryTickets : filteredTickets}
          isLoading={showHistory ? historyLoading : isLoading}
          selectedTicketId={selectedTicket?.id}
          onSelectTicket={handleSelectTicket}
            onUpdate={handleUpdate}
            groupBy={showHistory ? "none" : "priority"}
            emptyMessage={showHistory ? "Nenhum chamado no histórico" : "Nenhum chamado na fila"}
            hasActiveFilters={showHistory ? dateFilter !== 'all' : filter !== 'all'}
            onClearFilters={() => { setFilter('all'); setDateFilter('all'); }}
          />

      </div>

      {/* Footer Stats */}
      <div className="h-8 border-t border-border/50 flex items-center px-4 text-[11px] text-muted-foreground gap-3 font-mono flex-shrink-0" style={{ background: 'hsl(217 33% 8% / 0.6)' }}>
        {showHistory ? (
          <span>{stats.resolved} chamados encerrados</span>
        ) : (
          <>
            <span>{stats.total} chamados</span>
            <span className="text-border/50">•</span>
            <span className={cn(stats.slaViolated > 0 && "text-destructive font-medium")}>
              {stats.slaViolated} SLA violados
            </span>
            <span className="text-border/50">•</span>
            <span className={cn(stats.unassigned > 0 && "text-muted-foreground font-medium")}>
              {stats.unassigned} não atribuídos
            </span>
          </>
        )}
      </div>

      <TicketDetailSheet
        ticket={selectedTicket}
        open={sheetOpen}
        onClose={handleCloseSheet}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
