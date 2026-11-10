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
import { AtSign, Loader2, Lock, Globe } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface MentionDialogProps {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onMention?: () => void;
  /**
   * Quem vê a menção. Vem da escolha "Só a equipe" / "Para quem pediu" de quem escreve; pelo menu do chamado é
   * sempre só a equipe. O diálogo tinha uma chave própria ("Nota Interna / Apenas técnicos") que repetia a escolha e,
   * ligada, publicava a menção para quem abriu (chamado #386, 2026-11-10).
   */
  isInternal?: boolean;
}

export function MentionDialog({ 
  ticket, 
  open, 
  onClose,
  onMention,
  isInternal = true,
}: MentionDialogProps) {
  const { user } = useAuth();
  const { data: technicians, isLoading: loadingTechnicians } = useTechnicians();
  const { mentionTechnician, isLoading } = useTicketActions();
  
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [message, setMessage] = useState('');

  const availableTechnicians = technicians?.filter(t => t.id !== user?.id) || [];

  const handleSubmit = async () => {
    if (!selectedTechnician || !message.trim()) {
      toast.error('Selecione um colega e escreva a mensagem');
      return;
    }

    const tech = technicians?.find(t => t.id === selectedTechnician);
    if (!tech) return;

    try {
      await mentionTechnician(
        ticket.id, 
        selectedTechnician, 
        tech.full_name || tech.email, 
        message,
        isInternal
      );
      toast.success(`Menção enviada para ${tech.full_name || tech.email}`);
      onMention?.();
      handleClose();
    } catch (error) {
      toast.error('Erro ao enviar menção. Tente novamente ou avise o suporte.');
    }
  };

  const handleClose = () => {
    setSelectedTechnician('');
    setMessage('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-semibold">
            <AtSign className="w-4 h-4 text-accent" strokeWidth={2} />
            Mencionar Colega no Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technician" className="text-[14px]">Mencionar</Label>
            <Select
              value={selectedTechnician}
              onValueChange={setSelectedTechnician}
              disabled={loadingTechnicians}
            >
              <SelectTrigger id="technician" className="h-9 text-[14px] focus:ring-1 focus:ring-accent">
                <SelectValue placeholder="Selecione um colega" />
              </SelectTrigger>
              <SelectContent>
                {availableTechnicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id} className="text-[14px]">
                    {tech.full_name || tech.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message" className="text-[14px]">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Preciso de ajuda com…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="text-[14px] focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>

          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {isInternal ? <Lock className="w-4 h-4" aria-hidden="true" /> : <Globe className="w-4 h-4" aria-hidden="true" />}
            {isInternal ? 'Só a equipe vê esta mensagem' : 'Quem pediu também vê esta mensagem'}
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="h-8 text-[14px]">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedTechnician || !message.trim()} className="h-8 text-[14px]">
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar Menção'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
