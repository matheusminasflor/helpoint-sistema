import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Button } from '@/components/ui/button';
import { WorkOSTable } from '@/components/workos/WorkOSTable';
import { EmptyState } from '@/components/ui/empty-state';
import { useMyTickets } from '@/hooks/useHelpdesk';
import { useTenantPath } from '@/hooks/useTenantPath';
import { 
  Plus,
  Star,
  CheckCircle2,
  Inbox,
  Clock,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { TicketWithDetails } from '@/types/helpdesk';
import { isAwaitingEvaluation } from '@/components/helpdesk/TicketEvaluationPanel';

type Tab = 'all' | 'open' | 'waiting' | 'evaluate' | 'resolved';

export function CollaboratorView() {
  const { tickets, isLoading, refetch } = useMyTickets();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [activeTab, setActiveTab] = useQueryState<Tab>('aba', 'all');

  // Filter tickets by status
  const openTickets = tickets.filter(t => ['open', 'in_progress', 'waiting_parts'].includes(t.status));
  const waitingUserTickets = tickets.filter(t => t.status === 'waiting_user');
  const toEvaluateTickets = tickets.filter(isAwaitingEvaluation);
  const resolvedTickets = tickets.filter(t => ['resolved', 'closed'].includes(t.status));

  const getFilteredTickets = (): TicketWithDetails[] => {
    switch (activeTab) {
      case 'open':
        return openTickets;
      case 'waiting':
        return waitingUserTickets;
      case 'evaluate':
        return toEvaluateTickets;
      case 'resolved':
        return resolvedTickets;
      default:
        return tickets;
    }
  };

  const filteredTickets = getFilteredTickets();

  const handleSelectTicket = (ticket: TicketWithDetails) => {
    navigate(tenantPath(`/helpdesk/${ticket.id}`));
  };

  const goToNewRequest = () => navigate(tenantPath('/nova-solicitacao'));

  const emptyConfig: Record<Tab, { icon: typeof Inbox; title: string; description: string; action?: string }> = {
    all: {
      icon: Inbox,
      title: 'Você ainda não abriu chamados',
      description: 'Quando precisar de ajuda de TI, Marketing, Qualidade ou RH, abra uma solicitação e acompanhe por aqui.',
      action: 'Nova solicitação',
    },
    open: {
      icon: CheckCircle2,
      title: 'Nenhum chamado em aberto',
      description: 'Todos os seus chamados já foram tratados.',
      action: 'Nova solicitação',
    },
    waiting: {
      icon: Clock,
      title: 'Nenhum chamado aguardando você',
      description: 'Quando um atendente precisar de informação sua, o chamado aparece aqui.',
    },
    evaluate: {
      icon: Star,
      title: 'Nenhum chamado para avaliar',
      description: 'Quando um atendimento for concluído, ele aparece aqui para você avaliar ou reabrir em até 7 dias.',
    },
    resolved: {
      icon: Inbox,
      title: 'Nenhum chamado resolvido',
      description: 'Seus chamados resolvidos ficam registrados aqui.',
    },
  };

  const empty = emptyConfig[activeTab];

  return (
    <div className="min-h-full bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border/60 bg-card flex-shrink-0 ">
        <div className="px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Meus chamados</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {openTickets.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('open')}
                      className="font-semibold text-primary hover:underline"
                    >
                      {openTickets.length} {openTickets.length === 1 ? 'chamado em aberto' : 'chamados em aberto'}
                    </button>
                    {waitingUserTickets.length > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('waiting')}
                          className="font-semibold text-primary hover:underline"
                        >
                          {waitingUserTickets.length} aguardando você
                        </button>
                      </>
                    )}
                    {toEvaluateTickets.length > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('evaluate')}
                          className="font-semibold text-primary hover:underline"
                        >
                          {toEvaluateTickets.length} para avaliar
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>Nenhum chamado em aberto · {tickets.length} no histórico</>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                aria-label="Atualizar lista"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </Button>
              
              <Button onClick={goToNewRequest} className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nova solicitação</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-border/60 bg-card flex-shrink-0 ">
        <div className="px-6 lg:px-8">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {([
              { key: 'all', label: 'Todos', icon: Inbox, count: tickets.length },
              { key: 'open', label: 'Em aberto', icon: Clock, count: openTickets.length },
              { key: 'waiting', label: 'Aguardando você', icon: AlertCircle, count: waitingUserTickets.length },
              { key: 'evaluate', label: 'Para avaliar', icon: Star, count: toEvaluateTickets.length },
              { key: 'resolved', label: 'Resolvidos', icon: CheckCircle2, count: resolvedTickets.length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                  activeTab === tab.key 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full font-mono",
                    activeTab === tab.key 
                      ? "bg-primary-foreground/20" 
                      : "bg-muted-foreground/20"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="h-full">
          {filteredTickets.length === 0 && !isLoading ? (
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              description={empty.description}
              actionLabel={empty.action}
              actionIcon={empty.action ? Plus : undefined}
              onAction={empty.action ? goToNewRequest : undefined}
            />
          ) : (
            <WorkOSTable
              tickets={filteredTickets}
              isLoading={isLoading}
              onSelectTicket={handleSelectTicket}
              groupBy="none"
              emptyMessage="Nenhum chamado encontrado"
              simplified={true}
              hasActiveFilters={activeTab !== 'all'}
              onClearFilters={() => setActiveTab('all')}
              onCreate={goToNewRequest}
            />

          )}
        </div>
      </div>

    </div>
  );
}
