import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Button } from '@/components/ui/button';
import { WorkOSTable } from '@/components/workos/WorkOSTable';
import { EmptyState } from '@/components/ui/empty-state';
import { ListaCortada } from '@/components/ui/ListaCortada';
import { useMyTickets } from '@/hooks/useHelpdesk';
import { useTenantPath } from '@/hooks/useTenantPath';
import { 
  Plus,
  Star,
  CheckCircle2,
  Inbox,
  Clock,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import type { TicketWithDetails } from '@/types/helpdesk';
import { isAwaitingEvaluation } from '@/components/helpdesk/TicketEvaluationPanel';
import { rotuloDoSetor } from '@/lib/setores';

/** O setor para onde o chamado foi aberto (`tickets` é a TI). */
const setorDoChamado = (t: TicketWithDetails) => rotuloDoSetor(t.module === 'tickets' ? 'ti' : t.module);

type Tab = 'all' | 'open' | 'waiting' | 'evaluate' | 'resolved';

export function CollaboratorView() {
  const { tickets, isLoading, atualizando, refetch, cortou } = useMyTickets();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [activeTab, setActiveTab] = useQueryState<Tab>('aba', 'all');
  // Para que setor abri (dono, 2026-10-15): filtra a lista por setor de destino.
  const [setor, setSetor] = useQueryState<string>('setor', '');
  const setores = [...new Set(tickets.map(setorDoChamado))].sort();

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

  const filteredTickets = getFilteredTickets().filter((t) => !setor || setorDoChamado(t) === setor);

  const handleSelectTicket = (ticket: TicketWithDetails) => {
    navigate(tenantPath(`/helpdesk/${ticket.id}`));
  };

  const goToNewRequest = () => navigate(tenantPath('/nova-solicitacao'));
  const goToNovoChamado = () => navigate(tenantPath('/nova-solicitacao'));

  const emptyConfig: Record<Tab, { icon: typeof Inbox; title: string; description: string; action?: string }> = {
    all: {
      icon: Inbox,
      title: 'Você ainda não abriu chamados',
      description: 'Quando precisar de ajuda de TI, Marketing, Qualidade ou RH, abra um chamado e acompanhe por aqui.',
      action: 'Novo chamado',
    },
    open: {
      icon: CheckCircle2,
      title: 'Nenhum chamado em aberto',
      description: 'Todos os seus chamados já foram tratados.',
      action: 'Novo chamado',
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
      <div className="flex-shrink-0">
        <div className="px-6 lg:px-8 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight text-foreground">Meus chamados</h1>
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
                disabled={atualizando}
                aria-label="Atualizar lista"
              >
                <RefreshCw className={cn("w-4 h-4", atualizando && "animate-spin")} />
              </Button>
              
              <Button onClick={goToNewRequest} className="gap-2" aria-label="Novo chamado ou pedido">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex-shrink-0">
        <div className="px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 py-2">
            <AbasSegmentadas rotulo="Filtrar por situação" valor={activeTab} onValor={setActiveTab}
              opcoes={[
                { valor: 'all', rotulo: `Todos (${tickets.length})` },
                { valor: 'open', rotulo: `Em aberto (${openTickets.length})` },
                { valor: 'waiting', rotulo: `Aguardando você (${waitingUserTickets.length})` },
                { valor: 'evaluate', rotulo: `Para avaliar (${toEvaluateTickets.length})` },
                { valor: 'resolved', rotulo: `Resolvidos (${resolvedTickets.length})` },
              ]} />
            {setores.length > 1 && (
              <select aria-label="Filtrar por setor" value={setor} onChange={(e) => setSetor(e.target.value)}
                className="ml-auto h-9 rounded-md border border-input bg-card px-3 text-[14px]">
                <option value="">Todos os setores</option>
                {setores.map((s) => (
                  <option key={s} value={s}>{s} ({tickets.filter((t) => setorDoChamado(t) === s).length})</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {cortou && !isLoading && (
        <div className="px-6 lg:px-8 pt-4 flex-shrink-0">
          <ListaCortada />
        </div>
      )}

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
              onAction={empty.action ? goToNovoChamado : undefined}
            />
          ) : (
            <WorkOSTable
              tickets={filteredTickets}
              isLoading={isLoading}
              onSelectTicket={handleSelectTicket}
                  emptyMessage="Nenhum chamado encontrado"
              simplified={true}
              hasActiveFilters={activeTab !== 'all' || !!setor}
              onClearFilters={() => { setActiveTab('all'); setSetor(''); }}
              onCreate={goToNewRequest}
            />

          )}
        </div>
      </div>

    </div>
  );
}
