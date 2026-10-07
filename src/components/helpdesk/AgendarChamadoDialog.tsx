// Agendar quando o chamado vai ser tratado (decisão do dono, 2026-10-07): o prazo pausa até a data
// marcada, o solicitante é avisado e, na hora, o chamado volta sozinho para Em andamento (o banco
// faz — 20261214020000). Pede a caixinha "Mudar prioridade e prazo".
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTicketActions } from '@/hooks/useTicketActions';
import { mensagemDeErro } from '@/lib/supabase-result';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface Props {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** `yyyy-MM-ddTHH:mm` no horário local — o formato do `<input type="datetime-local">`. */
const paraCampo = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function AgendarChamadoDialog({ ticket, open, onClose, onConfirm }: Props) {
  const { agendar, isLoading } = useTicketActions();
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState('');

  const data = quando ? new Date(quando) : null;
  const valida = !!data && !Number.isNaN(data.getTime()) && data.getTime() > Date.now();

  const fechar = () => {
    setQuando('');
    setMotivo('');
    onClose();
  };

  const confirmar = async () => {
    if (!data || !valida || !motivo.trim()) return;
    try {
      await agendar(ticket.id, data, motivo.trim());
      toast.success('Chamado agendado. O prazo fica pausado até lá.');
      onConfirm();
      fechar();
    } catch (e) {
      toast.error(`Não foi possível agendar: ${mensagemDeErro(e)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
            Agendar o chamado #{ticket.ticket_number}
          </DialogTitle>
          <DialogDescription>
            O prazo fica pausado até a data marcada e o solicitante é avisado. Na hora, o chamado volta
            sozinho para Em andamento (em até 5 minutos).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agendar-quando">Quando vou tratar</Label>
            <Input id="agendar-quando" type="datetime-local" value={quando} min={paraCampo(new Date())}
              onChange={(e) => setQuando(e.target.value)} />
            {quando && !valida && <p className="text-xs text-destructive">Escolha uma data e hora no futuro.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="agendar-motivo">Motivo</Label>
            <Textarea id="agendar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
              placeholder="Ex.: fila cheia hoje; trato na quinta de manhã." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={isLoading}>Cancelar</Button>
          <Button onClick={confirmar} disabled={isLoading || !valida || !motivo.trim()} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
