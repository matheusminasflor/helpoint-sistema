import { useState } from 'react';
import { useTicketComments, useAddComment, useTicketDetail } from '@/hooks/useTicketComments';
import { useAuth } from '@/contexts/AuthContext';
import { MessageBubble } from './MessageBubble';
import { ReplyComposer } from './ReplyComposer';
import { MentionDialog } from './MentionDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { contaComoResolvido } from '@/lib/status-do-chamado';

interface TicketConversationProps {
  ticketId: string;
  showInternalOption?: boolean;
  className?: string;
  onUpdate?: () => void;
}

export function TicketConversation({ 
  ticketId, 
  showInternalOption = false,
  className,
  onUpdate,
}: TicketConversationProps) {
  const { user } = useAuth();
  const { ticket, isLoading: isLoadingTicket } = useTicketDetail(ticketId);
  const { comments, isLoading: isLoadingComments } = useTicketComments(ticketId);
  const { addComment, isSending } = useAddComment();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pode, atende } = usePodeNoChamado(ticket?.module);
  // Da equipe do setor: age no chamado ou ao menos vê a fila ("Ver os chamados do setor").
  const isTechnician = atende || pode('view_all');
  const [mentionOpen, setMentionOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handleReply = async (content: string, isInternal: boolean, files?: File[]) => {
    await addComment(ticketId, content, isInternal, files);
  };

  const isLoading = isLoadingTicket || isLoadingComments;
  const isClosed = ticket?.status === 'closed' || ticket?.status === 'cancelled' || ticket?.status === 'resolved';

  if (isLoading) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-16 w-2/3 ml-auto" />
          <Skeleton className="h-16 w-3/4" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground", className)}>
        <p>Chamado não encontrado</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" onWheel={e => e.stopPropagation()}>
        <div className="space-y-4">
          <MessageBubble
            author={{
              id: ticket.requester.id,
              full_name: ticket.requester.full_name,
              avatar_url: ticket.requester.avatar_url,
              email: ticket.requester.email,
            }}
            content={ticket.description}
            timestamp={ticket.created_at}
            isOwn={ticket.requester_id === user?.id}
            isInitialMessage
            attachments={ticket.attachments}
            requesterId={ticket.requester_id}
          />
          
          {comments.map(comment => {
            if (comment.is_internal && !isTechnician) return null;
            return (
              <MessageBubble
                key={comment.id}
                author={{
                  id: comment.author.id,
                  full_name: comment.author.full_name,
                  avatar_url: comment.author.avatar_url,
                  email: comment.author.email,
                }}
                content={comment.content}
                timestamp={comment.created_at}
                isOwn={comment.author_id === user?.id}
                isInternal={comment.is_internal}
                attachments={comment.attachments}
                requesterId={ticket.requester_id}
              />
            );
          })}
          
          {/* O `closed` antigo é um Resolvido (dono, 2026-10-04) — não há mais aviso de "Fechado". */}
          {contaComoResolvido(ticket.status) && ticket.resolution_notes && (
            <div className="p-4 badge-success dark:badge-success/30 border border-status-success dark:border-border rounded-lg">
              <div className="text-xs font-medium text-status-success dark:text-status-success mb-1">Chamado Resolvido</div>
              <p className="text-sm text-status-success dark:text-status-success">{ticket.resolution_notes}</p>
              {ticket.resolved_at && (
                <p className="text-xs text-status-success dark:text-status-success mt-2">
                  Resolvido em {new Date(ticket.resolved_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}
          
          {ticket.status === 'cancelled' && (
            <div className="p-4 badge-danger dark:badge-danger/30 border border-status-danger dark:border-status-danger rounded-lg">
              <div className="text-xs font-medium text-status-danger dark:text-status-danger mb-1">Chamado Cancelado</div>
              <p className="text-sm text-status-danger dark:text-status-danger">Este chamado foi cancelado.</p>
            </div>
          )}
        </div>
      </div>
      
      {!isClosed ? (
        <ReplyComposer
          ticketId={ticketId}
          onReply={handleReply}
          isSending={isSending}
          showInternalOption={showInternalOption && pode('internal_notes')}
          placeholder={isTechnician ? "Responda ao usuário..." : "Digite sua resposta..."}
          showMentionButton={isTechnician}
          onMentionClick={() => setMentionOpen(true)}
        />
      ) : (
        <div className="p-4 border-t border-border bg-muted/30 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Este chamado está {ticket.status === 'cancelled' ? 'cancelado' : 'resolvido'}.
          </p>
        </div>
      )}

      {/* Mention Dialog */}
      {ticket && (
        <MentionDialog
          ticket={ticket as any}
          open={mentionOpen}
          onClose={() => setMentionOpen(false)}
          onMention={() => onUpdate?.()}
        />
      )}
    </div>
  );
}
