// A lista de chamados de todos os setores (fila e histórico, e "Minhas solicitações").
// 2026-10-04, decisão do dono: um chamado por linha, sem grupos por prioridade que abrem e fecham
// (o chamado de um grupo fechado ficava escondido) e sem o botão Confortável/Compacto. A prioridade
// está na coluna e na faixa colorida da linha; a ordem vem de quem chama (`ordenarPorUrgencia`).
import { useMemo, useState, useEffect } from 'react';
import { WorkOSTableHeader } from './WorkOSTableHeader';
import { WorkOSTableRow, ALTURA_DA_LINHA } from './WorkOSTableRow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Inbox, ChevronLeft, ChevronRight, Plus, FilterX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useIsBelow } from '@/hooks/use-mobile';
import type { TicketWithDetails } from '@/types/helpdesk';

const PAGE_SIZE = 50;

interface WorkOSTableProps {
  tickets: TicketWithDetails[];
  isLoading?: boolean;
  selectedTicketId?: string | null;
  onSelectTicket: (ticket: TicketWithDetails) => void;
  onUpdate?: () => void;
  emptyMessage?: string;
  simplified?: boolean;
  /** Há filtros aplicados? Muda a explicação e a ação do estado vazio. */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreate?: () => void;
  createLabel?: string;
}

export function WorkOSTable({
  tickets,
  isLoading,
  selectedTicketId,
  onSelectTicket,
  onUpdate,
  emptyMessage = 'Nenhum chamado encontrado',
  simplified = false,
  hasActiveFilters = false,
  onClearFilters,
  onCreate,
  createLabel = 'Nova solicitação',
}: WorkOSTableProps) {
  const isMobile = useIsBelow(768);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [tickets.length]);

  // Paginação: no máximo 50 chamados renderizados por vez
  const pageTickets = useMemo(
    () => tickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [tickets, page],
  );

  const gridCols = simplified
    ? 'grid-cols-[60px_1fr_100px]'
    : 'grid-cols-[60px_1fr_100px_80px_100px_90px]';

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {!isMobile && <WorkOSTableHeader gridCols={gridCols} simplified={simplified} />}
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{ height: isMobile ? 96 : ALTURA_DA_LINHA }}
              className={isMobile
                ? 'border-b border-border bg-card px-4 py-3 space-y-2'
                : `grid items-center gap-3 px-4 border-b border-border bg-card ${gridCols}`}
            >
              {isMobile ? (
                <>
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                </>
              ) : (
                Array.from({ length: simplified ? 3 : 6 }).map((__, c) => (
                  <div key={c} className="h-3 bg-muted animate-pulse rounded" />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        icon={FilterX}
        title="Nenhum resultado para os filtros aplicados"
        description="Os filtros atuais escondem todos os registros. Limpe os filtros para ver a lista completa."
        actionLabel={onClearFilters ? 'Limpar filtros' : undefined}
        actionIcon={FilterX}
        onAction={onClearFilters}
      />
    ) : (
      <EmptyState
        icon={Inbox}
        title={emptyMessage}
        description="Não há nada nesta lista agora. Quando um novo registro chegar, ele aparece aqui automaticamente."
        actionLabel={onCreate ? createLabel : undefined}
        actionIcon={Plus}
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        <span className="text-[12px] text-muted-foreground">
          <span className="font-mono">{tickets.length}</span> registros
        </span>
      </div>

      {!isMobile && <WorkOSTableHeader gridCols={gridCols} simplified={simplified} />}

      <ScrollArea className="flex-1">
        {pageTickets.map(ticket => (
          <WorkOSTableRow
            key={ticket.id}
            ticket={ticket}
            isSelected={selectedTicketId === ticket.id}
            onSelect={() => onSelectTicket(ticket)}
            onUpdate={onUpdate}
            gridCols={gridCols}
            simplified={simplified}
            asCard={isMobile}
          />
        ))}
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-card">
          <span className="text-[12px] text-muted-foreground">
            Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages}</span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[12px]"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[12px]"
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
