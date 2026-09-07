import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { toLocalISODate } from '@/lib/dates';

export interface TicketMetrics {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  slaCompliance: number;
  avgResolutionTime: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byCategoryAndStatus: Record<string, Record<string, number>>;
  // SLA violation metrics
  slaViolated: number;
  slaViolationRate: number;
  avgOverdueTime: number;
  violatedByPriority: Record<string, number>;
  violatedByCategory: Record<string, number>;
}

export interface TicketTrend {
  date: string;
  opened: number;
  resolved: number;
}

export interface MetricsFilter {
  period: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: Date;
  endDate?: Date;
  technicianId?: string;
  module?: string;
}

export function getPreviousPeriodRange(filter: MetricsFilter): { startDate: Date; endDate: Date } {
  const currentRange = getDateRangeFromPeriod(filter);
  const durationMs = currentRange.endDate.getTime() - currentRange.startDate.getTime();
  
  const previousEndDate = new Date(currentRange.startDate.getTime() - 1); // 1ms before current start
  const previousStartDate = new Date(previousEndDate.getTime() - durationMs);
  
  return { startDate: previousStartDate, endDate: previousEndDate };
}

export function getDateRangeFromPeriod(filter: MetricsFilter): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate = endOfDay(now);

  switch (filter.period) {
    case 'today':
      startDate = startOfDay(now);
      break;
    case '7d':
      startDate = startOfDay(subDays(now, 7));
      break;
    case '30d':
      startDate = startOfDay(subDays(now, 30));
      break;
    case '90d':
      startDate = startOfDay(subDays(now, 90));
      break;
    case 'custom':
      startDate = filter.startDate ? startOfDay(filter.startDate) : startOfDay(subDays(now, 30));
      endDate = filter.endDate ? endOfDay(filter.endDate) : endOfDay(now);
      break;
    default:
      startDate = startOfDay(subDays(now, 30));
  }

  return { startDate, endDate };
}

export function useTicketMetrics(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['ticket-metrics', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId],
    queryFn: async (): Promise<TicketMetrics> => {
      let query = supabase
        .from('tickets')
        .select('*')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const metrics: TicketMetrics = {
        total: tickets?.length || 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        slaCompliance: 0,
        avgResolutionTime: 0,
        byCategory: {},
        byPriority: {},
        byCategoryAndStatus: {},
        slaViolated: 0,
        slaViolationRate: 0,
        avgOverdueTime: 0,
        violatedByPriority: {},
        violatedByCategory: {},
      };

      if (!tickets || tickets.length === 0) return metrics;

      let slaMetCount = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      let totalOverdueTime = 0;
      const now = new Date();

      tickets.forEach((ticket) => {
        // Count by status
        switch (ticket.status) {
          case 'open':
            metrics.open++;
            break;
          case 'in_progress':
            metrics.inProgress++;
            break;
          case 'resolved':
            metrics.resolved++;
            break;
          case 'closed':
            metrics.closed++;
            break;
        }

        // Count by category
        const category = ticket.category || 'Sem categoria';
        metrics.byCategory[category] = (metrics.byCategory[category] || 0) + 1;

        // Count by category and status
        if (!metrics.byCategoryAndStatus[category]) {
          metrics.byCategoryAndStatus[category] = {};
        }
        const status = ticket.status || 'open';
        metrics.byCategoryAndStatus[category][status] = (metrics.byCategoryAndStatus[category][status] || 0) + 1;

        // Count by priority
        const priority = ticket.priority || 'medium';
        metrics.byPriority[priority] = (metrics.byPriority[priority] || 0) + 1;

        // SLA compliance and violations
        if (ticket.sla_due_at) {
          const slaDue = new Date(ticket.sla_due_at);
          // Marco final do SLA = resolved_at. Nunca closed_at/updated_at.
          const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at) : null;
          // Chamados resolvidos/fechados/cancelados estão fora do relógio de SLA.
          const slaRunning = !['resolved', 'closed', 'cancelled', 'rejected'].includes(ticket.status);

          if (resolvedAt && resolvedAt <= slaDue) {
            slaMetCount++;
          } else if (!resolvedAt && slaRunning && now <= slaDue) {
            slaMetCount++;
          }

          // Violações: apenas chamados com o relógio ainda correndo e prazo vencido
          if (slaRunning && now > slaDue) {
            metrics.slaViolated++;
            totalOverdueTime += (now.getTime() - slaDue.getTime()) / (1000 * 60 * 60);
            metrics.violatedByPriority[priority] = (metrics.violatedByPriority[priority] || 0) + 1;
            metrics.violatedByCategory[category] = (metrics.violatedByCategory[category] || 0) + 1;
          }
        }

        // Resolution time
        if (ticket.resolved_at && ticket.created_at) {
          const created = new Date(ticket.created_at);
          const resolved = new Date(ticket.resolved_at);
          totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          resolvedCount++;
        }
      });

      metrics.slaCompliance = metrics.total > 0 ? Math.round((slaMetCount / metrics.total) * 100) : 0;
      metrics.avgResolutionTime = resolvedCount > 0 ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 : 0;
      metrics.slaViolationRate = metrics.total > 0 ? Math.round((metrics.slaViolated / metrics.total) * 100) : 0;
      metrics.avgOverdueTime = metrics.slaViolated > 0 ? Math.round((totalOverdueTime / metrics.slaViolated) * 10) / 10 : 0;

      return metrics;
    },
  });
}

