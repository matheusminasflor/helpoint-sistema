// A lista de chamados de todos os setores (fila e histórico, e "Minhas solicitações").
// 2026-10-04, decisão do dono: um chamado por linha, sem grupos por prioridade que abrem e fecham
// (o chamado de um grupo fechado ficava escondido) e sem o botão Confortável/Compacto. A prioridade
// está na coluna e na faixa colorida da linha; a ordem vem de quem chama (`ordenarPorUrgencia`).
import { useMemo, useState, useEffect } from 'react';
import { WorkOSTableHeader } from './WorkOSTableHeader';
import { WorkOSTableRow, ALTURA_DA_LINHA } from './WorkOSTableRow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Inbox, ChevronLeft, ChevronRight, Plus, FilterX, Download, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { casaBusca, exportarPlanilha, ordenarPor, proximaOrdem, type Ordem } from '@/lib/tabela';
import { getTicketStatusLabel } from '@/types/helpdesk';
import { PRIORITY_LABELS } from '@/lib/automation-flow';
import { dataHora } from '@/lib/dates';
import { EmptyState } from '@/components/ui/empty-state';
import { useIsBelow } from '@/hooks/use-mobile';
import type { TicketWithDetails } from '@/types/helpdesk';

const PAGE_SIZE = 50;

export type ColunaDaFila = 'numero' | 'titulo' | 'status' | 'prioridade' | 'responsavel' | 'prazo';
const PESO_DA_PRIORIDADE: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
type Linha = TicketWithDetails & { category?: { name?: string | null } | null };
const VALOR_DA_COLUNA: Record<ColunaDaFila, (t: Linha) => string | number | null | undefined> = {
  numero: (t) => t.ticket_number,
  titulo: (t) => t.title,
  status: (t) => getTicketStatusLabel(t.status),
  prioridade: (t) => PESO_DA_PRIORIDADE[t.priority] ?? 0,
  responsavel: (t) => t.assignee?.full_name,
  prazo: (t) => (t.sla_due_at ? new Date(t.sla_due_at).getTime() : null),
};

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
  createLabel = 'Abrir chamado',
}: WorkOSTableProps) {
  const isMobile = useIsBelow(768);
  const [page, setPage] = useState(1);
  // Busca, ordem pela coluna e exportar (regra 4, etapa 3, 2026-10-24). Sem ordem escolhida, vale a da tela (urgência).
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem<ColunaDaFila> | null>(null);
  const visiveis = useMemo(() => {
    const achados = (tickets as Linha[]).filter((t) => casaBusca(
      [t.ticket_number, t.title, t.requester?.full_name, t.assignee?.full_name, t.category?.name], busca));
    return ordem ? ordenarPor(achados, VALOR_DA_COLUNA[ordem.coluna], ordem.direcao) : achados;
  }, [tickets, busca, ordem]);

  const totalPages = Math.max(1, Math.ceil(visiveis.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [visiveis.length, ordem]);

  // Paginação: no máximo 50 chamados renderizados por vez
  const pageTickets = useMemo(
    () => visiveis.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visiveis, page],
  );

  const exportar = () => exportarPlanilha('chamados', (visiveis as Linha[]).map((t) => ({
    'Nº': t.ticket_number,
    'Título': t.title,
    'Solicitante': t.requester?.full_name ?? '',
    'Categoria': t.category?.name ?? '',
    'Status': getTicketStatusLabel(t.status),
    'Prioridade': PRIORITY_LABELS[t.priority] ?? t.priority,
    'Responsável': t.assignee?.full_name ?? '',
    'Prazo': t.sla_due_at ? dataHora(t.sla_due_at) : '',
    'Aberto em': dataHora(t.created_at),
  })));

  const gridCols = simplified
    ? 'grid-cols-[60px_1fr_100px_100px_110px]'
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
                Array.from({ length: simplified ? 5 : 6 }).map((__, c) => (
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
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº, título ou pessoa"
            aria-label="Buscar na lista" className="h-8 pl-8 text-[13px]" />
        </div>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {visiveis.length === tickets.length ? `${tickets.length} registros` : `${visiveis.length} de ${tickets.length}`}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[12px] ml-auto" onClick={() => void exportar()}
          disabled={visiveis.length === 0}>
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Exportar
        </Button>
      </div>

      {!isMobile && (
        <WorkOSTableHeader gridCols={gridCols} simplified={simplified} ordem={ordem}
          onOrdenar={(c) => setOrdem((o) => proximaOrdem(o, c))} />
      )}

      <ScrollArea className="flex-1">
        {pageTickets.length === 0 && (
          <p className="px-4 py-6 text-[14px] text-muted-foreground">Nenhum chamado com "{busca}".</p>
        )}
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
