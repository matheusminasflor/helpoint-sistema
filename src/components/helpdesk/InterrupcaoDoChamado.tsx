import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChamadosDaQueda } from '@/hooks/useChamadosDaQueda';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TIPOS_DE_INTERRUPCAO, type TipoDeInterrupcao } from '@/hooks/useEquipeDaTI';
import { expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { ticketDetailPath } from '@/lib/ticket-route';
import { dataHora } from '@/lib/dates';
import { toast } from 'sonner';
import type { TicketWithDetails } from '@/types/helpdesk';

/** A linha "Interrupção" do chamado: quem pode corrigir a categoria marca ou desmarca, na hora. */
export function InterrupcaoDoChamado({ ticket, podeCorrigir, onMudou }: {
  ticket: TicketWithDetails; podeCorrigir: boolean; onMudou: () => void;
}) {
  const tenantPath = useTenantPath();
  const { data: chamados = [] } = useChamadosDaQueda(ticket.interrupcao_id);
  const marcar = useMutation({
    mutationFn: async (tipo: TipoDeInterrupcao | null) => {
      expectRows(await supabase.from('tickets').update({ interrupcao_tipo: tipo } as never).eq('id', ticket.id).select('id'), 'a interrupção');
    },
    onSuccess: onMudou,
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  const outros = chamados.filter((c) => c.id !== ticket.id);
  const valor = ticket.interrupcao_id ? ticket.interrupcao_tipo ?? 'nao' : 'nao';

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground shrink-0">Interrupção</dt>
        <dd className="w-40">
          <Select value={valor} disabled={!podeCorrigir || marcar.isPending}
            onValueChange={(v) => marcar.mutate(v === 'nao' ? null : v as TipoDeInterrupcao)}>
            <SelectTrigger className="h-8" aria-label="Conta como interrupção"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Não conta</SelectItem>
              {Object.entries(TIPOS_DE_INTERRUPCAO).map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </dd>
      </div>
      {ticket.interrupcao_id && (
        <p className="text-xs text-muted-foreground">
          {chamados[0] && <>Começou {dataHora(chamados[0].created_at)}. </>}
          {outros.length > 0 && <>Junto nesta queda: {outros.map((c, i) => (
            <span key={c.id}>{i > 0 && ', '}
              <Link className="underline" to={tenantPath(ticketDetailPath(ticket.module, c.id))}>#{c.ticket_number}</Link>
            </span>
          ))}.</>}
        </p>
      )}
    </div>
  );
}
