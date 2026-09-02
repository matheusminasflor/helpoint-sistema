import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';
import { useTicketChecklist } from '@/hooks/useComplianceChecklists';
import { TransferTicketDialog } from './TransferTicketDialog';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { ResolveTicketDialog } from './ResolveTicketDialog';
import { toast } from 'sonner';
import { 
  Play, 
  ArrowRightLeft, 
  Settings2, 
  CheckCircle2, 
  ChevronDown,
  Loader2,
  RotateCcw,
  Wrench,
  Lock,
  XCircle,
  Trash2
} from 'lucide-react';
import type { TicketWithDetails, TicketStatus } from '@/types/helpdesk';
import { CreateMaintenanceDialog } from './CreateMaintenanceDialog';


interface TicketActionsBarProps {
  ticket: TicketWithDetails;
  onUpdate?: () => void;
  compact?: boolean;
}

const CHECKLIST_BLOCK_MESSAGE = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.';

export function TicketActionsBar({ 
  ticket, 
  onUpdate,
  compact = false 
}: TicketActionsBarProps) {
  const { user, role } = useAuth();
  const { assignToMe, deleteTicket, isLoading } = useTicketActions();
  const { data: tiProfile } = useMyAccessProfile('ti');
  const { guardrail } = useTicketChecklist(ticket.id);
  const navigate = useNavigate();
  
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('in_progress');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isAdmin = ['admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;
  const isAssignedToMe = ticket.assigned_to === user?.id;
  const canManage = isAssignedToMe || isSupervisor;
  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const isClosed = ticket.status === 'closed';
  const isFinalState = ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'cancelled';
  const isChecklistBlocking = !guardrail.canClose;

  const handleAssign = async () => {
    try {
      await assignToMe(ticket.id);
      toast.success('Chamado assumido com sucesso');
      onUpdate?.();
    } catch (error) {
      toast.error('Erro ao assumir chamado. Tente novamente ou avise o suporte.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTicket(ticket.id);
      toast.success('Chamado excluído');
      setDeleteOpen(false);
      onUpdate?.();
      // se estiver na página completa do chamado, voltar
      if (window.location.pathname.includes('/chamado')) {
        navigate(-1);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao excluir chamado');
    }
  };


  const openStatusDialog = (status: TicketStatus) => {
    if ((status === 'resolved' || status === 'closed') && isChecklistBlocking) {
      toast.warning(CHECKLIST_BLOCK_MESSAGE);
      return;
    }

    setTargetStatus(status);
    setStatusDialogOpen(true);
  };

  if (!isTechnician) return null;

  const buttonSize = compact ? 'sm' : 'default';

  return (
    <TooltipProvider delayDuration={300}>
      <>
        <div className="flex flex-wrap gap-2">
          {!ticket.assigned_to && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size={buttonSize}
                  onClick={handleAssign}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Assumir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Assumir responsabilidade pelo chamado</TooltipContent>
            </Tooltip>
          )}

          {ticket.assigned_to && canManage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setTransferOpen(true)}
                  className="gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  {!compact && 'Transferir'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Transferir chamado para outro técnico</TooltipContent>
            </Tooltip>
          )}

          {canManage && !isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setMaintenanceOpen(true)}
                  className="gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  {!compact && 'Manutenção'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Agendar manutenção vinculada ao chamado</TooltipContent>
            </Tooltip>
          )}

          {canManage && !isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size={buttonSize} className="gap-2">
                        <Settings2 className="w-4 h-4" />
                        {!compact && 'Status'}
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {ticket.status !== 'in_progress' && (
                        <DropdownMenuItem onClick={() => openStatusDialog('in_progress')} className="gap-2">
                          ⏳ Em Andamento
                        </DropdownMenuItem>
                      )}
                      {ticket.status !== 'waiting_user' && (
                        <DropdownMenuItem onClick={() => openStatusDialog('waiting_user')} className="gap-2">
                          Aguardando Retorno do Usuário
                        </DropdownMenuItem>
                      )}
                      {ticket.status !== 'waiting_parts' && (
                        <DropdownMenuItem onClick={() => openStatusDialog('waiting_parts')} className="gap-2">
                          Pendente
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TooltipTrigger>
              <TooltipContent>Alterar status do chamado</TooltipContent>
            </Tooltip>
          )}

          {canManage && isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => openStatusDialog('open')}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {!compact && 'Reabrir'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reabrir chamado (motivo obrigatório)</TooltipContent>
            </Tooltip>
          )}

          {isAssignedToMe && !isResolved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="success"
                    size={buttonSize}
                    onClick={() => {
                      if (isChecklistBlocking) {
                        toast.warning(CHECKLIST_BLOCK_MESSAGE);
                        return;
                      }
                      setResolveOpen(true);
                    }}
                    className="gap-2"
                    disabled={isChecklistBlocking}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {!compact && 'Resolver'}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isChecklistBlocking ? CHECKLIST_BLOCK_MESSAGE : 'Marcar chamado como resolvido'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Fechar: aparece para chamados resolvidos */}
          {canManage && ticket.status === 'resolved' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => openStatusDialog('closed')}
                  className="gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {!compact && 'Fechar'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Encerrar definitivamente o chamado</TooltipContent>
            </Tooltip>
          )}

          {/* Cancelar: supervisor/admin enquanto não estiver finalizado */}
          {isSupervisor && !isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => openStatusDialog('cancelled')}
                  className="gap-2 text-muted-foreground hover:text-destructive"
                >
                  <XCircle className="w-4 h-4" />
                  {!compact && 'Cancelar'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancelar chamado (motivo obrigatório)</TooltipContent>
            </Tooltip>
          )}

          {/* Excluir: apenas owner/admin */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={buttonSize}
                  onClick={() => setDeleteOpen(true)}
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  {!compact && 'Excluir'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir chamado permanentemente</TooltipContent>
            </Tooltip>
          )}
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir chamado #{ticket.ticket_number}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é permanente e remove o chamado, comentários e anexos. Não é possível desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isLoading ? 'Excluindo...' : 'Excluir permanentemente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


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
          isBlocked={(targetStatus === 'resolved' || targetStatus === 'closed') && isChecklistBlocking}
          blockedMessage={CHECKLIST_BLOCK_MESSAGE}
        />

        <ResolveTicketDialog
          ticket={ticket}
          open={resolveOpen}
          onClose={() => setResolveOpen(false)}
          onResolve={() => onUpdate?.()}
          isBlocked={isChecklistBlocking}
          blockedMessage={CHECKLIST_BLOCK_MESSAGE}
        />

        <CreateMaintenanceDialog
          open={maintenanceOpen}
          onClose={() => setMaintenanceOpen(false)}
          ticketId={ticket.id}
          assetId={ticket.asset_id}
          assetName={ticket.asset?.name}
          onCreated={() => onUpdate?.()}
        />
      </>
    </TooltipProvider>
  );
}

