import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Conexão da empresa com o Bling (CRM-2b, ADR-008). O token nunca chega ao
 * navegador: a leitura é `crm_bling_status()` (empresa, validade, escolhas) e a
 * escrita passa pela edge function `bling-oauth` (só owner/admin).
 */

export type BlingStatus = Database['public']['Functions']['crm_bling_status']['Returns'][number];
export interface BlingSettings { forma_pagamento_id?: number; forma_pagamento_nome?: string; gerar_nfe?: boolean; enviar_nfe?: boolean }

export function useBlingStatus() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['bling-status', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<BlingStatus | null> => {
      const rows = unwrap(await supabase.rpc('crm_bling_status'));
      return rows[0] ?? null;
    },
  });
}

async function callBling<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('bling-oauth', { body });
  if (error) {
    // A função explica o motivo no corpo ({ error, message }); o supabase-js só diz "non-2xx".
    let reason = '';
    if (error instanceof FunctionsHttpError) {
      try {
        const b = (await error.context.json()) as { error?: string; message?: string };
        reason = b?.message ?? b?.error ?? '';
      } catch {
        reason = '';
      }
    }
    throw new Error(reason === 'bling_not_configured' || !reason ? (reason ? 'O app Helpoint ainda não foi registrado no Bling.' : error.message) : reason);
  }
  const payload = data as T & { error?: string; message?: string };
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error && !('ok' in payload)) throw new Error(payload.message ?? String(payload.error));
  return payload;
}

/** Manda o navegador para a tela de autorização do Bling; o Bling volta para `return_to` com `?bling=ok|erro`. */
export function useConnectBling() {
  return useMutation({
    mutationFn: async () => {
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      const res = await callBling<{ auth_url: string }>({ action: 'start', return_to: returnTo });
      window.location.href = res.auth_url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useBlingPaymentMethods(enabled: boolean) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['bling-payment-methods', tenantId],
    enabled: !!tenantId && enabled,
    staleTime: 5 * 60_000,
    queryFn: () => callBling<{ formas_pagamento: { id: number; descricao: string }[] }>({ action: 'options' }).then((r) => r.formas_pagamento),
  });
}

export function useSaveBlingSettings() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: BlingSettings) => callBling<{ ok: boolean }>({ action: 'save', settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bling-status', tenantId] });
      toast.success('Escolhas do Bling salvas.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDisconnectBling() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callBling<{ ok: boolean }>({ action: 'disconnect' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bling-status', tenantId] });
      toast.success('Bling desconectado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
