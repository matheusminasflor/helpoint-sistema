import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MetricsFilter, getDateRangeFromPeriod } from './useHelpdeskMetrics';
import { useAuth } from '@/contexts/AuthContext';

export interface TechnicianMetrics {
  id: string;
  name: string;
  email: string;
  ticketsResolved: number;
  avgResolutionTime: number; // in hours
  slaCompliance: number; // percentage
  avgSatisfaction: number; // 1-5
  activeTickets: number;
  totalAssigned: number;
}

export function useTechnicianPerformance(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['technician-performance', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString()],
    queryFn: async (): Promise<TechnicianMetrics[]> => {
      // Get all tickets assigned in the period
      const { data: tickets, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString())
        .not('assigned_to', 'is', null);

      if (ticketError) throw ticketError;

      // Extract unique assignee IDs
      const assigneeIds = [...new Set(tickets?.map(t => t.assigned_to).filter(Boolean) as string[])];
      if (assigneeIds.length === 0) return [];

      // Fetch profiles for those assignees
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', assigneeIds);

      if (profileError) throw profileError;

      // Build metrics map from profiles
      const metricsMap: Record<string, TechnicianMetrics> = {};

      (profiles || []).forEach(p => {
        metricsMap[p.id] = {
          id: p.id,
          name: p.full_name || '',
          email: p.email,
          ticketsResolved: 0,
          avgResolutionTime: 0,
          slaCompliance: 0,
          avgSatisfaction: 0,
          activeTickets: 0,
          totalAssigned: 0,
        };
      });

      // Group tickets by technician
      const techTickets: Record<string, typeof tickets> = {};
      
      tickets?.forEach(ticket => {
        if (ticket.assigned_to && metricsMap[ticket.assigned_to]) {
          if (!techTickets[ticket.assigned_to]) {
            techTickets[ticket.assigned_to] = [];
          }
          techTickets[ticket.assigned_to].push(ticket);
        }
      });

      // Calculate metrics
      Object.entries(techTickets).forEach(([techId, techTicketList]) => {
        const metrics = metricsMap[techId];
        if (!metrics || !techTicketList) return;

        let resolvedCount = 0;
        let totalResolutionTime = 0;
        let slaMetCount = 0;
        let satisfactionSum = 0;
        let satisfactionCount = 0;

        techTicketList.forEach(ticket => {
          metrics.totalAssigned++;

          // Count resolved
          if (ticket.status === 'resolved' || ticket.status === 'closed') {
            resolvedCount++;

            // Resolution time
            if (ticket.resolved_at && ticket.created_at) {
              const created = new Date(ticket.created_at);
              const resolved = new Date(ticket.resolved_at);
              totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
            }

            // SLA compliance
            if (ticket.sla_due_at && ticket.resolved_at) {
              const slaDue = new Date(ticket.sla_due_at);
              const resolved = new Date(ticket.resolved_at);
              if (resolved <= slaDue) {
                slaMetCount++;
              }
            }
          }

          // Active tickets
          if (['open', 'in_progress', 'waiting_user', 'waiting_parts'].includes(ticket.status)) {
            metrics.activeTickets++;
          }

          // Satisfaction
          if (ticket.satisfaction_rating) {
            satisfactionSum += ticket.satisfaction_rating;
            satisfactionCount++;
          }
        });

        metrics.ticketsResolved = resolvedCount;
        metrics.avgResolutionTime = resolvedCount > 0 
          ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 
          : 0;
        metrics.slaCompliance = resolvedCount > 0 
          ? Math.round((slaMetCount / resolvedCount) * 100) 
          : 0;
        metrics.avgSatisfaction = satisfactionCount > 0 
          ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 
          : 0;
      });

      // Return only technicians who have at least one assigned ticket
      return Object.values(metricsMap)
        .filter(m => m.totalAssigned > 0)
        .sort((a, b) => b.ticketsResolved - a.ticketsResolved);
    },
  });
}
