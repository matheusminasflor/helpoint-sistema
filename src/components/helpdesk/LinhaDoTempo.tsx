import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { dataHora } from '@/lib/dates';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { PRIORITY_LABELS } from '@/lib/automation-flow';
import { getTicketStatusLabel, type TicketStatus } from '@/types/helpdesk';

interface Evento { quando: string; autor: string | null; tipo: string; de: string | null; para: string | null; de_nome: string | null; para_nome: string | null }

const setor = (m: string | null) => {
  const s = m ? setorDoModulo(m) : null;
  return s ? DEPARTMENT_SCHEMAS[s].label : (m ?? '—');
};

function frase(e: Evento): string {
  switch (e.tipo) {
    case 'abriu': return `abriu o chamado (${setor(e.para)})${e.para_nome ? `, já com ${e.para_nome}` : ''}`
      + `${e.de && e.de !== 'open' ? ` · ${getTicketStatusLabel(e.de as TicketStatus)}` : ''}`;
    case 'status': return `${e.de ? `${getTicketStatusLabel(e.de as TicketStatus)} → ` : ''}${getTicketStatusLabel(e.para as TicketStatus)}`;
    case 'atendente': return e.para_nome ? (e.de_nome ? `passou de ${e.de_nome} para ${e.para_nome}` : `ficou com ${e.para_nome}`) : 'ficou sem atendente';
    case 'setor': return `mudou de setor: ${setor(e.de)} → ${setor(e.para)}`;
    case 'prioridade': return `prioridade ${PRIORITY_LABELS[e.de ?? ''] ?? e.de} → ${PRIORITY_LABELS[e.para ?? ''] ?? e.para}`;
    default: return e.tipo;
  }
}

/**
 * A linha do tempo do chamado (etapa 4 · Chamados, 2026-10-24): abertura, cada status, atendente, setor e prioridade,
 * com hora e autor. Vem de `linha_do_tempo_do_chamado`, que lê o registro de auditoria que o banco já guardava.
 */
export function LinhaDoTempo({ ticketId }: { ticketId: string }) {
  const { tenantId } = useAuth();
  const { data: eventos = [], isLoading, isError } = useQuery({
    queryKey: ['linha-do-tempo', tenantId, ticketId],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.rpc('linha_do_tempo_do_chamado' as never, { p_ticket: ticketId } as never)) ?? []) as unknown as Evento[],
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-[14px] font-semibold flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        Linha do tempo
      </h3>
      {isLoading ? <p className="text-[13px] text-muted-foreground">Carregando…</p>
        : isError ? <p className="text-[13px] text-status-danger">Não consegui carregar a linha do tempo.</p>
        : eventos.length === 0 ? <p className="text-[13px] text-muted-foreground">Sem movimentações registradas.</p>
        : (
          <ol className="space-y-2.5 border-l border-border pl-4">
            {eventos.map((e, i) => (
              <li key={i} className="relative text-[13px]">
                <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-foreground" aria-hidden="true" />
                <span className="text-muted-foreground tabular-nums">{dataHora(e.quando)}</span>
                {' · '}
                <span className="font-medium">{e.autor ?? 'Sistema'}</span>{' '}
                <span>{frase(e)}</span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
