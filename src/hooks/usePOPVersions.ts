import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface POPVersion {
  id: string;
  tenant_id: string;
  pop_id: string;
  version_number: number;
  title: string;
  content: string;
  category: string | null;
  subcategory: string | null;
  keywords: string[];
  created_by: string | null;
  created_at: string;
  change_summary: string | null;
  author?: {
    full_name: string | null;
  };
}

export function usePOPVersions(popId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pop-versions', tenantId, popId],
    queryFn: async (): Promise<POPVersion[]> => {
      if (!popId) return [];

      const { data, error } = await supabase
        .from('pop_versions')
        .select(`
          *,
          author:profiles!pop_versions_created_by_fkey(full_name)
        `)
        .eq('pop_id', popId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      return (data || []) as POPVersion[];
    },
    enabled: !!popId,
  });
}

export function usePOPVersion(versionId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pop-version', tenantId, versionId],
    queryFn: async (): Promise<POPVersion | null> => {
      if (!versionId) return null;

      const { data, error } = await supabase
        .from('pop_versions')
        .select(`
          *,
          author:profiles!pop_versions_created_by_fkey(full_name)
        `)
        .eq('id', versionId)
        .single();

      if (error) throw error;
      return data as POPVersion;
    },
    enabled: !!versionId,
  });
}

interface CreateVersionParams {
  popId: string;
  data: {
    title: string;
    content: string;
    category?: string | null;
    subcategory?: string | null;
    keywords?: string[];
  };
  changeSummary?: string;
}

export function useCreatePOPVersion() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ popId, data, changeSummary }: CreateVersionParams): Promise<POPVersion> => {
      // Get user info
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      const profile = unwrap(await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single());

      if (!profile?.tenant_id) throw new Error('User not associated with tenant');

      // Get latest version number
      const latest = unwrap(await supabase
        .from('pop_versions')
        .select('version_number')
        .eq('pop_id', popId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle());

      const nextVersion = (latest?.version_number || 0) + 1;

      // Insert new version
      const { data: version, error } = await supabase
        .from('pop_versions')
        .insert({
          tenant_id: profile.tenant_id,
          pop_id: popId,
          version_number: nextVersion,
          title: data.title,
          content: data.content,
          category: data.category || null,
          subcategory: data.subcategory || null,
          keywords: data.keywords || [],
          change_summary: changeSummary || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return version as POPVersion;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pop-versions', tenantId, variables.popId] });
    },
    onError: (error) => {
      console.error('Error creating version:', error);
      toast.error('Erro ao criar versão. Tente novamente ou avise o suporte.');
    },
  });
}

export function useRestorePOPVersion() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ versionId, popId }: { versionId: string; popId: string }): Promise<void> => {
      // Get the version to restore
      const { data: version, error: versionError } = await supabase
        .from('pop_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionError) throw versionError;

      // Update the POP with the version's data
      const { error: updateError } = await supabase
        .from('pops')
        .update({
          title: version.title,
          content: version.content,
          category: version.category,
          subcategory: version.subcategory,
          keywords: version.keywords,
        })
        .eq('id', popId);

      if (updateError) throw updateError;
    },
    onSuccess: (_, { popId }) => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
      queryClient.invalidateQueries({ queryKey: ['pop-versions', tenantId, popId] });
      toast.success('Versão restaurada com sucesso');
    },
    onError: (error) => {
      console.error('Error restoring version:', error);
      toast.error('Erro ao restaurar versão. Tente novamente ou avise o suporte.');
    },
  });
}
