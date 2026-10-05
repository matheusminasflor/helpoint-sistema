import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketStatus } from '@/types/helpdesk';
import { unwrap, expectRows } from '@/lib/supabase-result';

const CHECKLIST_BLOCK_MESSAGE = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.';

export function useTicketActions() {
  const { user, tenantId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  /**
   * O comentário que registra a movimentação no chamado. Erro do banco não se engole (regra 1).
   * SEM `.select('id')` de propósito: com RETURNING o Postgres aplica a policy de SELECT no insert
   * (lição 11), e quem acabou de TRANSFERIR deixa de ser o atendente — sem "Ver os chamados do
   * setor", a nota interna da própria transferência dava 42501. INSERT recusado pelo `with check`
   * levanta erro sozinho; o "0 linhas sem erro" da regra 2 é de UPDATE/DELETE (lição 12).
   */
  const comentar = async (ticketId: string, content: string, isInternal: boolean, oQue: string) => {
    const { error } = await supabase.from('ticket_comments').insert({
      tenant_id: tenantId!,
      ticket_id: ticketId,
      author_id: user!.id,
      content,
      is_internal: isInternal,
    });
    if (error) throw new Error(`Não foi possível gravar ${oQue}: ${error.message}`);
  };

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
      // O AVISO DE CADA MOVIMENTAÇÃO É DO BANCO (2026-10-02, `trg_notify_on_ticket_change`): assumir,
      // transferir, mudar status e trocar equipamento avisam por trigger, com permissão e sem
      // duplicar. Esta tela não insere mais em `notifications` — inserir dos dois lados duplicava.
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

      await comentar(ticketId, `Chamado assumido por ${currentUserName}.`, true, 'o registro de quem assumiu');
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
      const { error } = await supabase
        .from('tickets')
        .update({ assigned_to: newAssigneeId })
        .eq('id', ticketId);

      if (error) throw error;

      const currentUserName = user.user_metadata?.full_name || user.email;
      await comentar(ticketId, `Chamado transferido de ${currentUserName} para ${newAssigneeName}. Motivo: ${transferNote}`,
        true, 'o registro da transferência');
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
      
      // Não há mais "Fechar" (dono, 2026-10-04): nenhuma tela pede `closed`, e o ramo que cuidava
      // dele saiu daqui.

      const { error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId);

      if (error) throw error;

      const statusLabels: Record<TicketStatus, string> = {
        open: 'Aberto',
        in_progress: 'Em Andamento',
        waiting_user: 'Pendente',
        waiting_parts: 'Pendente',
        resolved: 'Resolvido',
        closed: 'Resolvido',
        cancelled: 'Cancelado',
        rejected: 'Reprovado',
      };

      await comentar(ticketId, `Status alterado para ${statusLabels[newStatus]}. Motivo: ${reason}`, true, 'o registro da mudança de status');
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
      await comentar(ticketId, `@${technicianName}, ${message}`, isInternal, 'a menção');

      // Insert into ticket_mentions for visibility control
      await supabase
        .from('ticket_mentions')
        .insert({
          ticket_id: ticketId,
          mentioned_user_id: technicianId,
          mentioned_by: user.id,
          message: message,
        } as any);

      const ticketData = unwrap(await supabase
        .from('tickets')
        .select('tenant_id, ticket_number, title')
        .eq('id', ticketId)
        .single());

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
      await comentar(ticketId, `Equipamento trocado por ${currentUserName}: ${oldAssetName} → ${newAssetName}. Motivo: ${reason}`,
        true, 'o registro da troca de equipamento');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Solicitante avalia a resolução. Grava SÓ a nota: o status continua Resolvido (dono, 2026-10-04:
   * "está resolvido, está resolvido" — a avaliação é opcional e nunca muda o status). Antes daqui a
   * avaliação levava o chamado a `closed`, e os indicadores deixavam de contá-lo como resolvido.
   */
  const evaluateTicket = async (ticketId: string, rating: number, comment?: string) => {
    if (!user) throw new Error('User not authenticated');
    setIsLoading(true);
    try {
      expectRows(await supabase
        .from('tickets')
        .update({ satisfaction_rating: rating })
        .eq('id', ticketId)
        .select('id'), 'a avaliação do chamado');

      const text = comment?.trim()
        ? `Solicitante avaliou o atendimento com nota ${rating}/5. Comentário: ${comment.trim()}`
        : `Solicitante avaliou o atendimento com nota ${rating}/5.`;

      await comentar(ticketId, text, false, 'o comentário da avaliação');
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

      // Comentário público do solicitante: o trigger do banco avisa o
      // responsável — ou a equipe do módulo, se ninguém assumiu.
      await comentar(ticketId, `Chamado reaberto pelo solicitante. Motivo: ${reason}`, false, 'o motivo da reabertura');
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


