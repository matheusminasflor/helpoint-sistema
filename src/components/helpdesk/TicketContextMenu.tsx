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
import { useAuth } from '@/contexts/AuthContext';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';
import { TransferTicketDialog } from './TransferTicketDialog';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { MentionDialog } from './MentionDialog';
import { ResolveTicketDialog } from './ResolveTicketDialog';
import { toast } from 'sonner';
import { Play, Repeat, Pin, Timer, PauseCircle, Wrench, CircleDot, CheckCircle2, MessageSquare } from 'lucide-react';
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
  const { user, role } = useAuth();
  const { assignToMe, isLoading } = useTicketActions();
  const { data: tiProfile } = useMyAccessProfile('ti');
  
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('in_progress');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  // É técnico se tem perfil TI atribuído OU é supervisor/admin/owner
  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;
  const isAssignedToMe = ticket.assigned_to === user?.id;
  const canManage = isAssignedToMe || isSupervisor;

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

  if (!isTechnician) {
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
          {!ticket.assigned_to && (
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

          {/* Transferir - se atribuído a mim ou sou supervisor */}
          {ticket.assigned_to && canManage && (
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
          {canManage && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
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
                  {ticket.status !== 'waiting_user' && (
                    <ContextMenuItem onClick={() => openStatusDialog('waiting_user')} className="gap-2">
                      <PauseCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      Aguardando Usuário
                    </ContextMenuItem>
                  )}
                  {ticket.status !== 'waiting_parts' && (
                    <ContextMenuItem onClick={() => openStatusDialog('waiting_parts')} className="gap-2">
                      <Wrench className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      Aguardando Peças
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

          {/* Resolver - se atribuído a mim */}
          {isAssignedToMe && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <ContextMenuItem 
              onClick={() => setResolveOpen(true)}
              className="gap-2 text-green-600 dark:text-green-400"
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
