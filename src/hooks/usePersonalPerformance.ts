import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { separarPorSetor } from '@/lib/performance-pessoal';
import { SLA_PAUSED_STATUSES } from '@/types/helpdesk';
import { inicioDoPeriodo, melhorSequenciaDoMes, sequenciaDaSemana, type Entrega, type Periodo } from '@/lib/chama-da-performance';

export interface OverdueItem {
  id: string;
  title: string;
  type: 'ticket' | 'kanban' | 'task';
  typeLabel: string;
  dueDate: Date;
  daysOverdue: number;
  route: string;
}

interface PersonalPerformance {
  resolvedToday: number;
  resolvedThisWeek: number;
  onTimeRate: number | null;
  /** Resolvidos seguidos no prazo NESTA SEMANA (`sequenciaDaSemana`) — é ela que acende a chama. */
  streak: number;
  /** A sequência mais longa do mês (zerando a cada segunda e a cada atraso). */
  melhorSequenciaDoMes: number;
  overdueItems: OverdueItem[];
  /**
   * Chamados de setores que NÃO são da pessoa, resolvidos por ela no período (dono,
   * 2026-10-07). Ficam fora de prazo, entregas, sequência e atrasos.
   */
  ajudaOutrosSetores: number;
  isLoading: boolean;
}

/**
 * `periodo`: a semana de trabalho (segunda até hoje) ou o mês (dono, 2026-10-13 — os "7 dias corridos"
 * arrastavam a semana passada). Entregas e no prazo são do período; a sequência é sempre da semana.
 * Atrasos é sempre "aberto agora".
 */
