import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

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
  /** Qual cliente do Comercial este cadastro diz ser. Afirmado, não provado. */
  com_cliente_codigo: string | null;
  /** O vínculo foi provado? Ver `sac_vincular_ao_cliente`. */
  vinculo_confirmado: boolean;
}

export function useSACCustomers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['sac-customers', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select(
          'id,user_id,tenant_id,full_name,email,phone,whatsapp,document,cnpj,razao_social,is_blocked,created_at,com_cliente_codigo,vinculo_confirmado',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SACCustomerRow[];
    },
  });
}

/**
 * Confirma que aquele cadastro de SAC é mesmo daquele cliente do Comercial.
 *
 * Existe para o caso do **e-mail novo**: quando a pessoa se cadastra com um e-mail
 * que não constava no cadastro do cliente, acertar o CNPJ não prova nada — CNPJ é
 * público — e o sistema registra o pedido sem revelar nada. Aqui quem atende olha e
 * decide, uma vez. Depois disso os dois cadastros ficam ligados.
 */
export function useConfirmarVinculoCliente() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (perfilId: string) => {
      const { data, error } = await supabase.rpc('sac_confirmar_vinculo', { p_perfil_id: perfilId });
      if (error) throw error;
      return data as { situacao: string; cliente?: string };
    },
    onSuccess: (r) => {
      toast.success(r.cliente ? `Ligado ao cliente ${r.cliente}.` : 'Vínculo confirmado.');
      qc.invalidateQueries({ queryKey: ['sac-customers', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
    },
    onError: (e: Error) => toast.error('Não foi possível confirmar: ' + e.message),
  });
}

export function useUpdateSACCustomer() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SACCustomerRow> }) => {
      // Regra 2 das cinco: o PostgREST responde 200 com zero linhas quando a
      // policy não casa, e isso não é erro. Sem o `expectRows`, a tela dizia
      // "Cliente atualizado" para uma gravação que não aconteceu.
      expectRows(
        await supabase.from('customer_profiles').update(patch).eq('id', id).select('id'),
        'o cliente',
      );
    },
    onSuccess: () => {
      toast.success('Cliente atualizado.');
      qc.invalidateQueries({ queryKey: ['sac-customers', tenantId] });
    },
    onError: (e: any) => toast.error('Erro ao atualizar: ' + e.message),
  });
}

export function useToggleBlockSACCustomer() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, block }: { id: string; block: boolean }) => {
      expectRows(
        await supabase
          .from('customer_profiles')
          .update({
            is_blocked: block,
            blocked_at: block ? new Date().toISOString() : null,
          })
          .eq('id', id).select('id'),
        'o cliente',
      );
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.block ? 'Cliente bloqueado.' : 'Cliente desbloqueado.');
      qc.invalidateQueries({ queryKey: ['sac-customers', tenantId] });
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

/**
 * Reenvia o acesso ao cliente do SAC — pelo caminho que ele realmente usa.
 *
 * CORRIGIDO EM 2026-09-27. Chamava `supabase.auth.resetPasswordForEmail`, que é
 * **incompatível com o login do cliente**: ele entra por **código de uso único**
 * enviado por e-mail (`send-sac-otp` / `verify-sac-otp`) e **não tem senha**. O
 * link de redefinir senha levava a uma tela de senha que não serve para ele.
 *
 * Agora chama `send-sac-otp` com `purpose: 'login'`, que é exatamente o que a tela
 * de entrada do SAC faz — a mesma porta, só disparada por quem atende.
 *
 * O e-mail em si continua desligado até a chave SMTP existir (é o último item da
 * leva H, por decisão do dono); quando faltar, a função devolve o erro de
 * configuração e o toast mostra — em vez de dizer "enviado" para nada.
 */
export function useResetSACCustomerPassword() {
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke('send-sac-otp', {
        body: { email, purpose: 'login', tenant_id: tenantId },
      });
      if (error) throw error;
      // A função responde 200 com `{ error: ... }` quando o e-mail não está
      // configurado. Sem esta linha o toast comemoraria um envio que não houve.
      if (data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
    },
    onSuccess: () => toast.success('Código de acesso enviado ao cliente.'),
    onError: (e: any) => toast.error('Não foi possível enviar: ' + e.message),
  });
}

export function useDeleteSACCustomer() {
  const { tenantId } = useAuth();
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
      qc.invalidateQueries({ queryKey: ['sac-customers', tenantId] });
    },
    onError: (e: any) => toast.error('Erro ao excluir: ' + e.message),
  });
}
