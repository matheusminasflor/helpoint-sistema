import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AIProvider = 'anthropic' | 'openai' | 'google';

export interface AICredentialStatus {
  configured: boolean;
  provider: AIProvider | null;
  model: string | null;
  /** Apenas os 4 últimos caracteres — a chave completa nunca sai do servidor. */
  key_last4: string | null;
  updated_at: string | null;
}

export const AI_PROVIDERS: { value: AIProvider; label: string; defaultModel: string; hint: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-3-5-sonnet-latest', hint: 'Chave começa com sk-ant-' },
  { value: 'openai', label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini', hint: 'Chave começa com sk-' },
  { value: 'google', label: 'Google (Gemini)', defaultModel: 'gemini-2.5-flash', hint: 'Chave da API do Google AI Studio' },
];

async function callCredentials<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-credentials', { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export function useAICredentialStatus() {
  return useQuery({
    queryKey: ['tenant-ai-credentials'],
    queryFn: () => callCredentials<AICredentialStatus>({ action: 'status' }),
    staleTime: 60_000,
  });
}

export function useSaveAICredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { provider: AIProvider; api_key: string; model: string }) =>
      callCredentials<{ ok?: boolean; error?: string }>({ action: 'save', ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-ai-credentials'] }),
  });
}

export function useTestAICredential() {
  return useMutation({
    mutationFn: (payload: { provider: AIProvider; model: string; api_key?: string }) =>
      callCredentials<{ ok: boolean; error?: string }>({ action: 'test', ...payload }),
  });
}

export function useDeleteAICredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callCredentials<{ ok: boolean }>({ action: 'delete' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-ai-credentials'] }),
  });
}

export const AI_NOT_CONFIGURED_MESSAGE =
  'Configure um provedor de IA em Configurações → IA para ativar este recurso.';

/** Traduz erros de IA em mensagens amigáveis em pt-BR. */
export function friendlyAIError(payload: unknown, fallback = 'Não foi possível concluir agora. Tente novamente.'): string {
  if (isNoAICredentials(payload)) return AI_NOT_CONFIGURED_MESSAGE;
  const msg = payload instanceof Error ? payload.message : (payload as { error?: string })?.error;
  if (msg === 'no_ai_credentials') return AI_NOT_CONFIGURED_MESSAGE;
  return msg || fallback;
}

/** Detecta a resposta padronizada de "sem provedor de IA configurado". */
export function isNoAICredentials(payload: unknown): boolean {
  if (!payload) return false;
  const p = payload as { error?: string; message?: string };
  return p.error === 'no_ai_credentials' || p.message === 'no_ai_credentials';
}
