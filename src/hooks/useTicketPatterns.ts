import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface TicketPattern {
  id: string;
  tenant_id: string;
  pattern_name: string;
  description: string | null;
  category: string | null;
  occurrence_count: number;
  sample_ticket_ids: string[];
  suggested_pop_id: string | null;
  keywords: string[];
  is_reviewed: boolean;
  last_occurrence: string;
  created_at: string;
  updated_at: string;
}

export interface DetectedPattern {
  pattern_name: string;
  description: string;
  category: string | null;
  keywords: string[];
  ticket_ids: string[];
  occurrence_count: number;
  suggested_pop: string;
}

export interface AnalyzeResult {
  patterns: DetectedPattern[];
  analyzed_tickets: number;
  period_days: number;
}

export function useTicketPatterns() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ticket-patterns', tenantId],
    queryFn: async (): Promise<TicketPattern[]> => {
      const { data, error } = await supabase
        .from('ticket_patterns')
        .select('*')
        .order('occurrence_count', { ascending: false });

      if (error) throw error;
      return (data || []) as TicketPattern[];
    },
  });
}

export function useAnalyzePatterns(module?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<AnalyzeResult> => {
      const { data, error } = await supabase.functions.invoke('ai-analyze-patterns', {
        body: module ? { module } : {},
      });

      if (error) throw error;
      return data as AnalyzeResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-patterns'] });
      if (data.patterns.length === 0) {
        toast.info('Nenhum padrão significativo detectado');
      } else {
        toast.success(`${data.patterns.length} padrões detectados em ${data.analyzed_tickets} chamados`);
      }
    },
    onError: (error) => {
      console.error('Error analyzing patterns:', error);
      toast.error('Erro ao analisar padrões. Tente novamente ou avise o suporte.');
    },
  });
}

export function useSavePattern() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pattern: DetectedPattern): Promise<TicketPattern> => {
      // Get user's tenant_id first
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      const profile = unwrap(await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single());

      if (!profile?.tenant_id) throw new Error('User not associated with tenant');

      const { data, error } = await supabase
        .from('ticket_patterns')
        .insert({
          tenant_id: profile.tenant_id,
          pattern_name: pattern.pattern_name,
          description: pattern.description,
          category: pattern.category,
          keywords: pattern.keywords,
          sample_ticket_ids: pattern.ticket_ids,
          occurrence_count: pattern.occurrence_count,
          is_reviewed: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TicketPattern;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-patterns'] });
      toast.success('Padrão salvo com sucesso');
    },
    onError: (error) => {
      console.error('Error saving pattern:', error);
      toast.error('Erro ao salvar padrão. Tente novamente ou avise o suporte.');
    },
  });
}

export function useDeletePattern() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('ticket_patterns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-patterns'] });
      toast.success('Padrão excluído');
    },
    onError: (error) => {
      console.error('Error deleting pattern:', error);
      toast.error('Erro ao excluir padrão. Tente novamente ou avise o suporte.');
    },
  });
}
