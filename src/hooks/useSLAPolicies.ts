import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface SLAPolicy {
  id: string;
  tenant_id: string;
  name: string;
  priority: string;
  first_response_time: number;
  resolution_time: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSLAPolicies() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['sla-policies', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_policies')
        .select('*')
        .order('resolution_time', { ascending: true });

      if (error) throw error;
      return data as SLAPolicy[];
    },
  });

  const updatePolicy = useMutation({
    mutationFn: async (updates: {
      id: string;
      name?: string;
      first_response_time?: number;
      resolution_time?: number;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = updates;
      const { error } = await supabase
        .from('sla_policies')
        .update(rest)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast.success('Política de SLA atualizada');
    },
    onError: () => {
      toast.error('Erro ao atualizar política de SLA. Tente novamente ou avise o suporte.');
    },
  });

  return { policies, isLoading, updatePolicy };
}
