// Atender junto (dono, 2026-10-13; migration 20261230010000): o chamado tem um atendente principal e quem
// atende junto. Conta para todos nos indicadores; convidar e tirar passam pelas funções do banco, que
// conferem quem pode.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import type { TicketWithDetails } from '@/types/helpdesk';

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
    onSuccess: () => { recarregar(); qc.invalidateQueries({ queryKey: ['convites-do-chamado', tenantId, ticketId] }); toast.success('Convite enviado. A pessoa recebe o aviso e entra quando aceitar.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const tirar = useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await supabase.rpc('tirar_de_atender_junto' as never, { p_ticket: ticketId, p_user: userId } as never)),
    onSuccess: () => { recarregar(); qc.invalidateQueries({ queryKey: ['convites-do-chamado', tenantId, ticketId] }); toast.success('Pronto, saiu do chamado.'); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return { convidar, tirar };
}

// ─── Convite com aceite (dono, 2026-10-14; 20270113010000) ─────────────────────────────────────────

/** Quem foi convidado para este chamado e ainda não respondeu. */
export function useConvitesDoChamado(ticketId: string | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['convites-do-chamado', tenantId, ticketId],
    enabled: !!tenantId && !!ticketId,
    queryFn: async (): Promise<QuemAtendeJunto[]> => {
      const rows = (unwrap(await supabase.from('ticket_convites' as never)
        .select('user_id, pessoa:profiles!ticket_convites_user_id_fkey(full_name, email)')
        .eq('ticket_id', ticketId!)) ?? []) as unknown as { user_id: string; pessoa: { full_name: string | null; email: string } | null }[];
      return rows.map((r) => ({ user_id: r.user_id, nome: r.pessoa?.full_name || r.pessoa?.email || '—' }));
    },
  });
}

export interface MeuConvite { ticket_id: string; ticket_number: number; titulo: string; quem_convidou: string | null; created_at: string }

/** Os convites que esperam a minha resposta. */
export function useMeusConvites() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['meus-convites', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<MeuConvite[]> =>
      (unwrap(await supabase.rpc('meus_convites_atender_junto' as never)) ?? []) as unknown as MeuConvite[],
  });
}

/** O chamado do convite, só leitura, antes de aceitar (dono, 2026-10-19; 20270128050000). */
export interface ChamadoDoConvite {
  numero: number; titulo: string; descricao: string | null; categoria: string | null; subcategoria: string | null;
  prioridade: string; status: string; setor: string; aberto_em: string; solicitante: string | null;
  conversa: { autor: string | null; texto: string; em: string }[];
}

export function useChamadoDoConvite(ticketId: string | null) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['chamado-do-convite', tenantId, user?.id, ticketId],
    enabled: !!tenantId && !!ticketId,
    queryFn: async (): Promise<ChamadoDoConvite | null> =>
      (unwrap(await supabase.rpc('convite_ver_chamado' as never, { p_ticket: ticketId } as never)) ?? null) as ChamadoDoConvite | null,
  });
}

/**
 * Os chamados ABERTOS que eu atendo junto (convite aceito), de qualquer setor (dono, 2026-10-19: "aceitei chamado do
 * laboratório, deve aparecer para eu não esquecer"). A fila do meu setor os mostra em "Meus".
 */
export function useChamadosQueAtendoJunto() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['chamados-que-atendo-junto', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<TicketWithDetails[]> => {
      const ids = ((unwrap(await supabase.from('ticket_participantes' as never).select('ticket_id').eq('user_id', user!.id)) ?? []) as
        unknown as { ticket_id: string }[]).map((p) => p.ticket_id);
      if (ids.length === 0) return [];
      return (unwrap(await supabase.from('tickets')
        .select(`*, requester:profiles!tickets_requester_id_fkey(id, full_name, email, department),
                 assignee:profiles!tickets_assigned_to_fkey(id, full_name, email), asset:assets(*)`)
        .in('id', ids)
        .in('status', ['open', 'in_progress', 'waiting_user', 'waiting_parts', 'scheduled'])) ?? []) as unknown as TicketWithDetails[];
    },
  });
}

export function useResponderConvite() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, aceita, motivo }: { ticketId: string; aceita: boolean; motivo?: string }) =>
      unwrap(await supabase.rpc('responder_convite_atender_junto' as never,
        { p_ticket: ticketId, p_aceita: aceita, p_motivo: motivo?.trim() || null } as never)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['meus-convites', tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ['chamados-que-atendo-junto', tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(v.aceita ? 'Convite aceito: você passou a atender junto.' : 'Convite recusado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
