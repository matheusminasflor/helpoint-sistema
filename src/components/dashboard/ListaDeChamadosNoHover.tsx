// A lista de chamados por trás de um número, ao passar o mouse.
//
// Nasceu dentro de `IndicatorsView` (as linhas Abertos / Em andamento / Resolvidos dos Indicadores
// da TI). O dono pediu (2026-10-04) que todo número da Análise detalhada, em todo setor, mostre
// QUAIS chamados estão nele — então o mesmo hover saiu para cá e é usado nas tabelas de categoria
// × status, nas linhas de indicador e nas telas de RH, Marketing e dos demais setores.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useTenantPath } from '@/hooks/useTenantPath';
import { ticketDetailPath } from '@/lib/ticket-route';

export interface ChamadoNoHover {
  id: string;
  ticket_number: number;
  title: string;
  created_at: string;
  assignee?: { full_name?: string | null; email?: string | null } | null;
}

interface Props {
  /** Título do cartão ("Resolvidos", "Hardware · Abertos"…). */
  titulo: string;
  /** Linha de baixo do título; o padrão diz quantos são. */
  subtitulo?: string;
  chamados: ChamadoNoHover[];
  /** O setor (`tickets.module`) — é ele que diz para qual tela o clique leva. */
  modulo?: string;
  vazio?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

const LIMITE = 25;

export function ListaDeChamadosNoHover({ titulo, subtitulo, chamados, modulo, vazio, side = 'right', children }: Props) {
  const tenantPath = useTenantPath();
  const lista = chamados.slice(0, LIMITE);

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} className="w-[360px] p-0">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-foreground">{titulo}</p>
          <p className="text-[10px] text-muted-foreground">
            {subtitulo ?? `${chamados.length} ${chamados.length === 1 ? 'chamado' : 'chamados'} · clique para abrir`}
          </p>
        </div>
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">{vazio ?? 'Nenhum chamado.'}</p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto">
            {lista.map(t => (
              <Link
                key={t.id}
                to={tenantPath(ticketDetailPath(modulo, t.id))}
                className="block w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/40 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">#{t.ticket_number}</span>
                  <span className="text-xs text-foreground truncate flex-1">{t.title}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {t.assignee?.full_name || t.assignee?.email || 'Sem responsável'} · {format(new Date(t.created_at), 'dd/MM/yy HH:mm')}
                </div>
              </Link>
            ))}
            {chamados.length > lista.length && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                + {chamados.length - lista.length} outros
              </p>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
