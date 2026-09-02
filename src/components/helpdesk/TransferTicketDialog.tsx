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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface TransferTicketDialogProps {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onTransfer: () => void;
}

export function TransferTicketDialog({ 
  ticket, 
  open, 
  onClose, 
  onTransfer 
}: TransferTicketDialogProps) {
  const { user } = useAuth();
  const { data: technicians, isLoading: loadingTechnicians } = useTechnicians();
  const { transferTicket, isLoading } = useTicketActions();
  
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [transferNote, setTransferNote] = useState('');

  const availableTechnicians = technicians?.filter(t => t.id !== user?.id) || [];

  const handleSubmit = async () => {
    if (!selectedTechnician || !transferNote.trim()) {
      toast.error('Selecione um técnico e informe o motivo da transferência');
      return;
    }

    const tech = technicians?.find(t => t.id === selectedTechnician);
    if (!tech) return;

    try {
      await transferTicket(ticket.id, selectedTechnician, tech.full_name || tech.email, transferNote);
      toast.success(`Chamado transferido para ${tech.full_name || tech.email}`);
      onTransfer();
      handleClose();
    } catch (error) {
      toast.error('Erro ao transferir chamado. Tente novamente ou avise o suporte.');
    }
  };

  const handleClose = () => {
    setSelectedTechnician('');
    setTransferNote('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <ArrowRightLeft className="w-4 h-4 text-accent" strokeWidth={2} />
            Transferir Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technician" className="text-[13px]">Transferir para</Label>
            <Select
              value={selectedTechnician}
              onValueChange={setSelectedTechnician}
              disabled={loadingTechnicians}
            >
              <SelectTrigger id="technician" className="h-9 text-[13px] focus:ring-1 focus:ring-accent">
                <SelectValue placeholder="Selecione um técnico" />
              </SelectTrigger>
              <SelectContent>
                {availableTechnicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id} className="text-[13px]">
                    {tech.full_name || tech.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note" className="text-[13px]">Motivo da transferência *</Label>
            <Textarea
              id="note"
              placeholder="Explique o motivo da transferência..."
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              rows={3}
              className="text-[13px] focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="h-8 text-[13px]">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedTechnician || !transferNote.trim()} className="h-8 text-[13px]">
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              'Transferir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
