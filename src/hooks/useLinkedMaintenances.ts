import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MaintenanceWithDetails } from '@/types/it-management';
import { useAuth } from '@/contexts/AuthContext';

export function useMaintenancesByTicket(ticketId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['maintenances', tenantId, 'ticket', ticketId],
    queryFn: async (): Promise<MaintenanceWithDetails[]> => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from('asset_maintenances')
        .select(`
          *,
          asset:assets(id, name, asset_tag, category),
          technician:profiles!asset_maintenances_technician_id_fkey(id, full_name, email)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(m => ({
        ...m,
        asset: m.asset,
        technician: m.technician,
      })) as MaintenanceWithDetails[];
    },
    enabled: !!ticketId,
  });
}

export function useTicketByMaintenance(ticketId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ticket', tenantId, 'for-maintenance', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;

      const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, title, status, priority')
        .eq('id', ticketId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!ticketId,
  });
}

export function useLinkedMaintenanceMutations() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const linkMaintenanceToTicket = useMutation({
    mutationFn: async ({ maintenanceId, ticketId }: { maintenanceId: string; ticketId: string }) => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .update({ ticket_id: ticketId })
        .eq('id', maintenanceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['maintenances', tenantId, 'ticket', variables.ticketId] });
    },
  });

  const unlinkMaintenance = useMutation({
    mutationFn: async (maintenanceId: string) => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .update({ ticket_id: null })
        .eq('id', maintenanceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    },
  });

  return { linkMaintenanceToTicket, unlinkMaintenance };
}

export function useOpenTickets() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tickets', tenantId, 'open-for-linking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, title, status')
        .in('status', ['open', 'in_progress', 'waiting_user', 'waiting_parts'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });
}
