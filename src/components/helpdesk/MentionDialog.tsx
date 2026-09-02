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
import { Switch } from '@/components/ui/switch';
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
}

export function MentionDialog({ 
  ticket, 
  open, 
  onClose,
  onMention
}: MentionDialogProps) {
  const { user } = useAuth();
  const { data: technicians, isLoading: loadingTechnicians } = useTechnicians();
  const { mentionTechnician, isLoading } = useTicketActions();
  
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [message, setMessage] = useState('');
  const [isInternal, setIsInternal] = useState(true);

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
    setIsInternal(true);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <AtSign className="w-4 h-4 text-accent" strokeWidth={2} />
            Mencionar Colega no Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technician" className="text-[13px]">Mencionar</Label>
            <Select
              value={selectedTechnician}
              onValueChange={setSelectedTechnician}
              disabled={loadingTechnicians}
            >
              <SelectTrigger id="technician" className="h-9 text-[13px] focus:ring-1 focus:ring-accent">
                <SelectValue placeholder="Selecione um colega" />
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
            <Label htmlFor="message" className="text-[13px]">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Preciso de ajuda com..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="text-[13px] focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary/60 rounded-md border border-border">
            <div className="flex items-center gap-2">
              {isInternal ? (
                <Lock className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Globe className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  {isInternal ? 'Nota Interna' : 'Resposta Pública'}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {isInternal 
                    ? 'Apenas técnicos verão esta mensagem' 
                    : 'O solicitante também verá esta mensagem'}
                </p>
              </div>
            </div>
            <Switch
              checked={!isInternal}
              onCheckedChange={(checked) => setIsInternal(!checked)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="h-8 text-[13px]">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedTechnician || !message.trim()} className="h-8 text-[13px]">
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Enviando...
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
