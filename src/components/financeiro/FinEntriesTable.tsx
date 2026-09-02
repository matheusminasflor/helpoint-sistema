import { useMemo, useState } from 'react';
import { Pencil, Trash2, CheckCircle2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import {
  FIN_STATUS_BADGE, FIN_STATUS_LABEL, KIND_PARTY_LABEL,
  competenceLabel, effectiveStatus, formatBRL, formatDateBR,
  type FinEntry, type FinKind,
} from '@/types/financeiro';

const PAGE_SIZE = 25;

interface Props {
  entries: FinEntry[];
  kind: FinKind;
  isLoading?: boolean;
  onEdit: (entry: FinEntry) => void;
  onDelete: (entry: FinEntry) => void;
  onSettle: (entry: FinEntry) => void;
  onCreate?: () => void;
}

export function FinEntriesTable({ entries, kind, isLoading, onEdit, onDelete, onSettle, onCreate }: Props) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = useMemo(
    () => entries.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [entries, current],
  );

  if (isLoading) {
    return (
      <div className="space-y-1 p-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhum lançamento no filtro atual"
        description="Importe uma planilha ou registre um lançamento manualmente para começar a acompanhar."
        actionLabel={onCreate ? 'Novo lançamento' : undefined}
        onAction={onCreate}
      />
    );
  }

  return (
    <div>
      {/* Tabela (telas médias para cima) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-2 font-semibold border-r border-border">Descrição</th>
              <th className="px-3 py-2 font-semibold border-r border-border">{KIND_PARTY_LABEL[kind]}</th>
              <th className="px-3 py-2 font-semibold border-r border-border">Categoria</th>
              <th className="px-3 py-2 font-semibold border-r border-border">Competência</th>
              <th className="px-3 py-2 font-semibold border-r border-border">Vencimento</th>
              <th className="px-3 py-2 font-semibold border-r border-border text-right">Valor</th>
              <th className="px-3 py-2 font-semibold border-r border-border">Situação</th>
              <th className="px-3 py-2 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const status = effectiveStatus(entry);
              return (
                <tr key={entry.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2 text-foreground max-w-[280px] truncate" title={entry.description}>
                    {entry.description}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{entry.counterparty || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.category || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{competenceLabel(entry.competence)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateBR(entry.due_date)}</td>
                  <td className="px-3 py-2 font-mono text-right tabular-nums">{formatBRL(Number(entry.amount))}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex px-2 py-0.5 rounded text-[11px] font-semibold', FIN_STATUS_BADGE[status])}>
                      {FIN_STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {status !== 'paid' && status !== 'cancelled' && (
                        <Button variant="ghost" size="icon" title="Marcar como liquidado" onClick={() => onSettle(entry)}>
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Marcar como liquidado</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => onEdit(entry)}>
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => onDelete(entry)}>
                        <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                        <span className="sr-only">Excluir</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cartões (mobile) */}
      <div className="md:hidden divide-y divide-border">
        {visible.map((entry) => {
          const status = effectiveStatus(entry);
          return (
            <div key={entry.id} className="p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[13px] text-foreground">{entry.description}</span>
                <span className={cn('shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold', FIN_STATUS_BADGE[status])}>
                  {FIN_STATUS_LABEL[status]}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{entry.counterparty || '—'} · {entry.category || 'Sem categoria'}</div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">Vence {formatDateBR(entry.due_date)}</span>
                <span className="font-mono font-semibold">{formatBRL(Number(entry.amount))}</span>
              </div>
              <div className="flex gap-2 pt-1">
                {status !== 'paid' && status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={() => onSettle(entry)}>Liquidar</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(entry)}>Excluir</Button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
          <span>
            {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, entries.length)} de {entries.length}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
