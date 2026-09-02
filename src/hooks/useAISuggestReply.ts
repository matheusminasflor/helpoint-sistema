import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { friendlyAIError } from '@/hooks/useTenantAICredentials';

export function useAISuggestReply() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateSuggestion = async (
    ticketId: string,
    mode: 'reply' | 'resolution'
  ): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-reply', {
        body: { ticketId, mode },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data?.suggestion || null;
    } catch (err) {
      const msg = friendlyAIError(err, 'Erro ao gerar sugestão');
      toast.error(msg);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateSuggestion, isGenerating };
}
