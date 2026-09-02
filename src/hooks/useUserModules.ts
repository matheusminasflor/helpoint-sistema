import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { ModuleId } from '@/types/database';

interface UserModuleAccess {
  id: string;
  tenant_id: string;
  user_id: string;
  module: string;
  granted_by: string | null;
  granted_at: string;
}

export function useMyModules() {
  const { user, tenantId } = useAuth();

  return useQuery({
    queryKey: ['my-modules', user?.id],
    queryFn: async (): Promise<ModuleId[]> => {
      if (!user?.id || !tenantId) return [];

      const { data, error } = await supabase
        .from('user_module_access')
        .select('module')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user modules:', error);
        return [];
      }

      return (data || []).map(d => d.module as ModuleId);
    },
    enabled: !!user?.id && !!tenantId,
  });
}

export function useUserModules(userId: string | null) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['user-modules', userId],
    queryFn: async (): Promise<ModuleId[]> => {
      if (!userId || !tenantId) return [];

      const { data, error } = await supabase
        .from('user_module_access')
        .select('module')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user modules:', error);
        return [];
      }

      return (data || []).map(d => d.module as ModuleId);
    },
    enabled: !!userId && !!tenantId,
  });
}

export function useAllUserModules() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['all-user-modules', tenantId],
    queryFn: async (): Promise<UserModuleAccess[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('user_module_access')
        .select('*');

      if (error) {
        console.error('Error fetching all user modules:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!tenantId,
  });
}

export function useUpdateUserModules() {
  const queryClient = useQueryClient();
  const { user, tenantId } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, modules }: { userId: string; modules: ModuleId[] }) => {
      // Delete existing modules
      const { error: deleteError } = await supabase
        .from('user_module_access')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new modules
      if (modules.length > 0 && tenantId) {
        const { error: insertError } = await supabase
          .from('user_module_access')
          .insert(
            modules.map(module => ({
              user_id: userId,
              module,
              granted_by: user?.id,
              tenant_id: tenantId,
            }))
          );

        if (insertError) throw insertError;
      }
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-modules', userId] });
      queryClient.invalidateQueries({ queryKey: ['all-user-modules'] });
      toast.success('Módulos atualizados com sucesso');
    },
    onError: (error) => {
      console.error('Error updating user modules:', error);
      toast.error('Erro ao atualizar módulos. Tente novamente ou avise o suporte.');
    },
  });
}
