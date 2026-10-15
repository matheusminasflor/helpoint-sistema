// Agendar quando o chamado vai ser tratado (decisão do dono, 2026-10-07): o prazo pausa até a data
// marcada, o solicitante é avisado e, na hora, o chamado volta sozinho para Em andamento (o banco
// faz — 20261214020000). Pede a caixinha "Agendar" e respeita o limite do setor (20270115010000).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTicketActions } from '@/hooks/useTicketActions';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { todayISO } from '@/lib/dates';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface Props {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Data e hora em campos SEPARADOS, com a hora já preenchida (dono, 2026-10-07: "não está
// salvando"). O `datetime-local` só tem valor com data E hora; escolhendo só o dia, o botão ficava
// apagado sem dizer por quê.
export function AgendarChamadoDialog({ ticket, open, onClose, onConfirm }: Props) {
  const { agendar, isLoading } = useTicketActions();
  const { tenantId } = useAuth();
  const vencido = !!ticket.sla_due_at && new Date(ticket.sla_due_at).getTime() <= Date.now();
  const { data: limite } = useQuery({
    queryKey: ['limite-de-agendamento', tenantId, ticket.module],
    enabled: open && !!tenantId,
    queryFn: async () => unwrap(await supabase.rpc('limite_de_agendamento' as never, { p_tenant: tenantId, p_module: ticket.module } as never)) as number,
  });
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('08:00');
  const [motivo, setMotivo] = useState('');

  const data = dia && hora ? new Date(`${dia}T${hora}`) : null;
  const valida = !!data && !Number.isNaN(data.getTime()) && data.getTime() > Date.now();
  const falta = !dia ? 'Escolha o dia.' : !hora ? 'Escolha a hora.' : !valida ? 'Escolha um dia e hora no futuro.'
    : !motivo.trim() ? 'Escreva o motivo.' : null;

  const fechar = () => {
    setDia('');
    setHora('08:00');
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
        {/* As regras do agendamento (dono, 2026-10-15; 20270115010000) — o banco recusa o que passar delas. */}
        <div className="space-y-2 text-[13px]">
          {vencido && (
            <p className="rounded-md border border-status-danger/40 bg-status-danger/5 px-3 py-2 text-status-danger">
              O prazo deste chamado já venceu. Agendar não tira o atraso: ele continua contando, e o gestor do setor é avisado.
            </p>
          )}
          <p className="text-muted-foreground">
            Limite do setor: <b>{limite ?? 3} dias úteis</b>. O operador agenda e reagenda uma vez; acima do limite ou da
            terceira data em diante, só o Gestor do setor.
            {(ticket.agendamentos ?? 0) > 0 && <> Este chamado já foi agendado {ticket.agendamentos} vez{ticket.agendamentos === 1 ? '' : 'es'}.</>}
          </p>
          <p className="text-muted-foreground">Esperando o retorno de quem pediu? Use <b>Responder e aguardar retorno</b> (Pendente), não Agendar.</p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="agendar-dia">Dia</Label>
              <Input id="agendar-dia" type="date" value={dia} min={todayISO()} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agendar-hora">Hora</Label>
              <Input id="agendar-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agendar-motivo">Motivo</Label>
            <Textarea id="agendar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
              placeholder="Ex.: fila cheia hoje; trato na quinta de manhã." />
          </div>
        </div>
        {falta && (dia || motivo) && <p className="text-[13px] text-muted-foreground">{falta}</p>}
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
