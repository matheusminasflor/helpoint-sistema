import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MKTAIGeneration, MKTAIGenerationType } from '@/types/mkt-expanded';

interface GenerateAIContentParams {
  type: MKTAIGenerationType;
  prompt: string;
  post_id?: string;
  event_id?: string;
  source_image?: string; // base64 data URL for image editing
}

interface SaveGenerationData {
  type: MKTAIGenerationType;
  prompt: string;
  result: string;
  model_used: string;
  post_id?: string;
  event_id?: string;
  accepted?: boolean;
}

export function useMKTAIGenerations() {
  return useQuery({
    queryKey: ['mkt-ai-generations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_ai_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as MKTAIGeneration[];
    },
  });
}

export function useMKTAIGenerationsByPost(postId: string | undefined) {
  return useQuery({
    queryKey: ['mkt-ai-generations-post', postId],
    queryFn: async () => {
      if (!postId) return [];
      const { data, error } = await supabase
        .from('mkt_ai_generations')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as MKTAIGeneration[];
    },
    enabled: !!postId,
  });
}

export function useGenerateAIContent() {
  return useMutation({
    mutationFn: async (params: GenerateAIContentParams) => {
      const response = await supabase.functions.invoke('mkt-ai-creative', {
        body: params,
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    onError: (error: any) => {
      if (error?.status === 429) {
        toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
      } else if (error?.status === 402) {
        toast.error('Créditos insuficientes. Adicione créditos ao workspace.');
      } else {
        toast.error('Erro ao gerar conteúdo: ' + (error.message || 'Erro desconhecido'));
      }
    },
  });
}

export function useSaveAIGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SaveGenerationData) => {
      const insertData = {
        type: data.type,
        prompt: data.prompt,
        result: data.result,
        model_used: data.model_used,
        post_id: data.post_id,
        event_id: data.event_id,
        accepted: data.accepted ?? false,
      } as any;
      
      const { data: result, error } = await supabase
        .from('mkt_ai_generations')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-ai-generations'] });
    },
    onError: (error) => {
      console.error('Error saving AI generation:', error);
    },
  });
}

export function useAcceptAIGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: result, error } = await supabase
        .from('mkt_ai_generations')
        .update({ accepted: true })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-ai-generations'] });
      toast.success('Conteúdo aceito');
    },
    onError: (error) => {
      toast.error('Erro ao aceitar conteúdo: ' + error.message);
    },
  });
}
