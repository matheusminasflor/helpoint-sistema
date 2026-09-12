import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Chama uma edge function e devolve o corpo — ou lança com o MOTIVO que a
 * função escreveu no corpo ({ error, message }). O supabase-js sozinho só diz
 * "Edge Function returned a non-2xx status code", que não ajuda ninguém.
 * Uma resposta 200 com `{ error }` (sem `ok`) também vira exceção.
 */
export async function invokeEdge<T>(fn: string, body: Record<string, unknown>, translate: Record<string, string> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let reason = '';
    if (error instanceof FunctionsHttpError) {
      try {
        const b = (await error.context.json()) as { error?: string; message?: string };
        reason = b?.message ?? b?.error ?? '';
      } catch {
        reason = '';
      }
    }
    throw new Error(translate[reason] ?? reason ?? error.message);
  }
  const payload = data as T & { error?: string; message?: string };
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error && !('ok' in payload)) {
    throw new Error(payload.message ?? translate[String(payload.error)] ?? String(payload.error));
  }
  return payload;
}
