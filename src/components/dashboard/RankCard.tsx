import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketHoverList, type HoverTicket } from '@/components/qualidade/TicketHoverList';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';

export interface RankRow {
  label: string;
  count: number;
  extra?: string;
  tickets?: HoverTicket[];
}

interface RankCardProps {
  title: string;
  rows: RankRow[];
  emptyText?: string;
  /** Explicação ao passar o mouse no título (dono, 2026-10-04). */
  explicacao?: IdDaExplicacao;
}

export function RankCard({ title, rows, emptyText = 'Sem dados no período.', explicacao }: RankCardProps) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
        {title}
        {explicacao && <ExplicacaoDoIndicador id={explicacao} />}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const content = (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{i + 1}. {r.label}</span>
                <Badge variant="secondary">{r.count}</Badge>
              </div>
            );
            if (r.tickets && r.tickets.length > 0) {
              return (
                <TicketHoverList key={i} tickets={r.tickets} title={`SACs · ${r.label}`}>
                  {content}
                </TicketHoverList>
              );
            }
            return <div key={i}>{content}</div>;
          })}
        </div>

      )}
    </Card>
  );
}
