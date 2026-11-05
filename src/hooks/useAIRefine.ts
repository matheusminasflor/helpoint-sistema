import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { FUNCTIONS_URL } from '@/lib/env';
import { toast } from 'sonner';

export type ContextoDoTexto = 'general' | 'title_from_description' | 'ticket_title' | 'ticket_description' | 'comment' | 'resolution' | 'checklist_description';

/** Melhora um texto com a IA da empresa. Só roda com o clique da pessoa (dono, 2026-11-04). */
export function useAIRefine() {
  const [isRefining, setIsRefining] = useState(false);

  const refineText = useCallback(async (text: string, context: ContextoDoTexto, apoio?: string, ticketId?: string): Promise<string> => {
    if (!text.trim() && !ticketId) return text;

    setIsRefining(true);
    try {
      const { session } = unwrap(await supabase.auth.getSession());
      if (!session?.access_token) throw new Error('Sessão expirada');

      const response = await fetch(`${FUNCTIONS_URL}/ai-refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text, context, apoio, ticket_id: ticketId }),
      });

      // A função responde 200 com `{ error: 'no_ai_credentials' }` quando a empresa não cadastrou a chave da IA.
      // Antes isso devolvia o MESMO texto em silêncio e parecia que "não funcionava" (dono, 2026-10-07).
      const data = await response.json().catch(() => ({}));
      if (data?.error === 'no_ai_credentials') {
        toast.error('A IA ainda não está configurada', {
          description: 'O administrador cadastra o provedor e a chave em Configurações › IA.',
        });
        return text;
      }
      if (!response.ok || data?.error) throw new Error(data?.message || 'O provedor de IA não respondeu.');
      return data.refined || text;
    } catch (err) {
      console.error('AI Refine error:', err);
      toast.error('Não foi possível melhorar o texto', { description: mensagemDeErro(err) });
      return text;
    } finally {
      setIsRefining(false);
    }
  }, []);

  return { refineText, isRefining };
}
