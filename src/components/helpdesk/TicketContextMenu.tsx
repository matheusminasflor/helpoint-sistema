import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useTicketActions } from '@/hooks/useTicketActions';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { TransferTicketDialog } from './TransferTicketDialog';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { MentionDialog } from './MentionDialog';
import { ResolveTicketDialog } from './ResolveTicketDialog';
import { toast } from 'sonner';
import { Play, Repeat, Pin, Timer, PauseCircle, CircleDot, CheckCircle2, MessageSquare } from 'lucide-react';
import type { TicketWithDetails, TicketStatus } from '@/types/helpdesk';

interface TicketContextMenuProps {
  ticket: TicketWithDetails;
  children: React.ReactNode;
  onUpdate?: () => void;
}

export function TicketContextMenu({ 
  ticket, 
  children, 
  onUpdate 
}: TicketContextMenuProps) {
  const { assignToMe, isLoading } = useTicketActions();
  const { pode, atende } = usePodeNoChamado(ticket.module);

  const [transferOpen, setTransferOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('in_progress');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);


  const handleAssign = async () => {
    try {
      await assignToMe(ticket.id);
      toast.success('Chamado assumido com sucesso');
      onUpdate?.();
    } catch (error) {
      toast.error('Erro ao assumir chamado. Tente novamente ou avise o suporte.');
    }
  };

  const openStatusDialog = (status: TicketStatus) => {
    setTargetStatus(status);
    setStatusDialogOpen(true);
  };

  if (!atende) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {/* Assumir - apenas se não atribuído */}
          {!ticket.assigned_to && pode('assume') && (
            <>
              <ContextMenuItem 
                onClick={handleAssign}
                disabled={isLoading}
                className="gap-2"
              >
                <Play className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                Assumir Chamado
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          {/* Transferir: a caixinha do perfil */}
          {ticket.assigned_to && pode('transfer') && (
            <>
              <ContextMenuItem 
                onClick={() => setTransferOpen(true)}
                className="gap-2"
              >
                <Repeat className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                Transferir para...
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          {/* Alterar Status - submenu */}
          {pode('change_status') && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2">
                  <Pin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  Alterar Status
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  {ticket.status !== 'in_progress' && (
                    <ContextMenuItem onClick={() => openStatusDialog('in_progress')} className="gap-2">
                      <Timer className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      Em Andamento
                    </ContextMenuItem>
                  )}
                  {/* Um "Pendente" só — ver `TicketActionsBar`. */}
                  {ticket.status !== 'waiting_user' && ticket.status !== 'waiting_parts' && (
                    <ContextMenuItem onClick={() => openStatusDialog('waiting_user')} className="gap-2">
                      <PauseCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      Pendente
                    </ContextMenuItem>
                  )}
                  {ticket.status !== 'open' && (
                    <ContextMenuItem onClick={() => openStatusDialog('open')} className="gap-2">
                      <CircleDot className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      Reabrir (Aberto)
                    </ContextMenuItem>
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          )}

          {/* Resolver: "Resolver" no perfil */}
          {pode('close') && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <ContextMenuItem 
              onClick={() => setResolveOpen(true)}
              className="gap-2 text-status-success dark:text-status-success"
            >
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Marcar como Resolvido
            </ContextMenuItem>
          )}

          {/* Mencionar - sempre disponível para técnicos */}
          <ContextMenuItem 
            onClick={() => setMentionOpen(true)}
            className="gap-2"
          >
            <MessageSquare className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            Mencionar Atendente
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Dialogs */}
      <TransferTicketDialog
        ticket={ticket}
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransfer={() => onUpdate?.()}
      />

      <ChangeStatusDialog
        ticket={ticket}
        targetStatus={targetStatus}
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        onConfirm={() => onUpdate?.()}
      />

      <MentionDialog
        ticket={ticket}
        open={mentionOpen}
        onClose={() => setMentionOpen(false)}
        onMention={() => onUpdate?.()}
      />

      <ResolveTicketDialog
        ticket={ticket}
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onResolve={() => onUpdate?.()}
      />
    </>
  );
}
