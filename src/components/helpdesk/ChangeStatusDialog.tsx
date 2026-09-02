import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTicketActions } from '@/hooks/useTicketActions';
import { toast } from 'sonner';
import { Loader2, Settings2, CircleDot, Timer, MailQuestion, PauseCircle, CheckCircle2, Lock, XCircle, type LucideIcon } from 'lucide-react';
import type { TicketStatus, TicketWithDetails } from '@/types/helpdesk';
import { getTicketStatusLabel } from '@/types/helpdesk';

interface ChangeStatusDialogProps {
  ticket: TicketWithDetails;
  targetStatus: TicketStatus;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isBlocked?: boolean;
  blockedMessage?: string;
}

const statusIcons: Record<TicketStatus, LucideIcon> = {
  open: CircleDot,
  in_progress: Timer,
  waiting_user: MailQuestion,
  waiting_parts: PauseCircle,
  resolved: CheckCircle2,
  closed: Lock,
  cancelled: XCircle,
  rejected: XCircle,
};

export function ChangeStatusDialog({ 
  ticket, 
  targetStatus, 
  open, 
  onClose, 
  onConfirm,
  isBlocked = false,
  blockedMessage = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.'
}: ChangeStatusDialogProps) {
  const { changeStatus, isLoading } = useTicketActions();
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (isBlocked) {
      toast.warning(blockedMessage);
      return;
    }

    if (!reason.trim()) {
      toast.error('Informe o motivo da alteração de status');
      return;
    }

    try {
      await changeStatus(ticket.id, targetStatus, reason);
      toast.success(`Status alterado para ${getTicketStatusLabel(targetStatus)}`);
      onConfirm();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar status');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <Settings2 className="w-4 h-4 text-accent" strokeWidth={2} />
            Alterar Status do Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isBlocked && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-[13px] text-destructive">{blockedMessage}</p>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-secondary/60 rounded-md border border-border">
            {(() => { const StatusIcon = statusIcons[targetStatus]; return <StatusIcon className="w-5 h-5 text-primary" aria-hidden="true" />; })()}
            <div>
              <p className="text-[12px] text-muted-foreground">Novo status</p>
              <p className="text-[13px] font-semibold text-foreground">{getTicketStatusLabel(targetStatus)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-[13px]">Motivo da alteração *</Label>
            <Textarea
              id="reason"
              placeholder="Explique o motivo da alteração de status..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={isBlocked}
              className="text-[13px] focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent"
            />
            <p className="text-[12px] text-muted-foreground">
              Este motivo ficará registrado no histórico do chamado.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="h-8 text-[13px]">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || isBlocked || !reason.trim()} className="h-8 text-[13px]">
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
