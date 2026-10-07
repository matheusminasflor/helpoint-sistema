import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useId } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

export type NotificationType = 
  // SLA e Alertas
  | 'sla_warning' 
  | 'sla_violation' 
  | 'contract_expiring' 
  | 'license_expiring'
  | 'deadline_expired'
  // Lembretes da Agenda
  | 'reminder'
  // Chamados — e, desde a L11b, também `@fulano` no chat interno
  // (`reference_type: 'chat_channel'`; decisão 8 do plano do chat)
  | 'mention'
  | 'ticket_reply'
  | 'ticket_assigned'
  | 'ticket_created'
  // Movimentações do chamado (2026-10-02, migration 20261121020000): o banco avisa todas.
  | 'ticket_transferred'
  | 'ticket_updated'
  | 'ticket_waiting'
  // Agendado (2026-10-07, migration 20261214010000): "Chamado #N foi agendado para dd/mm às HH:MM."
  | 'ticket_scheduled'
  | 'ticket_resolved'
  | 'ticket_closed'
  // Kanban (futuro)
  | 'card_mention'
  | 'card_member'
  // RH, Compras e SAC
  | 'request_decided'
  | 'purchase_requested'
  | 'purchase_decided'
  | 'sac_customer_reply'
  | 'sac_customer_rated'
  | 'document_available'
  // Financeiro e Marketing (robôs)
  | 'bill_due'
  | 'post_published'
  | 'post_failed'
  // Automações (L2): notificação disparada por uma regra do motor de automação
  | 'automation'
  // Férias aprovadas: o gestor repassa as demandas da pessoa (20261127020000)
  | 'ferias_repassar'
  // CRM do Comercial (CRM-1)
  | 'crm_new_lead'
  | 'order_paid'
  | 'order_accepted'
  // Carteiras e metas do Comercial (L6d): meta de carteira avisa quem está nela.
  | 'meta_definida'
  // Projetos por setor (20261215010000): setor chamado, atividade atribuída, prazo, dependência liberada.
  | 'projeto_setor_chamado'
  | 'projeto_atividade'
  | 'projeto_prazo'
  | 'projeto_dependencia';

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType;
  reference_type: string;
  reference_id: string;
  title: string;
  message: string;
  is_read: boolean;
  email_sent: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading, error } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as Notification[];
    },
  });

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  // Tempo real. `*`, não só INSERT: o aviso de chamado repetido em 2 minutos ATUALIZA a linha que já
  // existe (deduplicação no banco, 20261121020000) — só INSERT deixaria o texto velho na tela.
  // Canal com nome próprio por uso (o sino saiu em 2026-10-02; hoje lê o "Lyra avisa" e o resumo).
  const canal = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-changes-${canal}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, canal]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
  };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      // Regra 2: o PostgREST responde 200 com zero linhas quando a policy não casa. Sem a prova,
      // o aviso seguia "não lido" no sino e no "Lyra avisa" sem ninguém saber por quê.
      expectRows(
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
          .select('id'),
        'o aviso lido',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
