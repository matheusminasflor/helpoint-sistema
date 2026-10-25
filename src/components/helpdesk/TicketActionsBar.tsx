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
import { useTicketActions } from '@/hooks/useTicketActions';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { useEuAtendoJunto } from '@/hooks/useAtenderJunto';
import { useTicketChecklist } from '@/hooks/useComplianceChecklists';
import { usePurchaseRequestByTicket } from '@/hooks/usePurchases';
import { TransferTicketDialog } from './TransferTicketDialog';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { ResolveTicketDialog } from './ResolveTicketDialog';
import { ChangeCategoryDialog } from './ChangeCategoryDialog';
import { AgendarChamadoDialog } from './AgendarChamadoDialog';
import { toast } from 'sonner';
import { feitoComDesfazer } from '@/lib/desfazer';
import { 
  Play, 
  ArrowRightLeft, 
  Settings2, 
  CheckCircle2, 
  ChevronDown,
  Loader2,
  RotateCcw,
  Wrench,
  XCircle,
  Trash2,
  Tags,
  CalendarClock
} from 'lucide-react';
import type { TicketWithDetails, TicketStatus } from '@/types/helpdesk';
import { CreateMaintenanceDialog } from './CreateMaintenanceDialog';
import { useAuth } from '@/contexts/AuthContext';


interface TicketActionsBarProps {
  ticket: TicketWithDetails;
  onUpdate?: () => void;
  /** Mostra a ação na tela antes de o banco gravar ("Feito · Desfazer", 8 s). */
  onPatch?: (p: Partial<TicketWithDetails>) => void;
  compact?: boolean;
}

const CHECKLIST_BLOCK_MESSAGE = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.';

