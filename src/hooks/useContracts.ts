import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SoftwareContract, ContractStatus } from '@/types/it-management';
import { useAuth } from '@/contexts/AuthContext';
import { todayISO, toLocalISODate } from '@/lib/dates';

function calculateContractStatus(contract: SoftwareContract): ContractStatus {
  if (contract.status === 'cancelled') return 'cancelled';
  
  const today = new Date();
  const endDate = new Date(contract.end_date);
  const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= contract.renewal_alert_days) return 'expiring';
  return 'active';
}

export function useContracts() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['contracts', tenantId],
    queryFn: async (): Promise<SoftwareContract[]> => {
      const { data, error } = await supabase
        .from('software_contracts')
        .select('*')
        .order('end_date');

      if (error) throw error;

      // Calculate real-time status based on dates
      return (data as SoftwareContract[]).map(contract => ({
        ...contract,
        status: calculateContractStatus(contract),
      }));
    },
  });
}

export function useContractById(id: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['contract', tenantId, id],
    queryFn: async (): Promise<SoftwareContract | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('software_contracts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      const contract = data as SoftwareContract;
      return {
        ...contract,
        status: calculateContractStatus(contract),
      };
    },
    enabled: !!id,
  });
}

export function useExpiringContracts(days: number = 30) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['contracts', tenantId, 'expiring', days],
    queryFn: async (): Promise<SoftwareContract[]> => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const { data, error } = await supabase
        .from('software_contracts')
        .select('*')
        .lte('end_date', toLocalISODate(futureDate))
        .gte('end_date', todayISO())
        .neq('status', 'cancelled')
        .order('end_date');

      if (error) throw error;

      return (data as SoftwareContract[]).map(contract => ({
        ...contract,
        status: calculateContractStatus(contract),
      }));
    },
  });
}

export function useContractMutations() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const createContract = useMutation({
    mutationFn: async (contract: Omit<SoftwareContract, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('software_contracts')
        .insert(contract as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });

  const updateContract = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SoftwareContract> & { id: string }) => {
      const { data, error } = await supabase
        .from('software_contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', tenantId, variables.id] });
    },
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('software_contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });

  return {
    createContract,
    updateContract,
    deleteContract,
  };
}
