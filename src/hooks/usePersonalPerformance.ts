import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  streak: number;
  overdueItems: OverdueItem[];
  isLoading: boolean;
}

export function usePersonalPerformance(): PersonalPerformance {
  const { user } = useAuth();

  const sevenDaysAgoISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  // Tickets: resolved (last 7d) + still open assigned to me
  const { data: ticketResolved = [], isLoading: l1 } = useQuery({
    queryKey: ['personal-perf-tickets-resolved', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, resolved_at, sla_due_at, due_date, created_at')
        .eq('assigned_to', user!.id)
        .in('status', ['resolved', 'closed'])
        .gte('resolved_at', sevenDaysAgoISO)
        .order('resolved_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: ticketOpen = [], isLoading: l1b } = useQuery({
    queryKey: ['personal-perf-tickets-open', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, title, ticket_number, sla_due_at, due_date, status')
        .eq('assigned_to', user!.id)
        .not('status', 'in', '(resolved,closed)')
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  // Kanban removed — keep empty arrays for backwards compatibility
  const kanbanCompleted: { id: string; completed_at: string | null; due_date: string | null }[] = [];
  const l2 = false;
  const kanbanOpen: { id: string; title: string; due_date: string | null; completed_at: string | null }[] = [];
  const l2b = false;

  // Tasks: completed (last 7d) + open
  const { data: tasksCompleted = [], isLoading: l3 } = useQuery({
    queryKey: ['personal-perf-tasks-done', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, completed_at, due_date')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .gte('completed_at', sevenDaysAgoISO)
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: tasksOpen = [], isLoading: l3b } = useQuery({
    queryKey: ['personal-perf-tasks-open', user?.id],
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
    const resolvedToday =
      ticketResolved.filter(t => isToday(t.resolved_at)).length +
      kanbanCompleted.filter(c => isToday(c.completed_at)).length +
      tasksCompleted.filter(t => isToday(t.completed_at)).length;

    const resolvedThisWeek =
      ticketResolved.length + kanbanCompleted.length + tasksCompleted.length;

    // On-time rate (only items with a deadline)
    let totalWithDeadline = 0;
    let onTime = 0;

    ticketResolved.forEach(t => {
      const deadline = t.sla_due_at || t.due_date;
      if (deadline && t.resolved_at) {
        totalWithDeadline++;
        if (new Date(t.resolved_at) <= new Date(deadline)) onTime++;
      }
    });
    kanbanCompleted.forEach(c => {
      if (c.due_date && c.completed_at) {
        totalWithDeadline++;
        const due = new Date(c.due_date);
        due.setHours(23, 59, 59, 999);
        if (new Date(c.completed_at) <= due) onTime++;
      }
    });
    tasksCompleted.forEach(t => {
      if (t.due_date && t.completed_at) {
        totalWithDeadline++;
        const due = new Date(t.due_date);
        due.setHours(23, 59, 59, 999);
        if (new Date(t.completed_at) <= due) onTime++;
      }
    });

    const onTimeRate = totalWithDeadline > 0
      ? Math.round((onTime / totalWithDeadline) * 100)
      : null;

    // Streak
    const allDates = [
      ...ticketResolved.map(t => t.resolved_at),
      ...kanbanCompleted.map(c => c.completed_at),
      ...tasksCompleted.map(t => t.completed_at),
    ]
      .filter((d): d is string => !!d)
      .map(d => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      });
    const uniqueDays = new Set(allDates);

    let streak = 0;
    const checkDate = new Date(today);
    const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (!uniqueDays.has(todayKey)) checkDate.setDate(checkDate.getDate() - 1);

    for (let i = 0; i < 30; i++) {
      const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
      if (uniqueDays.has(key)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Overdue items (open, past their deadline)
    const overdueItems: OverdueItem[] = [];

    ticketOpen.forEach((t: any) => {
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
      overdueItems,
      isLoading: l1 || l1b || l2 || l2b || l3 || l3b,
    };
  }, [ticketResolved, ticketOpen, kanbanCompleted, kanbanOpen, tasksCompleted, tasksOpen, l1, l1b, l2, l2b, l3, l3b]);
}
