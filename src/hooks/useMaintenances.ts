import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AssetMaintenance, MaintenanceWithDetails } from '@/types/it-management';

export function useMaintenances() {
  return useQuery({
    queryKey: ['maintenances'],
    queryFn: async (): Promise<MaintenanceWithDetails[]> => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .select(`
          *,
          asset:assets(id, name, asset_tag, category),
          technician:profiles!asset_maintenances_technician_id_fkey(id, full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(m => ({
        ...m,
        asset: m.asset,
        technician: m.technician,
      })) as MaintenanceWithDetails[];
    },
  });
}

export function useMaintenanceById(id: string | null) {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: async (): Promise<MaintenanceWithDetails | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('asset_maintenances')
        .select(`
          *,
          asset:assets(id, name, asset_tag, category),
          technician:profiles!asset_maintenances_technician_id_fkey(id, full_name, email)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      return {
        ...data,
        asset: data.asset,
        technician: data.technician,
      } as MaintenanceWithDetails;
    },
    enabled: !!id,
  });
}

export function useMaintenancesByAsset(assetId: string | null) {
  return useQuery({
    queryKey: ['maintenances', 'asset', assetId],
    queryFn: async (): Promise<MaintenanceWithDetails[]> => {
      if (!assetId) return [];

      const { data, error } = await supabase
        .from('asset_maintenances')
        .select(`
          *,
          asset:assets(id, name, asset_tag, category),
          technician:profiles!asset_maintenances_technician_id_fkey(id, full_name, email)
        `)
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(m => ({
        ...m,
        asset: m.asset,
        technician: m.technician,
      })) as MaintenanceWithDetails[];
    },
    enabled: !!assetId,
  });
}

export function useScheduledMaintenances() {
  return useQuery({
    queryKey: ['maintenances', 'scheduled'],
    queryFn: async (): Promise<MaintenanceWithDetails[]> => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .select(`
          *,
          asset:assets(id, name, asset_tag, category),
          technician:profiles!asset_maintenances_technician_id_fkey(id, full_name, email)
        `)
        .in('status', ['scheduled', 'in_progress'])
        .order('scheduled_date');

      if (error) throw error;

      return (data || []).map(m => ({
        ...m,
        asset: m.asset,
        technician: m.technician,
      })) as MaintenanceWithDetails[];
    },
  });
}

export function useMaintenanceMutations() {
  const queryClient = useQueryClient();

  const createMaintenance = useMutation({
    mutationFn: async (maintenance: Omit<AssetMaintenance, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .insert(maintenance as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    },
  });

  const updateMaintenance = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AssetMaintenance> & { id: string }) => {
      const { data, error } = await supabase
        .from('asset_maintenances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance', variables.id] });
    },
  });

  const deleteMaintenance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('asset_maintenances')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    },
  });

  return {
    createMaintenance,
    updateMaintenance,
    deleteMaintenance,
  };
}
