import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface POPFeedback {
  id: string;
  tenant_id: string;
  pop_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  is_helpful: boolean | null;
  created_at: string;
  user?: {
    full_name: string | null;
  };
}

export interface POPFeedbackInsert {
  pop_id: string;
  rating: number;
  comment?: string;
  suggestion?: string;
  is_helpful?: boolean;
}

export function usePOPFeedbacks(popId: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pop-feedbacks', tenantId, popId],
    queryFn: async (): Promise<POPFeedback[]> => {
      const { data, error } = await supabase
        .from('pop_feedbacks')
        .select('*')
        .eq('pop_id', popId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as POPFeedback[];
    },
    enabled: !!popId,
  });
}

export function useAllPOPFeedbacks() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pop-feedbacks', tenantId, 'all'],
    queryFn: async (): Promise<POPFeedback[]> => {
      const { data, error } = await supabase
        .from('pop_feedbacks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch user names separately to avoid join issues
      const userIds = [...new Set((data || []).map(f => f.user_id))];

      if (userIds.length > 0) {
        const profiles = unwrap(await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds));
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        
        return (data || []).map(f => ({
          ...f,
          user: { full_name: profileMap.get(f.user_id) || null }
        })) as POPFeedback[];
      }
      
      return (data || []) as POPFeedback[];
    },
  });
}

export function useCreatePOPFeedback() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: POPFeedbackInsert): Promise<void> => {
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      // Get tenant_id from profile
      const profile = unwrap(await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single());

      if (!profile) throw new Error('Profile not found');

      const { error } = await supabase
        .from('pop_feedbacks')
        .insert([{
          tenant_id: profile.tenant_id,
          pop_id: data.pop_id,
          user_id: user.id,
          rating: data.rating,
          comment: data.comment || null,
          suggestion: data.suggestion || null,
          is_helpful: data.is_helpful ?? null,
        }]);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
      queryClient.invalidateQueries({ queryKey: ['pop-feedbacks', tenantId, variables.pop_id] });
      queryClient.invalidateQueries({ queryKey: ['pop-effectiveness'] });
      toast.success('Feedback enviado! Obrigado pela sua avaliação.');
    },
    onError: (error) => {
      console.error('Error creating feedback:', error);
      toast.error('Erro ao enviar feedback. Tente novamente ou avise o suporte.');
    },
  });
}

export interface POPEffectivenessMetrics {
  resolutionRate: number;
  avgRating: number;
  totalViews: number;
  totalSolved: number;
  totalFeedbacks: number;
  topPOPs: Array<{
    id: string;
    title: string;
    views_count: number;
    solved_count: number;
    avg_rating: number | null;
    rate: number;
  }>;
  recentSuggestions: Array<{
    pop_id: string;
    pop_title: string;
    suggestion: string;
    created_at: string;
    user_name: string | null;
  }>;
}

export function usePOPEffectivenessMetrics() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pop-effectiveness', tenantId],
    queryFn: async (): Promise<POPEffectivenessMetrics> => {
      // Get POPs with counts
      const pops = unwrap(await supabase
        .from('pops')
        .select('id, title, views_count, solved_count, avg_rating')
        .eq('is_active', true));

      // Get feedbacks count
      const { count: totalFeedbacks } = await supabase
        .from('pop_feedbacks')
        .select('*', { count: 'exact', head: true });

      // Get suggestions
      const suggestionsData = unwrap(await supabase
        .from('pop_feedbacks')
        .select('pop_id, suggestion, created_at, user_id')
        .not('suggestion', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10));

      // Fetch user names separately
      const userIds = [...new Set((suggestionsData || []).map(s => s.user_id))];
      let profileMap = new Map<string, string | null>();

      if (userIds.length > 0) {
        const profiles = unwrap(await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds));
        profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      }

      const totalViews = pops?.reduce((s, p) => s + (p.views_count || 0), 0) || 0;
      const totalSolved = pops?.reduce((s, p) => s + (p.solved_count || 0), 0) || 0;
      
      const popsWithRating = pops?.filter(p => p.avg_rating != null) || [];
      const avgRating = popsWithRating.length > 0
        ? popsWithRating.reduce((s, p) => s + (Number(p.avg_rating) || 0), 0) / popsWithRating.length
        : 0;

      const resolutionRate = totalViews > 0
        ? Math.round((totalSolved / totalViews) * 100)
        : 0;

      const topPOPs = (pops || [])
        .map(p => ({
          ...p,
          views_count: p.views_count || 0,
          solved_count: p.solved_count || 0,
          rate: p.views_count ? (p.solved_count || 0) / p.views_count * 100 : 0,
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 5);

      // Map suggestions with POP titles
      const popMap = new Map((pops || []).map(p => [p.id, p.title]));
      const recentSuggestions = (suggestionsData || []).map(s => ({
        pop_id: s.pop_id,
        pop_title: popMap.get(s.pop_id) || 'POP Desconhecido',
        suggestion: s.suggestion || '',
        created_at: s.created_at || '',
        user_name: profileMap.get(s.user_id) || null,
      }));

      return {
        resolutionRate,
        avgRating: Math.round(avgRating * 10) / 10,
        totalViews,
        totalSolved,
        totalFeedbacks: totalFeedbacks || 0,
        topPOPs,
        recentSuggestions,
      };
    },
  });
}
