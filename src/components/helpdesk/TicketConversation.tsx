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
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';

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
  const { user, role } = useAuth();
  const { ticket, isLoading: isLoadingTicket } = useTicketDetail(ticketId);
  const { comments, isLoading: isLoadingComments } = useTicketComments(ticketId);
  const { addComment, isSending } = useAddComment();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: tiProfile } = useMyAccessProfile('ti');
  const [mentionOpen, setMentionOpen] = useState(false);
  
  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;

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
          
          {ticket.status === 'resolved' && ticket.resolution_notes && (
            <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Chamado Resolvido</div>
              <p className="text-sm text-green-800 dark:text-green-200">{ticket.resolution_notes}</p>
              {ticket.resolved_at && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Resolvido em {new Date(ticket.resolved_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}
          
          {ticket.status === 'closed' && (
            <div className="p-4 bg-muted border border-border rounded-lg">
              <div className="text-xs font-medium text-muted-foreground mb-1">Chamado Fechado</div>
              <p className="text-sm text-muted-foreground">Este chamado foi encerrado.</p>
            </div>
          )}
          
          {ticket.status === 'cancelled' && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Chamado Cancelado</div>
              <p className="text-sm text-red-800 dark:text-red-200">Este chamado foi cancelado.</p>
            </div>
          )}
        </div>
      </div>
      
      {!isClosed ? (
        <ReplyComposer
          ticketId={ticketId}
          onReply={handleReply}
          isSending={isSending}
          showInternalOption={showInternalOption && isTechnician}
          placeholder={isTechnician ? "Responda ao usuário..." : "Digite sua resposta..."}
          showMentionButton={isTechnician}
          onMentionClick={() => setMentionOpen(true)}
        />
      ) : (
        <div className="p-4 border-t border-border bg-muted/30 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Este chamado está {ticket.status === 'resolved' ? 'resolvido' : ticket.status === 'cancelled' ? 'cancelado' : 'fechado'}.
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
