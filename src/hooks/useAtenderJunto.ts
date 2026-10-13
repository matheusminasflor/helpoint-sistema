// Atender junto (dono, 2026-10-13; migration 20261230010000): o chamado tem um atendente principal e quem
// atende junto. Conta para todos nos indicadores; convidar e tirar passam pelas funções do banco, que
// conferem quem pode.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';

export interface QuemAtendeJunto { user_id: string; nome: string }

export function useAtendemJunto(ticketId: string | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['atendem-junto', tenantId, ticketId],
    enabled: !!tenantId && !!ticketId,
    queryFn: async (): Promise<QuemAtendeJunto[]> => {
      const rows = (unwrap(await supabase.from('ticket_participantes' as never)
        .select('user_id, pessoa:profiles!ticket_participantes_user_id_fkey(full_name, email)')
        .eq('ticket_id', ticketId!)) ?? []) as unknown as { user_id: string; pessoa: { full_name: string | null; email: string } | null }[];
      return rows.map((r) => ({ user_id: r.user_id, nome: r.pessoa?.full_name || r.pessoa?.email || '—' }));
    },
  });
}

/** Eu atendo este chamado junto? */
export function useEuAtendoJunto(ticketId: string | null | undefined) {
  const { user } = useAuth();
  const { data = [] } = useAtendemJunto(ticketId);
  return !!user?.id && data.some((p) => p.user_id === user.id);
}

/** Posso chamar ou tirar alguém (atendente do chamado, gestor do setor ou administrador) — o banco responde. */
export function usePossoChamarParaAtenderJunto(ticketId: string | null | undefined) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['pode-chamar-junto', tenantId, user?.id, ticketId],
    enabled: !!tenantId && !!ticketId,
    queryFn: async () => !!unwrap(await supabase.rpc('pode_chamar_para_atender_junto' as never, { p_ticket: ticketId } as never)),
  }).data ?? false;
}

export function useAtenderJuntoAcoes(ticketId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['atendem-junto', tenantId, ticketId] });
    qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    qc.invalidateQueries({ queryKey: ['ticket-comments'] });
  };
  const convidar = useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await supabase.rpc('convidar_para_atender_junto' as never, { p_ticket: ticketId, p_user: userId } as never)),
    onSuccess: () => { recarregar(); toast.success('Convidado. A pessoa recebe o aviso e passa a atender junto.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const tirar = useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await supabase.rpc('tirar_de_atender_junto' as never, { p_ticket: ticketId, p_user: userId } as never)),
    onSuccess: () => { recarregar(); toast.success('Pronto, saiu do chamado.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return { convidar, tirar };
}
