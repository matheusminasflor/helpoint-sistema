import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketComment } from '@/types/helpdesk';
import { unwrap, expectRows } from '@/lib/supabase-result';

interface CommentWithAuthor extends TicketComment {
  author: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  };
  attachments?: {
    id: string;
    file_name: string;
    file_url: string;
    file_type: string;
  }[];
}

export function useTicketComments(ticketId: string | null) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!ticketId) {
      setComments([]);
      setIsLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('ticket_comments')
        .select(`
          *,
          author:profiles!ticket_comments_author_id_fkey(id, full_name, avatar_url, email)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Fetch attachments for each comment
      const commentsWithAttachments = await Promise.all(
        (data || []).map(async (comment) => {
          const attachments = unwrap(await supabase
            .from('ticket_attachments')
            .select('id, file_name, file_url, file_type')
            .eq('comment_id', comment.id));
          
          return {
            ...comment,
            attachments: attachments || []
          } as CommentWithAuthor;
        })
      );
      
      setComments(commentsWithAttachments);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!ticketId) return;
    
    const channel = supabase
      .channel(`ticket-comments-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_comments',
          filter: `ticket_id=eq.${ticketId}`
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, fetchComments]);

  return { comments, isLoading, refetch: fetchComments };
}

/**
 * Sobe os anexos de um chamado e os registra. `commentId` nulo = anexo do próprio chamado, enviado
 * junto com a abertura (decisão do dono, 2026-10-02: "hoje você precisa abrir o chamado e depois
 * anexar") — `useTicketDetail` já lê os sem comentário como anexos do chamado.
 */
export async function enviarAnexosDoChamado(userId: string, ticketId: string, commentId: string | null, files: File[]) {
  for (const [i, file] of files.entries()) {
    const fileExt = file.name.split('.').pop();
    // A primeira pasta é a da pessoa: é o que a policy de envio do balde exige.
    const fileName = `${userId}/${ticketId}/${commentId ?? 'abertura'}/${Date.now()}-${i}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('ticket-attachments')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // Guarda o **caminho**, não um endereço público.
    //
    // `ticket-attachments` é um balde **privado**, e endereço público de
    // balde privado não existe: o navegador recebia "Bucket not found" ao
    // clicar. O anexo aparecia na conversa com o nome certo e nunca abria,
    // sem nenhuma mensagem dizendo por quê.
    //
    // Quem lê monta o link assinado na hora (`MessageBubble`), que é o que
    // `CommentAttachments.tsx` já fazia do lado do SAC, três arquivos ao
    // lado. Consertar agora custou metade: `storage.objects` está vazio,
    // então não há anexo antigo para migrar.
    expectRows(
      await supabase.from('ticket_attachments').insert({
        ticket_id: ticketId,
        comment_id: commentId,
        file_name: file.name,
        file_url: fileName,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: userId,
      } as any).select('id'),
      'o anexo',
    );
  }
}

export function useAddComment() {
  const { user, profile } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const addComment = async (
    ticketId: string, 
    content: string, 
    isInternal: boolean = false,
    files: File[] = [],
    /** "Continuo trabalhando nele": a resposta da equipe NÃO põe o chamado em Pendente. */
    mantemStatus: boolean = false,
  ) => {
    if (!user || !profile) throw new Error('User not authenticated');
    
    setIsSending(true);
    try {
      // Create the comment
      const { data: comment, error: commentError } = await supabase
        .from('ticket_comments')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          content,
          is_internal: isInternal,
          mantem_status: mantemStatus,
        } as any)
        .select()
        .single();

      if (commentError) throw commentError;

      if (files.length > 0 && comment) {
        await enviarAnexosDoChamado(user.id, ticketId, comment.id, files);
      }

      // Quem é avisado decide o banco: trigger `trg_notify_on_ticket_comment`
      // (migration 20260908020000) avisa o outro lado — solicitante escreve →
      // responsável ou equipe do módulo; técnico escreve → solicitante.
      // Comentário interno não avisa ninguém. O STATUS também é do banco
      // (`trg_chamado_status_pela_resposta`, 20261210010000): resposta pública da
      // equipe põe em Pendente (salvo `mantem_status`); a do solicitante tira.

      return comment;
    } finally {
      setIsSending(false);
    }
  };

  return { addComment, isSending };
}

export function useTicketDetail(ticketId: string | null) {
  const [ticket, setTicket] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) {
      setTicket(null);
      setIsLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email, department, avatar_url, phone),
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, avatar_url),
          asset:assets(*)
        `)
        .eq('id', ticketId)
        .single();

      if (error) throw error;
      
      // Fetch ticket attachments (not linked to comments)
      const attachments = unwrap(await supabase
        .from('ticket_attachments')
        .select('id, file_name, file_url, file_type')
        .eq('ticket_id', ticketId)
        .is('comment_id', null));
      
      setTicket({ ...data, attachments: attachments || [] });
    } catch (error) {
      console.error('Error fetching ticket:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  return { ticket, isLoading, refetch: fetchTicket };
}
