import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryState } from '@/hooks/useQueryState';
import { useTicketQueue, useTicketHistory } from '@/hooks/useHelpdesk';
import { useAuth } from '@/contexts/AuthContext';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useChamadosQueAtendoJunto } from '@/hooks/useAtenderJunto';
import { WorkOSTable } from '@/components/workos/WorkOSTable';
import { AISecretarySummary } from '@/components/workos/AISecretarySummary';
import { ListaCortada } from '@/components/ui/ListaCortada';
import { TicketDetailSheet } from './TicketDetailSheet';
import { ViagensDoSetorDialog } from './ViagensDoSetorDialog';
import { SetorForaDialog } from './SetorForaDialog';
import { cn } from '@/lib/utils';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import { ordenarPorUrgencia } from '@/lib/fila-de-chamados';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { getSLATimeRemaining } from '@/types/helpdesk';
import { History, Calendar, AlertTriangle, User, Inbox, UserX, Flame, MoreHorizontal, Plane, CalendarOff, Ticket, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { KPICard } from '@/components/glpi/KPICard';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import type { TicketWithDetails, TicketStatus, TicketPriority } from '@/types/helpdesk';

type DateFilter = 'all' | '7d' | '30d' | '90d';

interface TechnicianViewProps {
  module?: string;
  /** O título da página (DashStack: toda tela tem o seu); o Financeiro chama de "Solicitações". */
  titulo?: string;
  descricao?: string;
  icone?: LucideIcon;
}

// Kanban view removed — table-only helpdesk

export function TechnicianView({ module, titulo = 'Fila de chamados', descricao, icone = Ticket }: TechnicianViewProps) {
  const { user, profile } = useAuth();
  // No Financeiro a fila é "Solicitações" (dono, 2026-10-28): os textos dizem solicitação, não chamado.
  const solicitacao = module === 'financeiro';
  const { tickets, isLoading, atualizando, refetch, cortou } = useTicketQueue(module);
  const { tickets: historyTickets, isLoading: historyLoading, atualizando: atualizandoHistorico, refetch: refetchHistory, cortou: historyCortou } = useTicketHistory(module);
  // "Atualizar" recarrega as DUAS listas: na aba de histórico o botão só relia a fila aberta, e a
  // tela não mudava (2026-10-02).
  const atualizarTudo = () => { void refetch(); void refetchHistory(); };

  // Fila ao vivo (etapa 4 · Chamados, 2026-10-24): um chamado do setor mudou, a lista recarrega — juntando as mudanças
  // de 2 s num recarregar só. O Realtime entrega só o que o RLS deixa a pessoa ver.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`fila-${module}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `module=eq.${module}` }, () => {
        if (espera) return;
        espera = setTimeout(() => { espera = null; void refetch(); void refetchHistory(); }, 2000);
      })
      .subscribe();
    return () => { if (espera) clearTimeout(espera); void supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- um canal por setor; refetch muda a cada render
  }, [module]);

  const { changeStatus } = useTicketActions();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // `sla` e `criticos` não têm aba: nascem do clique no KPI (dono, 2026-10-15: "na fila mostrar quais e
  // clicável depois").
  const [filter, setFilter] = useQueryState<'all' | 'unassigned' | 'mine' | 'history' | 'sla' | 'criticos'>('aba', 'all');
  const [dateFilter, setDateFilter] = useQueryState<DateFilter>('periodo', 'all');
  

  // Quem distribui a fila (transferir para outra pessoa) lê o resumo do SETOR; quem atende, o seu.
  const noChamado = usePodeNoChamado(module);
  const gereAFila = noChamado.pode('transfer');
  // Caixinha própria desde 2026-10-24 (antes era "Transferir"); o banco pergunta `pode_registrar_viagem`.
  const registraViagem = noChamado.pode('registrar_viagem');
  const setor = setorDoModulo(module ?? 'tickets');
  const setorNome = setor ? DEPARTMENT_SCHEMAS[setor].label : 'setor';
  const [viagensAberta, setViagensAberta] = useState(false);
  const [setorForaAberta, setSetorForaAberta] = useState(false);

  // Quem vê o quê é do BANCO (2026-10-06): sem a caixinha "Ver os chamados do setor", a policy de
  // `tickets` devolve só os próprios e os sem atendente do setor. A opção geral da empresa
  // (`settings.helpdesk.ticketVisibility`, que só escondia na tela) saiu — duas regras, não.
  const visibleTickets = useMemo(() => {
    const list = tickets || [];
    return module ? list.filter(t => (t as any).module === module) : list;
  }, [tickets, module]);

  // "Meus" = os que eu atendo + os que eu atendo JUNTO, de qualquer setor (dono, 2026-10-19: "aceitei chamado do
  // laboratório, deve aparecer na fila do meu setor para eu não esquecer"). "Todos" e os outros números seguem só do setor.
  const { data: atendoJunto = [], refetch: refetchJunto } = useChamadosQueAtendoJunto();
  const meus = useMemo(() => {
    const juntoIds = new Set(atendoJunto.map(t => t.id));
    const doSetor = visibleTickets.filter(t => t.assigned_to === user?.id || juntoIds.has(t.id));
    const deOutros = atendoJunto
      .filter(t => !doSetor.some(d => d.id === t.id) && t.assigned_to !== user?.id)
      .map(t => ({ ...t, atendo_junto: true }));
    return [...doSetor.map(t => (juntoIds.has(t.id) && t.assigned_to !== user?.id ? { ...t, atendo_junto: true } : t)), ...deOutros];
  }, [visibleTickets, atendoJunto, user?.id]);

  const violado = (t: TicketWithDetails) => { const s = getSLATimeRemaining(t.sla_due_at, t); return s.isOverdue && !s.isFrozen; };
  const filteredTickets = (filter === 'mine' ? meus : visibleTickets).filter(t => {
    if (filter === 'unassigned') return !t.assigned_to;
    if (filter === 'sla') return violado(t);
    if (filter === 'criticos') return t.priority === 'critical';
    return true;
  });
  const noHover = (lista: TicketWithDetails[]) => lista.map(t => ({ ...t, modulo: t.module ?? undefined }));

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
      void refetchJunto();
    }
  };


  const showHistory = filter === 'history';

  const stats = {
    total: showHistory ? filteredHistoryTickets.length : filteredTickets.length,
    slaViolated: filteredTickets.filter(violado).length,
    unassigned: filteredTickets.filter(t => !t.assigned_to).length,
    resolved: filteredHistoryTickets.length,
  };

  const allCount = visibleTickets.length;
  const violados = visibleTickets.filter(violado);
  const naoAtribuidos = visibleTickets.filter(t => !t.assigned_to);
  const criticos = visibleTickets.filter(t => t.priority === 'critical');
  const unassignedCount = naoAtribuidos.length;
  const mineCount = meus.length;
  const historyCount = historyTickets.length;
  const criticalCount = criticos.length;

  return (
    // A página inteira rola, não uma caixa dentro dela (dono, 2026-10-19: "tenho que ficar rolando para ver todos os
    // chamados, a lista ficou pequena"). Com a altura presa à janela, o resumo e os cartões de cima — que cresceram em
    // 2026-10-15 — deixavam uns 200px para a lista numa tela de notebook.
    <div className="flex flex-col">
      {/* Viagens e Setor fora saíram do lado das abas para o "⋯" do topo (dono, 2026-10-28, proposta do celular). */}
      <PageHeader
        title={titulo}
        description={descricao ?? `Os chamados que chegam ao ${setorNome}, do mais urgente para o menos urgente.`}
        icon={icone}
        actions={registraViagem && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><MoreHorizontal className="w-4 h-4" aria-hidden="true" />Mais</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {setor && <DropdownMenuItem onSelect={() => setViagensAberta(true)}><Plane className="w-4 h-4 mr-2" aria-hidden="true" />Viagens do setor</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setSetorForaAberta(true)}><CalendarOff className="w-4 h-4 mr-2" aria-hidden="true" />Setor fora</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
      {registraViagem && setor && <ViagensDoSetorDialog setor={setor} setorNome={setorNome} aberta={viagensAberta} setAberta={setViagensAberta} />}
      {registraViagem && <SetorForaDialog module={module ?? 'tickets'} setorNome={setorNome} aberta={setorForaAberta} setAberta={setSetorForaAberta} />}
      {/* A fila visível do setor, sem o recorte da aba ("Meus", "Não atribuídos"): o resumo do
          gestor fala do setor inteiro (revisão de 2026-10-05). */}
      <AISecretarySummary
        tickets={visibleTickets}
        userName={profile?.full_name || 'Técnico'}
        isLoading={isLoading || atualizando || atualizandoHistorico}
        onRefresh={atualizarTudo}
        currentUserId={user?.id}
        gestor={gereAFila}
        setorNome={setorNome}
        onSelectTicket={handleSelectTicket}
      />

      {/* KPI Cards — Qualidade-style pastel */}
      <div className="px-4 lg:px-8 pt-3 pb-1 flex-shrink-0">
        <KPIGrid lgCols={5} className="mb-2">
          {/* Passar o mouse mostra quais; clicar filtra a fila (dono, 2026-10-15). */}
          <KPICard value={allCount} label="Na Fila" icon={Inbox} color="blue" chamados={noHover(visibleTickets)} onClick={() => setFilter('all')} />
          <KPICard value={violados.length} label="SLA Violados" icon={AlertTriangle} color="red" chamados={noHover(violados)} onClick={() => setFilter('sla')} />
          <KPICard value={unassignedCount} label="Não Atribuídos" icon={UserX} color="yellow" chamados={noHover(naoAtribuidos)} onClick={() => setFilter('unassigned')} />
          <KPICard value={mineCount} label="Meus" icon={User} color="purple" chamados={noHover(meus)} onClick={() => setFilter('mine')} />
          <KPICard value={criticalCount} label="Críticos" icon={Flame} color="orange" chamados={noHover(criticos)} onClick={() => setFilter('criticos')} />
        </KPIGrid>
      </div>
      
      {/* Filter Tabs + View Toggle */}
      <div className="min-h-10 py-3 flex flex-wrap items-center justify-between gap-2 px-4 lg:px-8 flex-shrink-0">
        <div className="inline-flex h-9 rounded-md border border-input bg-card overflow-x-auto max-w-full min-w-0">
          {(['all', 'unassigned', 'mine', 'history'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 h-full text-[14px] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 border-r border-input last:border-r-0",
                filter === f 
                  ? "bg-primary text-primary-foreground font-bold" 
                  : "font-semibold text-foreground hover:bg-muted"
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
          {(filter === 'sla' || filter === 'criticos') && (
            <button
              onClick={() => setFilter('all')}
              title="Tirar o filtro"
              className="px-4 h-full text-[14px] font-bold bg-primary text-primary-foreground flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {filter === 'sla' ? `SLA violados (${violados.length})` : `Críticos (${criticalCount})`} ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Período do histórico nas mesmas abas da DashStack ("Day / Week / Month"). */}
          {showHistory && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <AbasSegmentadas rotulo="Período do histórico" valor={dateFilter} onValor={setDateFilter}
                opcoes={[{ valor: 'all', rotulo: 'Tudo' }, { valor: '7d', rotulo: '7 dias' }, { valor: '30d', rotulo: '30 dias' }, { valor: '90d', rotulo: '90 dias' }]} />
            </div>
          )}
        </div>
      </div>

      {((showHistory && historyCortou) || (!showHistory && cortou)) && (
        <div className="px-4 lg:px-8 pb-3 flex-shrink-0">
          <ListaCortada />
        </div>
      )}

      {/* A lista e o rodapé num cartão, como o Order Lists da DashStack (2026-10-29). */}
      <div className="panel overflow-hidden mx-4 lg:mx-8 mb-6">
      <div>
        <WorkOSTable
          tickets={showHistory ? filteredHistoryTickets : ordenarPorUrgencia(filteredTickets)}
          isLoading={showHistory ? historyLoading : isLoading}
          selectedTicketId={selectedTicket?.id}
          onSelectTicket={handleSelectTicket}
            onUpdate={handleUpdate}
            emptyMessage={showHistory ? `Nenhum${solicitacao ? "a solicitação" : " chamado"} no histórico` : solicitacao ? "Nenhuma solicitação" : "Nenhum chamado na fila"}
            hasActiveFilters={showHistory ? dateFilter !== 'all' : filter !== 'all'}
            onClearFilters={() => { setFilter('all'); setDateFilter('all'); }}
          />

      </div>

      {/* Footer Stats */}
      {/* Rodada 3 (correção 13): a faixa azul-marinho fixa dava 1,2 : 1 com a letra no tema claro. */}
      <div className="h-10 border-t border-border flex items-center px-4 text-[13px] font-semibold text-muted-foreground gap-3 flex-shrink-0 bg-card">
        {showHistory ? (
          <span>{stats.resolved} {solicitacao ? "solicitações encerradas" : "chamados encerrados"}</span>
        ) : (
          <>
            <span>{stats.total} {solicitacao ? "solicitações" : "chamados"}</span>
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
