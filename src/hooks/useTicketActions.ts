import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketStatus } from '@/types/helpdesk';

const CHECKLIST_BLOCK_MESSAGE = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.';

export function useTicketActions() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const ensureChecklistAllowsClosing = async (ticketId: string, newStatus: TicketStatus) => {
    if (newStatus !== 'resolved' && newStatus !== 'closed') return;

    const { data, error } = await (supabase
      .from('ticket_checklist_items' as 'profiles')
      .select('id, ticket_checklists!inner(ticket_id)')
      .eq('is_required' as 'email', true as never)
      .eq('is_completed' as 'email', false as never)
      .eq('ticket_checklists.ticket_id' as 'email', ticketId) as unknown as Promise<{ data: { id: string }[] | null; error: Error | null }>);

    if (error) throw error;
    if ((data || []).length > 0) throw new Error(CHECKLIST_BLOCK_MESSAGE);
  };

  const assignToMe = async (ticketId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, title, requester_id')
        .eq('id', ticketId)
        .single();

      const { error } = await supabase
        .from('tickets')
        .update({ 
          assigned_to: user.id, 
          status: 'in_progress',
          first_response_at: new Date().toISOString()
        })
        .eq('id', ticketId);

      if (error) throw error;

      const currentUserName = user.user_metadata?.full_name || user.email;

      await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content: `Chamado assumido por ${currentUserName}.`,
          is_internal: true,
        } as any);

      if (ticketData && ticketData.requester_id !== user.id) {
        await supabase
          .from('notifications')
          .insert({
            tenant_id: ticketData.tenant_id,
            user_id: ticketData.requester_id,
            type: 'ticket_assigned' as const,
            title: `Seu chamado #${ticketData.ticket_number} foi assumido`,
            message: `${currentUserName} está atendendo seu chamado.`,
            reference_type: 'ticket',
            reference_id: ticketId,
          });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const transferTicket = async (
    ticketId: string, 
    newAssigneeId: string, 
    newAssigneeName: string,
    transferNote: string
  ) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, title')
        .eq('id', ticketId)
        .single();

      const { error } = await supabase
        .from('tickets')
        .update({ assigned_to: newAssigneeId })
        .eq('id', ticketId);

      if (error) throw error;

      const currentUserName = user.user_metadata?.full_name || user.email;
      await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content: `Chamado transferido de ${currentUserName} para ${newAssigneeName}. Motivo: ${transferNote}`,
          is_internal: true,
        } as any);

      if (ticketData) {
        await supabase
          .from('notifications')
          .insert({
            tenant_id: ticketData.tenant_id,
            user_id: newAssigneeId,
            type: 'ticket_assigned' as const,
            title: `Chamado #${ticketData.ticket_number} atribuído a você`,
            message: `${currentUserName} transferiu: "${ticketData.title}"`,
            reference_type: 'ticket',
            reference_id: ticketId,
          });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const changeStatus = async (
    ticketId: string, 
    newStatus: TicketStatus, 
    reason: string
  ) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      await ensureChecklistAllowsClosing(ticketId, newStatus);

      const updateData: any = { status: newStatus };
      
      if (newStatus === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolution_notes = reason;
      }
      
      if (newStatus === 'closed') {
        updateData.closed_at = new Date().toISOString();
        // Marco de SLA é sempre resolved_at: se o chamado for fechado direto,
        // registra o marco agora para não distorcer indicadores.
        const { data: current } = await supabase
          .from('tickets')
          .select('resolved_at')
          .eq('id', ticketId)
          .maybeSingle();
        if (!current?.resolved_at) updateData.resolved_at = new Date().toISOString();
      }


      const { error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId);

      if (error) throw error;

      const statusLabels: Record<TicketStatus, string> = {
        open: 'Aberto',
        in_progress: 'Em Andamento',
        waiting_user: 'Aguardando Retorno do Usuário',
        waiting_parts: 'Pendente',
        resolved: 'Resolvido',
        closed: 'Fechado',
        cancelled: 'Cancelado',
        rejected: 'Reprovado',
      };

      await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content: `Status alterado para ${statusLabels[newStatus]}. Motivo: ${reason}`,
          is_internal: true,
        } as any);

      // Notify requester for all status transitions
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, title, requester_id')
        .eq('id', ticketId)
        .single();

      if (ticketData && ticketData.requester_id !== user.id) {
        const notifTitle = newStatus === 'waiting_user'
          ? `Chamado #${ticketData.ticket_number} aguarda sua resposta`
          : `Chamado #${ticketData.ticket_number} atualizado para ${statusLabels[newStatus]}`;

        await supabase.from('notifications').insert({
          tenant_id: ticketData.tenant_id,
          user_id: ticketData.requester_id,
          type: 'ticket_reply' as const,
          title: notifTitle,
          message: reason,
          reference_type: 'ticket',
          reference_id: ticketId,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resolveTicket = async (ticketId: string, resolutionNotes: string) => {
    await changeStatus(ticketId, 'resolved', resolutionNotes);
  };

  const mentionTechnician = async (
    ticketId: string, 
    technicianId: string, 
    technicianName: string,
    message: string,
    isInternal: boolean
  ) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content: `@${technicianName}, ${message}`,
          is_internal: isInternal,
        } as any);

      if (error) throw error;

      // Insert into ticket_mentions for visibility control
      await supabase
        .from('ticket_mentions')
        .insert({
          ticket_id: ticketId,
          mentioned_user_id: technicianId,
          mentioned_by: user.id,
          message: message,
        } as any);

      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, title')
        .eq('id', ticketId)
        .single();

      if (ticketData) {
        const userName = user.user_metadata?.full_name || user.email;
        await supabase
          .from('notifications')
          .insert({
            tenant_id: ticketData.tenant_id,
            user_id: technicianId,
            type: 'mention' as const,
            title: `Você foi mencionado no chamado #${ticketData.ticket_number}`,
            message: `${userName} mencionou você: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
            reference_type: 'ticket',
            reference_id: ticketId,
          });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const swapAsset = async (
    ticketId: string,
    oldAssetId: string,
    newAssetId: string,
    requesterId: string,
    reason: string,
    oldAssetName: string,
    newAssetName: string
  ) => {
    if (!user) throw new Error('User not authenticated');

    setIsLoading(true);
    try {
      // 1. Old asset → maintenance, unassign
      const { error: e1 } = await supabase
        .from('assets')
        .update({ status: 'maintenance' as any, assigned_to: null })
        .eq('id', oldAssetId);
      if (e1) throw e1;

      // 2. New asset → assign to requester
      const { error: e2 } = await supabase
        .from('assets')
        .update({ assigned_to: requesterId } as any)
        .eq('id', newAssetId);
      if (e2) throw e2;

      // 3. Ticket → update asset_id
      const { error: e3 } = await supabase
        .from('tickets')
        .update({ asset_id: newAssetId })
        .eq('id', ticketId);
      if (e3) throw e3;

      // 4. Internal comment
      const currentUserName = user.user_metadata?.full_name || user.email;
      await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content: `Equipamento trocado por ${currentUserName}: ${oldAssetName} → ${newAssetName}. Motivo: ${reason}`,
          is_internal: true,
        } as any);

      // 5. Notification to requester
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, requester_id')
        .eq('id', ticketId)
        .single();

      if (ticketData && ticketData.requester_id !== user.id) {
        await supabase.from('notifications').insert({
          tenant_id: ticketData.tenant_id,
          user_id: ticketData.requester_id,
          type: 'ticket_reply' as const,
          title: `Equipamento substituído no chamado #${ticketData.ticket_number}`,
          message: `${oldAssetName} foi substituído por ${newAssetName}. Motivo: ${reason}`,
          reference_type: 'ticket',
          reference_id: ticketId,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** Solicitante avalia a resolução e encerra o chamado. */
  const evaluateTicket = async (ticketId: string, rating: number, comment?: string) => {
    if (!user) throw new Error('User not authenticated');
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          satisfaction_rating: rating,
        } as never)
        .eq('id', ticketId);
      if (error) throw error;

      const text = comment?.trim()
        ? `Solicitante avaliou o atendimento com nota ${rating}/5. Comentário: ${comment.trim()}`
        : `Solicitante avaliou o atendimento com nota ${rating}/5 e encerrou o chamado.`;

      await supabase.from('ticket_comments').insert({
        ticket_id: ticketId,
        author_id: user.id,
        content: text,
        is_internal: false,
      } as any);
    } finally {
      setIsLoading(false);
    }
  };

  /** Solicitante reabre o chamado dentro da janela de 7 dias. */
  const reopenTicket = async (ticketId: string, reason: string) => {
    if (!user) throw new Error('User not authenticated');
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'in_progress',
          resolved_at: null,
          closed_at: null,
        } as never)
        .eq('id', ticketId);
      if (error) throw error;

      await supabase.from('ticket_comments').insert({
        ticket_id: ticketId,
        author_id: user.id,
        content: `Chamado reaberto pelo solicitante. Motivo: ${reason}`,
        is_internal: false,
      } as any);

      const { data: ticketData } = await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, assigned_to')
        .eq('id', ticketId)
        .single();

      if (ticketData?.assigned_to) {
        await supabase.from('notifications').insert({
          tenant_id: ticketData.tenant_id,
          user_id: ticketData.assigned_to,
          type: 'ticket_reply' as const,
          title: `Chamado #${ticketData.ticket_number} foi reaberto`,
          message: reason,
          reference_type: 'ticket',
          reference_id: ticketId,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTicket = async (ticketId: string) => {
    if (!user) throw new Error('User not authenticated');
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  };


  return { 
    assignToMe, 
    transferTicket, 
    changeStatus, 
    resolveTicket, 
    mentionTechnician,
    swapAsset,
    evaluateTicket,
    reopenTicket,
    deleteTicket,
    isLoading 
  };
}


