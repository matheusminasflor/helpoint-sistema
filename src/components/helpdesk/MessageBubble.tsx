import { useLinksAssinados } from '@/hooks/useLinksAssinados';
import { cn, sanitizeContent } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Paperclip, Lock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


interface Author {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
  email?: string;
}

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
}

interface MessageBubbleProps {
  author: Author;
  content: string;
  timestamp: string;
  isOwn?: boolean;
  isInternal?: boolean;
  isInitialMessage?: boolean;
  attachments?: Attachment[];
  /** ID of the requester to determine if author is requester or technician */
  requesterId?: string;
}

export function MessageBubble({ 
  author, 
  content, 
  timestamp, 
  isOwn = false,
  isInternal = false,
  isInitialMessage = false,
  attachments = [],
  requesterId
}: MessageBubbleProps) {
  const linksDoAnexo = useLinksAssinados(attachments.map(a => a.file_url));
  const initials = author.full_name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const formattedTime = formatDistanceToNow(new Date(timestamp), { 
    locale: ptBR, 
    addSuffix: true 
  });
  
  const fullTime = format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  return (
    <div className={cn(
      "flex gap-3",
      isOwn ? "flex-row-reverse" : "flex-row"
    )}>
      {/* Avatar */}
      <Avatar className={cn(
        "flex-shrink-0",
        isInternal ? "ring-2 ring-status-warning ring-offset-2" : ""
      )}>
        <AvatarImage src={author.avatar_url || undefined} />
        <AvatarFallback className={cn(
          isOwn 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground"
        )}>
          {initials}
        </AvatarFallback>
      </Avatar>
      
      {/* Bubble Container */}
      <div className={cn(
        "max-w-[75%] flex flex-col gap-1",
        isOwn ? "items-end" : "items-start"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center gap-2 px-1",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}>
          <span className="text-xs font-medium text-foreground">
            {isOwn ? 'Você' : author.full_name || 'Usuário'}
          </span>
          {/* Role indicator - only show for others' messages */}
          {!isOwn && requesterId && (
            <span className={cn(
              "text-[12px] px-1.5 py-0.5 rounded",
              author.id === requesterId 
                ? "badge-info text-status-info dark:bg-status-info/30 dark:text-status-info" 
                : "badge-success text-status-success dark:badge-success/30 dark:text-status-success"
            )}>
              {author.id === requesterId ? 'Quem abriu' : 'Atendente'}
            </span>
          )}
          <span 
            className="text-[12px] text-muted-foreground cursor-help" 
            title={fullTime}
          >
            {formattedTime}
          </span>
          {isInternal && (
            <Badge variant="outline" className="text-[12px] px-1.5 py-0 h-4 gap-1 border-status-warning text-status-warning dark:border-border dark:text-status-warning">
              <Lock className="w-2.5 h-2.5" />
              Interno
            </Badge>
          )}
        </div>
        
        {/* Bubble */}
        <div className={cn(
          "rounded-2xl px-4 py-2.5",
          isOwn 
            ? "bg-primary text-primary-foreground rounded-br-md" 
            : "bg-muted text-foreground rounded-bl-md",
          isInternal && "border-2 border-dashed border-border badge-warning text-status-warning dark:border-border dark:badge-warning/50 dark:text-status-warning",
          isInitialMessage && "bg-card border border-border text-foreground rounded-2xl"
        )}>
          {/* Initial message label */}
          {isInitialMessage && (
            <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Descrição do Chamado
            </div>
          )}
          
          {/* Content */}
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{sanitizeContent(content)}</p>
          
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-current/10">
              {attachments.map(att => {
                const link = linksDoAnexo[att.file_url];

                return (
                  <a
                    key={att.id}
                    href={link}
                    aria-disabled={!link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                      // A descrição é caixa clara mesmo para quem abriu: com o estilo da bolha azul o anexo saía branco
                      // no branco, e o solicitante não via o próprio anexo (#152, 2026-10-20).
                      isOwn && !isInitialMessage
                        ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
                        : "bg-background hover:bg-accent text-foreground"
                    )}
                  >
                    <Paperclip className="w-3 h-3" />
                    <span className="max-w-[150px] truncate">{att.file_name}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// System message for status changes
export function SystemMessage({ message, timestamp }: { message: string; timestamp: string }) {
  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full text-xs text-muted-foreground">
        <span>{message}</span>
        <span>•</span>
        <span>{formatDistanceToNow(new Date(timestamp), { locale: ptBR, addSuffix: true })}</span>
      </div>
    </div>
  );
}
