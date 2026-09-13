import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Reunião marcada pelo negócio (CRM-3b, ADR-006). O banco grava as duas coisas
 * juntas — o evento na agenda de quem marcou e a linha na história do negócio —
 * e o convite por e-mail é um passo à parte: se ele falhar, a reunião continua
 * marcada e a tela diz que o aviso não saiu.
 */

export interface ReuniaoInput {
  deal_id: string;
  titulo: string;
  /** Data e hora locais, como vêm do `<input type="datetime-local">`. */
  quando: string;
  minutos: number;
  notas?: string;
  avisar_cliente: boolean;
}

export function useAgendarReuniao() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReuniaoInput) => {
      // `datetime-local` não tem fuso: o navegador interpreta no fuso de quem
      // está marcando, que é o que se quer.
      const inicio = new Date(input.quando);
      if (Number.isNaN(inicio.getTime())) throw new Error('data e hora inválidas');

      const eventId = unwrap(await supabase.rpc('crm_agendar_reuniao', {
        p_deal: input.deal_id,
        p_titulo: input.titulo,
        p_inicio: inicio.toISOString(),
        p_minutos: input.minutos,
        p_notas: input.notas ?? null,
      }));

      if (!input.avisar_cliente) return { eventId, aviso: null as null | { enviado: boolean; motivo?: string } };
      const aviso = await invokeEdge<{ enviado: boolean; motivo?: string }>(
        'crm-meeting-invite', { deal_id: input.deal_id, event_id: eventId },
      ).catch((e) => ({ enviado: false, motivo: e instanceof Error ? e.message : String(e) }));
      return { eventId, aviso };
    },
    onSuccess: ({ aviso }, input) => {
      qc.invalidateQueries({ queryKey: ['crm-deal-activities', tenantId, input.deal_id] });
      qc.invalidateQueries({ queryKey: ['calendar-events', user?.id] });
      qc.invalidateQueries({ queryKey: ['crm-deal', tenantId, input.deal_id] });
      toast.success('Reunião marcada e na sua agenda.');
      if (aviso && !aviso.enviado) {
        toast.warning(`A reunião está marcada, mas o convite não saiu: ${aviso.motivo ?? 'motivo desconhecido'}.`, { duration: 10000 });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
