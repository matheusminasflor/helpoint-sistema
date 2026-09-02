import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SocialPost, SocialPlatform, PostType, PostStatus } from '@/types/mkt';

interface CreatePostData {
  title: string;
  content?: string;
  platform: SocialPlatform;
  post_type?: PostType;
  scheduled_at?: string;
  status?: PostStatus;
  media_urls?: string[];
  hashtags?: string[];
  account_id?: string | null;
  external_link?: string | null;
  strategy_notes?: string | null;
  notes?: string;
}

interface UpdatePostData extends Partial<CreatePostData> {
  id: string;
  published_at?: string;
}

export function useMKTSocialPosts() {
  return useQuery({
    queryKey: ['mkt-social-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_social_posts')
        .select('*')
        .order('scheduled_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data || []) as unknown as SocialPost[];
    },
  });
}

export function useMKTSocialPost(id: string | undefined) {
  return useQuery({
    queryKey: ['mkt-social-post', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('mkt_social_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as SocialPost;
    },
    enabled: !!id,
  });
}

export function useCreateSocialPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePostData) => {
      const insertData = {
        title: data.title,
        content: data.content,
        platform: data.platform,
        post_type: data.post_type || 'feed',
        scheduled_at: data.scheduled_at,
        status: data.status || 'draft',
        media_urls: data.media_urls || [],
        hashtags: data.hashtags || [],
        account_id: data.account_id ?? null,
        external_link: data.external_link ?? null,
        strategy_notes: data.strategy_notes ?? null,
        notes: data.notes,
      } as any;

      const { data: result, error } = await supabase
        .from('mkt_social_posts')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-posts'] });
      toast.success('Post criado com sucesso');
    },
    onError: (error: Error) => toast.error('Erro ao criar post: ' + error.message),
  });
}

export function useUpdateSocialPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdatePostData) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('mkt_social_posts')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-posts'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-social-post', variables.id] });
      toast.success('Post atualizado');
    },
    onError: (error: Error) => toast.error('Erro ao atualizar: ' + error.message),
  });
}

export function useDeleteSocialPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mkt_social_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-posts'] });
      toast.success('Post removido');
    },
    onError: (error: Error) => toast.error('Erro ao remover: ' + error.message),
  });
}

export function usePublishPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: result, error } = await supabase
        .from('mkt_social_posts')
        .update({ status: 'published', published_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-posts'] });
      toast.success('Post marcado como publicado');
    },
    onError: (error: Error) => toast.error('Erro: ' + error.message),
  });
}
