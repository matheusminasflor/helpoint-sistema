import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SoftwareContract, ContractStatus } from '@/types/it-management';

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
  return useQuery({
    queryKey: ['contracts'],
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
  return useQuery({
    queryKey: ['contract', id],
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
  return useQuery({
    queryKey: ['contracts', 'expiring', days],
    queryFn: async (): Promise<SoftwareContract[]> => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      
      const { data, error } = await supabase
        .from('software_contracts')
        .select('*')
        .lte('end_date', futureDate.toISOString().split('T')[0])
        .gte('end_date', new Date().toISOString().split('T')[0])
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
      queryClient.invalidateQueries({ queryKey: ['contract', variables.id] });
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
