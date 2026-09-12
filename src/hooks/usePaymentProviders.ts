import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Provedores de pagamento da empresa (CRM-2a, ADR-008) — molde de
 * `useTenantAICredentials`. A chave nunca chega ao navegador: a leitura é a
 * função `crm_payment_providers()` (provedor, padrão, alias, últimos 4) e a
 * escrita passa pela edge function `payment-credentials` (só owner/admin).
 */

export type PaymentProvider = 'stripe' | 'yampi';
export type PaymentProviderStatus = Database['public']['Functions']['crm_payment_providers']['Returns'][number];

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider | 'manual', string> = {
  yampi: 'Yampi',
  stripe: 'Stripe',
  manual: 'Por fora',
};

export function usePaymentProviders() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['payment-providers', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<PaymentProviderStatus[]> => unwrap(await supabase.rpc('crm_payment_providers')),
  });
}

async function callCredentials<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payment-credentials', { body });
  if (error) throw new Error(error.message);
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error && !('ok' in payload)) throw new Error(String(payload.error));
  return payload;
}

export interface YampiInput { provider: 'yampi'; alias: string; user_token: string; secret_key: string }
export interface StripeInput { provider: 'stripe'; secret_key: string; webhook_secret: string }
export type CredentialInput = YampiInput | StripeInput;

export function useTestPaymentCredential() {
  return useMutation({
    mutationFn: (payload: CredentialInput) => callCredentials<{ ok: boolean; error?: string }>({ action: 'test', ...payload }),
  });
}

export function useSavePaymentCredential() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CredentialInput) => callCredentials<{ ok: boolean; error?: string; key_last4?: string; webhook_url?: string }>({ action: 'save', ...payload }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      if (res.ok) toast.success('Provedor salvo.');
      else toast.error(res.error ?? 'A chave não foi aceita.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDeletePaymentCredential() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: PaymentProvider) => callCredentials<{ ok: boolean }>({ action: 'delete', provider }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      toast.success('Provedor removido.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useSetDefaultPaymentProvider() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: PaymentProvider) => callCredentials<{ ok: boolean }>({ action: 'set_default', provider }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-providers', tenantId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
