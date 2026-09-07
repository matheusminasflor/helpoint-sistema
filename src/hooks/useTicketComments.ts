import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketComment } from '@/types/helpdesk';
import { unwrap } from '@/lib/supabase-result';

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

export function useAddComment() {
  const { user, profile } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const addComment = async (
    ticketId: string, 
    content: string, 
    isInternal: boolean = false,
    files: File[] = []
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
        } as any)
        .select()
        .single();

      if (commentError) throw commentError;

      // Upload attachments if any
      if (files.length > 0 && comment) {
        for (const file of files) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${ticketId}/${comment.id}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('ticket-attachments')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            continue;
          }

          const { data: publicUrl } = supabase.storage
            .from('ticket-attachments')
            .getPublicUrl(fileName);

          // Save attachment record
          await supabase.from('ticket_attachments').insert({
            ticket_id: ticketId,
            comment_id: comment.id,
            file_name: file.name,
            file_url: publicUrl.publicUrl,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user.id,
          } as any);
        }
      }

      // Quem é avisado decide o banco: trigger `trg_notify_on_ticket_comment`
      // (migration 20260908020000) avisa o outro lado — solicitante escreve →
      // responsável ou equipe do módulo; técnico escreve → solicitante.
      // Comentário interno não avisa ninguém.

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
