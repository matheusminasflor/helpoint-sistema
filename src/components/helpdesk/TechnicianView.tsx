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
import { ordenarPorUrgencia } from '@/lib/fila-de-chamados';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
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
  const { user, profile } = useAuth();
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
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
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
      <div className="min-h-10 py-1 border-b border-border/50 flex flex-wrap items-center justify-between gap-2 px-4 flex-shrink-0">
        <div className="flex gap-1 overflow-x-auto max-w-full min-w-0">
          {(['all', 'unassigned', 'mine', 'history'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 min-h-9 text-[13px] font-medium rounded-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0",
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
          {(filter === 'sla' || filter === 'criticos') && (
            <button
              onClick={() => setFilter('all')}
              title="Tirar o filtro"
              className="px-3 py-1 text-xs font-medium rounded-sm bg-primary/15 text-primary flex items-center gap-1.5"
            >
              {filter === 'sla' ? `SLA violados (${violados.length})` : `Críticos (${criticalCount})`} ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {registraViagem && setor && <ViagensDoSetorDialog setor={setor} setorNome={setorNome} />}
          {registraViagem && <SetorForaDialog module={module ?? 'tickets'} setorNome={setorNome} />}
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

      {((showHistory && historyCortou) || (!showHistory && cortou)) && (
        <div className="px-4 pt-3 flex-shrink-0">
          <ListaCortada />
        </div>
      )}

      {/* Content */}
      <div>
        <WorkOSTable
          tickets={showHistory ? filteredHistoryTickets : ordenarPorUrgencia(filteredTickets)}
          isLoading={showHistory ? historyLoading : isLoading}
          selectedTicketId={selectedTicket?.id}
          onSelectTicket={handleSelectTicket}
            onUpdate={handleUpdate}
            emptyMessage={showHistory ? "Nenhum chamado no histórico" : "Nenhum chamado na fila"}
            hasActiveFilters={showHistory ? dateFilter !== 'all' : filter !== 'all'}
            onClearFilters={() => { setFilter('all'); setDateFilter('all'); }}
          />

      </div>

      {/* Footer Stats */}
      {/* Rodada 3 (correção 13): a faixa azul-marinho fixa dava 1,2 : 1 com a letra no tema claro. */}
      <div className="h-8 border-t border-border flex items-center px-4 text-[12px] text-muted-foreground gap-3 font-mono flex-shrink-0 bg-card">
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