export function usePersonalPerformance(periodo: Periodo = 'semana'): PersonalPerformance {
  const { user, tenantId } = useAuth();

  // Os setores em que a pessoa trabalha (Setor do perfil, acesso, perfil de acesso) — o banco diz.
  const { data: meusSetores, isLoading: l0 } = useQuery({
    queryKey: ['meus-setores-de-chamado', tenantId, user?.id],
    queryFn: async () => unwrap(await supabase.rpc('meus_setores_de_chamado')) ?? [],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  // Busca desde o que vier antes: o início do período ou a segunda desta semana (a sequência é da semana,
  // e o mês pode começar no meio dela). Em `dia` para a chave do cache não mudar a cada render.
  const dia = new Date().toDateString();
  const { desdeISO, inicioISO } = useMemo(() => {
    const inicio = inicioDoPeriodo(periodo);
    const semana = inicioDoPeriodo('semana');
    return { desdeISO: (semana < inicio ? semana : inicio).toISOString(), inicioISO: inicio.toISOString() };
  }, [periodo, dia]);

  // Os chamados que atendo junto (dono, 2026-10-13): contam inteiros para mim, de qualquer setor.
  const { data: idsJunto = [], isLoading: lj } = useQuery({
    queryKey: ['meus-chamados-junto', tenantId, user?.id],
    queryFn: async () => ((unwrap(await supabase.from('ticket_participantes' as never).select('ticket_id').eq('user_id', user!.id)) ?? []) as unknown as { ticket_id: string }[]).map(r => r.ticket_id),
    enabled: !!user?.id && !!tenantId,
    staleTime: 60_000,
  });
  const meus = idsJunto.length ? `assigned_to.eq.${user?.id},id.in.(${idsJunto.join(',')})` : `assigned_to.eq.${user?.id}`;

  // Tickets: resolved (last 7d) + still open assigned to me
  const { data: ticketResolvedTodos = [], isLoading: l1 } = useQuery({
    queryKey: ['personal-perf-tickets-resolved', tenantId, user?.id, desdeISO, meus],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, module, resolved_at, sla_due_at, due_date, created_at')
        .or(meus)
        .in('status', ['resolved', 'closed'])
        .gte('resolved_at', desdeISO)
        .order('resolved_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !lj,
    staleTime: 60_000,
  });

  const { data: ticketOpenTodos = [], isLoading: l1b } = useQuery({
    queryKey: ['personal-perf-tickets-open', tenantId, user?.id, meus],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, module, title, ticket_number, sla_due_at, due_date, status, agendou_vencido' as 'id, module, title, ticket_number, sla_due_at, due_date, status')
        .or(meus)
        .not('status', 'in', '(resolved,closed,cancelled,rejected)')
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !lj,
    staleTime: 60_000,
  });

  // Kanban removed — keep empty arrays for backwards compatibility
  const l2 = false;
  const kanbanOpen: { id: string; title: string; due_date: string | null; completed_at: string | null }[] = [];
  const l2b = false;

  // Tasks: completed (last 7d) + open
  const { data: tasksCompleted = [], isLoading: l3 } = useQuery({
    queryKey: ['personal-perf-tasks-done', tenantId, user?.id, desdeISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, completed_at, due_date')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .gte('completed_at', desdeISO)
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: tasksOpen = [], isLoading: l3b } = useQuery({
    queryKey: ['personal-perf-tasks-open', tenantId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('user_id', user!.id)
        .in('status', ['pending', 'in_progress'])
        .not('due_date', 'is', null)
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return useMemo(() => {
    // Só o que é dos setores da pessoa pesa; o resto é ajuda (ver `@/lib/performance-pessoal`) — menos o que ela
    // atende junto, que conta inteiro para ela, de qualquer setor (dono, 2026-10-13).
    const junto = new Set(idsJunto);
    const porSetorResolvidos = separarPorSetor(ticketResolvedTodos.filter(t => !junto.has(t.id)), meusSetores);
    const ticketResolved = [...porSetorResolvidos.meus, ...ticketResolvedTodos.filter(t => junto.has(t.id))];
    const ajudaResolvida = porSetorResolvidos.ajuda;
    const ticketOpen = [...separarPorSetor(ticketOpenTodos.filter(t => !junto.has(t.id)), meusSetores).meus, ...ticketOpenTodos.filter(t => junto.has(t.id))];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    // Resolved today across all sources
    const isToday = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= today && d <= todayEnd;
    };
    // Cada entrega dos meus setores, com "no prazo" (sem prazo conta como no prazo: não havia o que perder).
    const fimDoDia = (d: string) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const entregas: (Entrega & { temPrazo: boolean })[] = [
      ...ticketResolved.filter(t => t.resolved_at).map(t => {
        const prazo = t.sla_due_at || t.due_date;
        return { quando: t.resolved_at!, noPrazo: !prazo || new Date(t.resolved_at!) <= new Date(prazo), temPrazo: !!prazo };
      }),
      ...tasksCompleted.filter(t => t.completed_at).map(t => ({
        quando: t.completed_at!, noPrazo: !t.due_date || new Date(t.completed_at!) <= fimDoDia(t.due_date), temPrazo: !!t.due_date,
      })),
    ];
    // A busca pode trazer o começo da semana antes do dia 1 (para a sequência); os números são do período.
    const doPeriodo = entregas.filter(e => e.quando >= inicioISO);

    const resolvedToday = entregas.filter(e => isToday(e.quando)).length;
    const resolvedThisWeek = doPeriodo.length;
    const comPrazo = doPeriodo.filter(e => e.temPrazo);
    const onTimeRate = comPrazo.length > 0
      ? Math.round((comPrazo.filter(e => e.noPrazo).length / comPrazo.length) * 100)
      : null;

    // A sequência (dono, 2026-10-13): resolvidos seguidos no prazo, zerando no atraso e na segunda.
    const streak = sequenciaDaSemana(entregas);
    const melhorDoMes = melhorSequenciaDoMes(entregas);

    // Overdue items (open, past their deadline)
    const overdueItems: OverdueItem[] = [];

    ticketOpen.forEach((t: any) => {
      // Pendente e Agendado têm o prazo pausado: não estão atrasados (2026-10-07).
      // Pausado não atrasa — exceto o agendado com o prazo já vencido (2026-10-15; 20270115010000).
      if ((SLA_PAUSED_STATUSES as readonly string[]).includes(t.status)
          && !(t.status === 'scheduled' && (t as { agendou_vencido?: boolean }).agendou_vencido)) return;
      const deadline = t.sla_due_at || t.due_date;
      if (!deadline) return;
      const due = new Date(deadline);
      if (due < now) {
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        overdueItems.push({
          id: t.id,
          title: t.title || `Chamado #${t.ticket_number}`,
          type: 'ticket',
          typeLabel: 'Chamado',
          dueDate: due,
          daysOverdue,
          route: `/helpdesk/${t.id}`,
        });
      }
    });

    kanbanOpen.forEach((c: any) => {
      if (!c.due_date) return;
      const due = new Date(c.due_date);
      due.setHours(23, 59, 59, 999);
      if (due < now) {
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        overdueItems.push({
          id: c.id,
          title: c.title || 'Card sem título',
          type: 'kanban',
          typeLabel: 'Projeto',
          dueDate: due,
          daysOverdue,
          route: '/kanban',
        });
      }
    });

    tasksOpen.forEach((t: any) => {
      if (!t.due_date) return;
      const due = new Date(t.due_date);
      due.setHours(23, 59, 59, 999);
      if (due < now) {
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        overdueItems.push({
          id: t.id,
          title: t.title || 'Tarefa sem título',
          type: 'task',
          typeLabel: 'Tarefa',
          dueDate: due,
          daysOverdue,
          route: '/inicio',
        });
      }
    });

    overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return {
      resolvedToday,
      resolvedThisWeek,
      onTimeRate,
      streak,
      melhorSequenciaDoMes: melhorDoMes,
      overdueItems,
      ajudaOutrosSetores: ajudaResolvida.filter(t => (t.resolved_at ?? '') >= inicioISO).length,
      isLoading: l0 || lj || l1 || l1b || l2 || l2b || l3 || l3b,
    };
  }, [meusSetores, idsJunto, ticketResolvedTodos, ticketOpenTodos, kanbanOpen, tasksCompleted, tasksOpen, inicioISO, l0, lj, l1, l1b, l2, l2b, l3, l3b]);
}