export function TicketActionsBar({ 
  ticket, 
  onUpdate,
  onPatch,
  compact = false
}: TicketActionsBarProps) {
  const { assignToMe, deleteTicket, isLoading } = useTicketActions();
  const { user } = useAuth();
  const euAtendoJunto = useEuAtendoJunto(ticket.id);
  const { pode, atende } = usePodeNoChamado(ticket.module, euAtendoJunto);
  const { guardrail } = useTicketChecklist(ticket.id);
  const navigate = useNavigate();
  
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('in_progress');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);

  // Compra aprovada só fecha em "Registrar compra feita" (dono, 2026-10-09): é ele que lança a conta a
  // pagar. O banco recusa o Resolver comum (`compras_so_fecha_registrando`); aqui o botão nem aparece.
  const { data: compra } = usePurchaseRequestByTicket(ticket.module === 'compras' ? ticket.id : null);
  const compraAguardandoRegistro = compra?.status === 'approved';
  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const isFinalState = ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'cancelled';
  const isChecklistBlocking = !guardrail.canClose;
  // Manutenção é de ativo de TI; em chamado de outro módulo não faz sentido.
  const isTIModule = !ticket.module || ticket.module === 'tickets';

  // "Feito · Desfazer" (regra 1, 2026-10-24): a tela já mostra o chamado com você; o banco grava em 8 s.
  const handleAssign = () => {
    const antes = { assigned_to: ticket.assigned_to, assignee: ticket.assignee, status: ticket.status };
    onPatch?.({
      assigned_to: user?.id ?? null,
      assignee: { id: user?.id ?? '', full_name: user?.user_metadata?.full_name ?? null, email: user?.email ?? '', avatar_url: null },
      status: ticket.status === 'open' ? 'in_progress' : ticket.status,
    } as Partial<TicketWithDetails>);
    feitoComDesfazer({
      chave: `chamado:${ticket.id}`,
      mensagem: 'Chamado assumido',
      gravar: () => assignToMe(ticket.id),
      aoDesfazer: () => onPatch?.(antes as Partial<TicketWithDetails>),
      depois: (erro) => {
        if (erro) toast.error('Não consegui assumir o chamado. Tente de novo ou avise o suporte.');
        onUpdate?.();
      },
    });
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

  if (!atende) return null;

  const buttonSize = compact ? 'sm' : 'default';

  return (
    <TooltipProvider delayDuration={300}>
      <>
        <div className="flex flex-wrap gap-2">
          {/* Assumir: o chamado sem atendente, para quem tem "Assumir"; o de OUTRA pessoa, para quem pode transferir — o
              Gestor (dono, 2026-10-15: "o Gestor não consegue assumir o chamado quando necessário"). No banco é transferir
              para si, e o prazo recomeça para quem assume, como em toda transferência. */}
          {((!ticket.assigned_to && pode('assume')) || (!!ticket.assigned_to && ticket.assigned_to !== user?.id && pode('transfer') && !isFinalState)) && (
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
                    <Play className="w-4 h-4" aria-hidden="true" />
                  )}
                  Assumir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Assumir responsabilidade pelo chamado</TooltipContent>
            </Tooltip>
          )}

          {/* Sem atendente vira "Atribuir" (dono, 2026-10-20: no #149, sem ninguém, não dava para pôr a Merilyn — só
              "Assumir" aparecia, e o "Atribuir" da fila não existia aqui). No banco é o mesmo "transferir". */}
          {pode('transfer') && (!!ticket.assigned_to || !isFinalState) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setTransferOpen(true)}
                  className="gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                  {(ticket.assigned_to ? 'Transferir' : 'Atribuir')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ticket.assigned_to ? 'Transferir chamado para outra pessoa' : 'Escolher quem vai atender'}</TooltipContent>
            </Tooltip>
          )}

          {pode('change_status') && !isFinalState && isTIModule && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setMaintenanceOpen(true)}
                  className="gap-2"
                >
                  <Wrench className="w-4 h-4" aria-hidden="true" />
                  {'Manutenção'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Agendar manutenção vinculada ao chamado</TooltipContent>
            </Tooltip>
          )}

          {pode('change_status') && !isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size={buttonSize} className="gap-2">
                        <Settings2 className="w-4 h-4" aria-hidden="true" />
                        {'Status'}
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {ticket.status !== 'in_progress' && (
                        <DropdownMenuItem onClick={() => openStatusDialog('in_progress')} className="gap-2">
                          Em andamento
                        </DropdownMenuItem>
                      )}
                      {/* Um "Pendente" só (dono, 2026-10-04: Aberto, Em andamento, Pendente, Resolvido).
                          É `waiting_user`, que avisa o solicitante; `waiting_parts` sobra no banco
                          e aparece com o mesmo nome. */}
                      {ticket.status !== 'waiting_user' && ticket.status !== 'waiting_parts' && (
                        <DropdownMenuItem onClick={() => openStatusDialog('waiting_user')} className="gap-2">
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

          {/* Agendar (dono, 2026-10-07): caixinha própria "Agendar" desde 2026-10-14 (todo operador agenda). */}
          {/* Em Compras, só depois de aprovada (dono, 2026-10-14): antes o status segue a aprovação, e o prazo só começa nela. */}
          {pode('schedule') && !isFinalState && (ticket.module !== 'compras' || ['in_progress', 'scheduled'].includes(ticket.status)) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setAgendarOpen(true)}
                  className="gap-2"
                >
                  <CalendarClock className="w-4 h-4" aria-hidden="true" />
                  {(ticket.status === 'scheduled' ? 'Reagendar' : 'Agendar')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Marcar quando vai tratar — o prazo pausa até lá</TooltipContent>
            </Tooltip>
          )}

          {pode('change_category') && !isFinalState && ticket.module !== 'compras' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => setCategoryOpen(true)}
                  className="gap-2"
                >
                  <Tags className="w-4 h-4" aria-hidden="true" />
                  {'Categoria'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mudar a categoria (só deste setor)</TooltipContent>
            </Tooltip>
          )}

          {pode('reopen') && isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => openStatusDialog('open')}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  {'Reabrir'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reabrir chamado (motivo obrigatório)</TooltipContent>
            </Tooltip>
          )}

          {compraAguardandoRegistro && !isResolved && (
            <span className="self-center text-[13px] text-muted-foreground">
              Compra aprovada: feche em "Registrar compra feita", no painel da compra.
            </span>
          )}

          {pode('close') && !isResolved && !compraAguardandoRegistro && (
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
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    {'Resolver'}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isChecklistBlocking ? CHECKLIST_BLOCK_MESSAGE : 'Marcar chamado como resolvido'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* O botão "Fechar" saiu (dono, 2026-10-04: "está resolvido, está resolvido"). Resolvido é
              o fim do chamado; a avaliação do solicitante é opcional e não muda o status. */}

          {/* Cancelar conta como encerrar: "Resolver" no perfil */}
          {pode('close') && !isFinalState && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => openStatusDialog('cancelled')}
                  className="gap-2 text-muted-foreground hover:text-destructive"
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  {'Cancelar'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancelar chamado (motivo obrigatório)</TooltipContent>
            </Tooltip>
          )}

          {/* Excluir: a caixinha do perfil (dono/admin sempre) */}
          {pode('delete') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={buttonSize}
                  onClick={() => setDeleteOpen(true)}
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  {'Excluir'}
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
          onPatch={onPatch}
          isBlocked={(targetStatus === 'resolved' || targetStatus === 'closed') && isChecklistBlocking}
          blockedMessage={CHECKLIST_BLOCK_MESSAGE}
        />

        <ChangeCategoryDialog
          ticket={ticket}
          open={categoryOpen}
          onClose={() => setCategoryOpen(false)}
          onConfirm={() => onUpdate?.()}
        />

        <AgendarChamadoDialog
          ticket={ticket}
          open={agendarOpen}
          onClose={() => setAgendarOpen(false)}
          onConfirm={() => onUpdate?.()}
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

