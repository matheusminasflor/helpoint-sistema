import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyAIError } from '@/hooks/useTenantAICredentials';

interface Props {
  text: string;
  onApply: (improved: string) => void;
  tone?: string;
  label?: string;
  size?: 'sm' | 'default';
  disabled?: boolean;
  tenantSlug?: string | null;
}

export function ImproveTextButton({
  text,
  onApply,
  tone = 'claro, educado e objetivo, mantendo todos os fatos',
  label = 'Melhorar com IA',
  size = 'sm',
  disabled,
  tenantSlug,
}: Props) {
  const [loading, setLoading] = useState(false);

  const improve = async () => {
    const t = text.trim();
    if (t.length < 5) {
      toast.error('Escreva ao menos algumas palavras primeiro.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-reply', {
        body: {
          context: `Reescreva o texto a seguir de forma ${tone}. Não invente fatos novos. Texto original:\n\n"${t}"`,
          tone,
          tenant_slug: tenantSlug || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = ((data as any)?.reply || (data as any)?.suggestion || '').trim();
      if (!reply) throw new Error('Sem resposta da IA');
      onApply(reply);
      toast.success('Texto melhorado pela IA.');
    } catch (e: any) {
      console.error('ImproveText error', e);
      toast.error(friendlyAIError(e, 'Não foi possível melhorar agora. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };


  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={improve}
      disabled={disabled || loading}
      className="text-xs"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />
      )}
      {label}
    </Button>
  );
}
