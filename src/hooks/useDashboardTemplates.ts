import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DashboardTemplate {
  id: string;
  name: string;
  active_tab: string;
  selected_period: string;
  technician_filter: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface TemplateConfig {
  active_tab: string;
  selected_period: string;
  technician_filter?: string | null;
}

export function useDashboardTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  const { data: templates, isLoading } = useQuery({
    queryKey: ['dashboard-templates', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_view_templates' as any)
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as DashboardTemplate[];
    },
    enabled: !!tenantId,
  });

  const defaultTemplate = templates?.find(t => t.is_default) || null;

  const saveTemplate = useMutation({
    mutationFn: async ({ name, config }: { name: string; config: TemplateConfig }) => {
      const { data, error } = await supabase
        .from('dashboard_view_templates' as any)
        .insert({
          tenant_id: tenantId,
          user_id: profile?.id,
          name,
          active_tab: config.active_tab,
          selected_period: config.selected_period,
          technician_filter: config.technician_filter || null,
          is_default: !templates?.length, // first template is default
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-templates'] });
      toast.success('Visão salva com sucesso');
    },
    onError: () => toast.error('Erro ao salvar visão. Tente novamente ou avise o suporte.'),
  });

  const setAsDefault = useMutation({
    mutationFn: async (templateId: string) => {
      // Remove default from all
      await supabase
        .from('dashboard_view_templates' as any)
        .update({ is_default: false } as any)
        .neq('id', templateId);
      // Set this as default
      const { error } = await supabase
        .from('dashboard_view_templates' as any)
        .update({ is_default: true } as any)
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-templates'] });
      toast.success('Visão padrão atualizada');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('dashboard_view_templates' as any)
        .delete()
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-templates'] });
      toast.success('Visão removida');
    },
  });

  return {
    templates: templates || [],
    defaultTemplate,
    isLoading,
    saveTemplate,
    setAsDefault,
    deleteTemplate,
  };
}
