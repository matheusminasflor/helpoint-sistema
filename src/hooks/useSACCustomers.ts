import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SACCustomerRow {
  id: string;
  user_id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  cnpj: string | null;
  razao_social: string | null;
  is_blocked: boolean;
  created_at: string;
}

export function useSACCustomers() {
  return useQuery({
    queryKey: ['sac-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select(
          'id,user_id,tenant_id,full_name,email,phone,whatsapp,document,cnpj,razao_social,is_blocked,created_at',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SACCustomerRow[];
    },
  });
}

export function useUpdateSACCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SACCustomerRow> }) => {
      const { error } = await supabase.from('customer_profiles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cliente atualizado.');
      qc.invalidateQueries({ queryKey: ['sac-customers'] });
    },
    onError: (e: any) => toast.error('Erro ao atualizar: ' + e.message),
  });
}

export function useToggleBlockSACCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, block }: { id: string; block: boolean }) => {
      const { error } = await supabase
        .from('customer_profiles')
        .update({
          is_blocked: block,
          blocked_at: block ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.block ? 'Cliente bloqueado.' : 'Cliente desbloqueado.');
      qc.invalidateQueries({ queryKey: ['sac-customers'] });
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useResetSACCustomerPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/sac/entrar`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('E-mail de acesso enviado ao cliente.'),
    onError: (e: any) => toast.error('Não foi possível enviar: ' + e.message),
  });
}

export function useDeleteSACCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer_user_id: string) => {
      const { data, error } = await supabase.functions.invoke('sac-delete-customer', {
        body: { customer_user_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success('Cliente excluído.');
      qc.invalidateQueries({ queryKey: ['sac-customers'] });
    },
    onError: (e: any) => toast.error('Erro ao excluir: ' + e.message),
  });
}
