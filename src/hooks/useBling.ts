import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Conexão da empresa com o Bling (CRM-2b, ADR-008). O token nunca chega ao
 * navegador: a leitura é `crm_bling_status()` (empresa, validade, escolhas) e a
 * escrita passa pela edge function `bling-oauth` (só owner/admin). A troca do
 * código de autorização pelo token é feita por quem está logado (`exchange`).
 */

export type BlingStatus = Database['public']['Functions']['crm_bling_status']['Returns'][number];
export interface BlingSettings { forma_pagamento_id?: number; forma_pagamento_nome?: string; gerar_nfe?: boolean; enviar_nfe?: boolean }

const TRANSLATE: Record<string, string> = {
  forbidden: 'Só dono ou administrador conecta o Bling.',
  bling_not_configured: 'O app Helpoint ainda não foi registrado no Bling.',
  bling_not_connected: 'A empresa não está conectada ao Bling.',
};
const callBling = <T,>(body: Record<string, unknown>) => invokeEdge<T>('bling-oauth', body, TRANSLATE);

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

/** Manda o navegador para a tela de autorização do Bling; o Bling volta para esta página com `?bling_code=…&bling_state=…`. */
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

/** Segunda metade: o código que o Bling devolveu vira token — com o JWT de quem clicou "Conectar". */
export function useExchangeBlingCode() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; state: string }) => callBling<{ ok: boolean }>({ action: 'exchange', ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bling-status', tenantId] });
      toast.success('Bling conectado.');
    },
    onError: (e) => toast.error(`Não deu para conectar ao Bling: ${e instanceof Error ? e.message : String(e)}`),
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