export function useTicketTrends(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['ticket-trends', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId],
    queryFn: async (): Promise<TicketTrend[]> => {
      let query = supabase
        .from('tickets')
        .select('created_at, resolved_at, status')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const trendMap: Record<string, TicketTrend> = {};

      // Initialize all dates in the range
      const currentDate = new Date(dateRange.startDate);
      while (currentDate <= dateRange.endDate) {
        const dateStr = toLocalISODate(currentDate);
        trendMap[dateStr] = { date: dateStr, opened: 0, resolved: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      tickets?.forEach((ticket) => {
        // Count opened
        if (ticket.created_at) {
          const openedDate = ticket.created_at.split('T')[0];
          if (trendMap[openedDate]) {
            trendMap[openedDate].opened++;
          }
        }

        // Count resolved
        if (ticket.resolved_at) {
          const resolvedDate = ticket.resolved_at.split('T')[0];
          if (trendMap[resolvedDate]) {
            trendMap[resolvedDate].resolved++;
          }
        }
      });

      const trends = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

      return trends;
    },
  });
}

export function usePreviousMetrics(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const previousRange = filter ? getPreviousPeriodRange(filter) : getPreviousPeriodRange({ period: '30d' });

  return useQuery({
    queryKey: ['ticket-metrics-previous', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId],
    queryFn: async (): Promise<TicketMetrics> => {
      let query = supabase
        .from('tickets')
        .select('*')
        .gte('created_at', previousRange.startDate.toISOString())
        .lte('created_at', previousRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const metrics: TicketMetrics = {
        total: tickets?.length || 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        slaCompliance: 0,
        avgResolutionTime: 0,
        byCategory: {},
        byPriority: {},
        byCategoryAndStatus: {},
        slaViolated: 0,
        slaViolationRate: 0,
        avgOverdueTime: 0,
        violatedByPriority: {},
        violatedByCategory: {},
      };

      if (!tickets || tickets.length === 0) return metrics;

      let slaMetCount = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;

      tickets.forEach((ticket) => {
        switch (ticket.status) {
          case 'open':
            metrics.open++;
            break;
          case 'in_progress':
            metrics.inProgress++;
            break;
          case 'resolved':
            metrics.resolved++;
            break;
          case 'closed':
            metrics.closed++;
            break;
        }

        const category = ticket.category || 'Sem categoria';
        metrics.byCategory[category] = (metrics.byCategory[category] || 0) + 1;

        if (!metrics.byCategoryAndStatus[category]) {
          metrics.byCategoryAndStatus[category] = {};
        }
        const status = ticket.status || 'open';
        metrics.byCategoryAndStatus[category][status] = (metrics.byCategoryAndStatus[category][status] || 0) + 1;

        const priority = ticket.priority || 'medium';
        metrics.byPriority[priority] = (metrics.byPriority[priority] || 0) + 1;

        if (ticket.sla_due_at) {
          const slaDue = new Date(ticket.sla_due_at);
          // Marco final do SLA = resolved_at.
          const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at) : null;
          if (resolvedAt && resolvedAt <= slaDue) {
            slaMetCount++;
          }
        }

        if (ticket.resolved_at && ticket.created_at) {
          const created = new Date(ticket.created_at);
          const resolved = new Date(ticket.resolved_at);
          totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          resolvedCount++;
        }
      });

      metrics.slaCompliance = metrics.total > 0 ? Math.round((slaMetCount / metrics.total) * 100) : 0;
      metrics.avgResolutionTime = resolvedCount > 0 ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 : 0;

      return metrics;
    },
  });
}

export function useViolatedSlaTickets() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tickets', tenantId, 'sla-violated'],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email),
          assigned:profiles!tickets_assigned_to_fkey(id, full_name, email)
        `)
        .lt('sla_due_at', now)
        .not('status', 'in', '("resolved","closed")')
        .order('sla_due_at');

      if (error) throw error;
      return data || [];
    },
  });
}

export function useTicketsByStatusList(filter: MetricsFilter, statuses: string[]) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tickets', tenantId, 'by-status-list', filter, statuses],
    queryFn: async () => {
      const { startDate, endDate } = getDateRangeFromPeriod(filter);
      let q = supabase
        .from('tickets')
        .select('id, ticket_number, title, status, priority, created_at, assigned_to, assignee:profiles!tickets_assigned_to_fkey(full_name, email)')
        .in('status', statuses as any)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (filter.module) q = q.eq('module', filter.module);
      if (filter.technicianId) q = q.eq('assigned_to', filter.technicianId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}
