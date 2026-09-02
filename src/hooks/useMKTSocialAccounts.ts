import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MKTSocialAccount } from '@/types/mkt-expanded';
import type { SocialPlatform } from '@/types/mkt';

interface CreateSocialAccountData {
  platform: SocialPlatform;
  account_name: string;
  account_id?: string;
  page_id?: string;
  token_expires_at?: string;
  is_active?: boolean;
}

interface UpdateSocialAccountData extends Partial<CreateSocialAccountData> {
  id: string;
  last_sync_at?: string;
}

export function useMKTSocialAccounts() {
  return useQuery({
    queryKey: ['mkt-social-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_social_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as MKTSocialAccount[];
    },
  });
}

export function useMKTSocialAccount(id: string | undefined) {
  return useQuery({
    queryKey: ['mkt-social-account', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('mkt_social_accounts')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as MKTSocialAccount;
    },
    enabled: !!id,
  });
}

export function useMKTActiveSocialAccounts() {
  return useQuery({
    queryKey: ['mkt-social-accounts-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_social_accounts')
        .select('*')
        .eq('is_active', true)
        .order('account_name', { ascending: true });
      
      if (error) throw error;
      return data as MKTSocialAccount[];
    },
  });
}

export function useMKTSocialAccountsByPlatform(platform: SocialPlatform) {
  return useQuery({
    queryKey: ['mkt-social-accounts-platform', platform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_social_accounts')
        .select('*')
        .eq('platform', platform)
        .eq('is_active', true)
        .order('account_name', { ascending: true });
      
      if (error) throw error;
      return data as MKTSocialAccount[];
    },
  });
}

export function useCreateMKTSocialAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSocialAccountData) => {
      const insertData = {
        platform: data.platform,
        account_name: data.account_name,
        account_id: data.account_id,
        page_id: data.page_id,
        token_expires_at: data.token_expires_at,
        is_active: data.is_active ?? true,
      } as any;
      
      const { data: result, error } = await supabase
        .from('mkt_social_accounts')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-accounts'] });
      toast.success('Conta social conectada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao conectar conta: ' + error.message);
    },
  });
}

export function useUpdateMKTSocialAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSocialAccountData) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('mkt_social_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-social-account', variables.id] });
      toast.success('Conta atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar conta: ' + error.message);
    },
  });
}

export function useDeleteMKTSocialAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mkt_social_accounts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-accounts'] });
      toast.success('Conta removida com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover conta: ' + error.message);
    },
  });
}

export function useRefreshSocialAccountToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // This would call an edge function to refresh the Meta token
      const response = await supabase.functions.invoke('mkt-meta-refresh-token', {
        body: { account_id: id },
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-social-account', id] });
      toast.success('Token atualizado com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar token: ' + (error.message || 'Erro desconhecido'));
    },
  });
}
