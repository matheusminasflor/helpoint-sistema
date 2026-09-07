import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MetricsFilter, getDateRangeFromPeriod } from './useHelpdeskMetrics';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface RequesterTicket {
  id: string;
  ticket_number: number;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  created_at: string;
  assigned_to_name: string | null;
}

export function useRequesterTickets(requesterId: string | null, filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['requester-tickets', tenantId, requesterId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString()],
    queryFn: async (): Promise<RequesterTicket[]> => {
      if (!requesterId) return [];

      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, title, category, priority, status, created_at, assigned_to')
        .eq('requester_id', requesterId)
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!tickets || tickets.length === 0) return [];

      // Get unique assigned_to IDs
      const assignedIds = [...new Set(tickets.map(t => t.assigned_to).filter(Boolean))] as string[];
      
      let profilesMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const profiles = unwrap(await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', assignedIds));
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name || 'Sem nome']));
        }
      }

      return tickets.map(t => ({
        id: t.id,
        ticket_number: t.ticket_number,
        title: t.title,
        category: t.category,
        priority: t.priority,
        status: t.status,
        created_at: t.created_at,
        assigned_to_name: t.assigned_to ? (profilesMap[t.assigned_to] || null) : null,
      }));
    },
    enabled: !!requesterId,
  });
}

export interface RequesterMetric {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  ticket_count: number;
  urgent_count: number;
  categories: string[];
}

export function useTopRequesters(filter?: MetricsFilter, limit = 10) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['top-requesters', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), limit],
    queryFn: async (): Promise<RequesterMetric[]> => {
      // First, get all tickets with requester info
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          requester_id,
          priority,
          category
        `)
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString());

      if (error) throw error;
      if (!tickets || tickets.length === 0) return [];

      // Group tickets by requester
      const requesterMap: Record<string, {
        count: number;
        urgent: number;
        categories: Set<string>;
      }> = {};

      tickets.forEach(ticket => {
        const id = ticket.requester_id;
        if (!requesterMap[id]) {
          requesterMap[id] = { count: 0, urgent: 0, categories: new Set() };
        }
        requesterMap[id].count++;
        if (ticket.priority === 'critical' || ticket.priority === 'high') {
          requesterMap[id].urgent++;
        }
        if (ticket.category) {
          requesterMap[id].categories.add(ticket.category);
        }
      });

      // Get unique requester IDs sorted by count
      const sortedIds = Object.entries(requesterMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([id]) => id);

      if (sortedIds.length === 0) return [];

      // Fetch profile info for top requesters
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, department')
        .in('id', sortedIds);

      if (profilesError) throw profilesError;

      // Combine data
      const result: RequesterMetric[] = sortedIds.map(id => {
        const profile = profiles?.find(p => p.id === id);
        const metrics = requesterMap[id];
        return {
          id,
          full_name: profile?.full_name || null,
          email: profile?.email || 'Desconhecido',
          department: profile?.department || null,
          ticket_count: metrics.count,
          urgent_count: metrics.urgent,
          categories: Array.from(metrics.categories),
        };
      });

      return result;
    },
  });
}
