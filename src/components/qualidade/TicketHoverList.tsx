import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useTenantPath } from '@/hooks/useTenantPath';
import { Badge } from '@/components/ui/badge';

export interface HoverTicket {
  id: string;
  protocol: string;
  customer?: string | null;
  status?: string | null;
  created_at?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_analysis: 'Em análise',
  awaiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

interface Props {
  tickets: HoverTicket[];
  title?: string;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function TicketHoverList({ tickets, title, children, align = 'start' }: Props) {
  const tp = useTenantPath();
  if (!tickets || tickets.length === 0) {
    return <>{children}</>;
  }
  const list = tickets.slice(0, 25);
  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer hover:bg-muted/40 -mx-1 px-1 rounded transition-colors">
          {children}
        </div>
      </HoverCardTrigger>

      <HoverCardContent align={align} className="w-80 p-0 max-h-96 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold">{title || 'SACs relacionados'}</span>
          <Badge variant="secondary" className="text-[10px]">{tickets.length}</Badge>
        </div>
        <ul className="overflow-y-auto divide-y divide-border/50">
          {list.map(t => (
            <li key={t.id}>
              <Link
                to={tp(`/qualidade/sacs/${t.id}`)}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-medium truncate">{t.protocol}</div>
                  {t.customer && <div className="text-muted-foreground truncate">{t.customer}</div>}
                </div>
                {t.status && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {STATUS_LABEL[t.status] || t.status}
                  </Badge>
                )}
              </Link>
            </li>
          ))}
          {tickets.length > list.length && (
            <li className="px-3 py-2 text-[11px] text-muted-foreground text-center">
              + {tickets.length - list.length} adicionais
            </li>
          )}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
