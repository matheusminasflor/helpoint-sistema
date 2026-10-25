import { useMemo, useState } from 'react';
import { Pencil, Trash2, CheckCircle2, Receipt, Paperclip, Undo2, Download } from 'lucide-react';
import { TituloOrdenavel } from '@/components/ui/TituloOrdenavel';
import { exportarPlanilha, ordenarPor, proximaOrdem, type Ordem } from '@/lib/tabela';
import { getPurchaseFileUrl } from '@/hooks/usePurchases';
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

type Coluna = 'descricao' | 'parte' | 'categoria' | 'competencia' | 'vencimento' | 'valor' | 'situacao';
const VALOR: Record<Coluna, (e: FinEntry) => string | number | null | undefined> = {
  descricao: (e) => e.description,
  parte: (e) => e.counterparty,
  categoria: (e) => e.category,
  competencia: (e) => e.competence,
  vencimento: (e) => e.due_date,
  valor: (e) => Number(e.amount),
  situacao: (e) => FIN_STATUS_LABEL[effectiveStatus(e)],
};

const abrirAnexo = async (path: string) => {
  const url = await getPurchaseFileUrl(path);
  if (url) window.open(url, '_blank', 'noopener');
};

interface Props {
  entries: FinEntry[];
  kind: FinKind;
  isLoading?: boolean;
  // Sem a ação, sem o botão: a página só passa o que o perfil do Financeiro permite.
  onEdit?: (entry: FinEntry) => void;
  onDelete?: (entry: FinEntry) => void;
  onSettle?: (entry: FinEntry) => void;
  /** Liquidou por engano (dono, 2026-10-16): volta a conta paga para "em aberto". */
  onReopen?: (entry: FinEntry) => void;
  onCreate?: () => void;
  /** Marcar várias (etapa 4 · Financeiro, 2026-10-24): só as em aberto; sem a prop, sem caixa de marcar. */
  selecionadas?: Set<string>;
  onSelecionar?: (ids: string[], marcar: boolean) => void;
}

export function FinEntriesTable({ entries, kind, isLoading, onEdit, onDelete, onSettle, onReopen, onCreate, selecionadas, onSelecionar }: Props) {
  const abertaPara = (e: FinEntry) => effectiveStatus(e) !== 'paid' && effectiveStatus(e) !== 'cancelled';
  const [page, setPage] = useState(1);
  // Ordem pela coluna e exportar (regra 4, etapa 3, 2026-10-24); sem ordem escolhida, a da tela.
  const [ordem, setOrdem] = useState<Ordem<Coluna> | null>(null);
  const ordenadas = useMemo(() => (ordem ? ordenarPor(entries, VALOR[ordem.coluna], ordem.direcao) : entries), [entries, ordem]);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = useMemo(
    () => ordenadas.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [ordenadas, current],
  );
  const ordenar = (c: Coluna) => setOrdem((o) => proximaOrdem(o, c));
  const exportar = () => exportarPlanilha(kind === 'payable' ? 'contas-a-pagar' : 'contas-a-receber', ordenadas.map((e) => ({
    'Descrição': e.description,
    [KIND_PARTY_LABEL[kind]]: e.counterparty ?? '',
    'Categoria': e.category ?? '',
    'Competência': competenceLabel(e.competence),
    'Vencimento': formatDateBR(e.due_date),
    'Valor': Number(e.amount),
    'Situação': FIN_STATUS_LABEL[effectiveStatus(e)],
    'Pago em': e.settled_at ? formatDateBR(e.settled_at) : '',
  })));

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
      <div className="flex justify-end px-3 py-2 border-b border-border">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[12px]" onClick={() => void exportar()}>
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Exportar
        </Button>
      </div>
      {/* Tabela (telas médias para cima) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
              {onSelecionar && (
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" aria-label="Marcar todas as em aberto desta página" className="h-4 w-4"
                    checked={visible.filter(abertaPara).length > 0 && visible.filter(abertaPara).every((e) => selecionadas?.has(e.id))}
                    onChange={(ev) => onSelecionar(visible.filter(abertaPara).map((e) => e.id), ev.target.checked)} />
                </th>
              )}
              <TituloOrdenavel coluna="descricao" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">Descrição</TituloOrdenavel>
              <TituloOrdenavel coluna="parte" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">{KIND_PARTY_LABEL[kind]}</TituloOrdenavel>
              <TituloOrdenavel coluna="categoria" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">Categoria</TituloOrdenavel>
              <TituloOrdenavel coluna="competencia" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">Competência</TituloOrdenavel>
              <TituloOrdenavel coluna="vencimento" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">Vencimento</TituloOrdenavel>
              <TituloOrdenavel coluna="valor" ordem={ordem} onOrdenar={ordenar} direita className="px-3 py-2 border-r border-border text-right">Valor</TituloOrdenavel>
              <TituloOrdenavel coluna="situacao" ordem={ordem} onOrdenar={ordenar} className="px-3 py-2 border-r border-border">Situação</TituloOrdenavel>
              <th className="px-3 py-2 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const status = effectiveStatus(entry);
              return (
                <tr key={entry.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                  {onSelecionar && (
                    <td className="px-3 py-2">
                      {abertaPara(entry) && (
                        <input type="checkbox" aria-label={`Marcar ${entry.description}`} className="h-4 w-4"
                          checked={!!selecionadas?.has(entry.id)} onChange={(ev) => onSelecionar([entry.id], ev.target.checked)} />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-foreground max-w-[280px] truncate" title={entry.description}>
                    {entry.description}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{entry.counterparty || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.category || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{competenceLabel(entry.competence)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateBR(entry.due_date)}</td>
                  <td className="px-3 py-2 font-mono text-right tabular-nums">{formatBRL(Number(entry.amount))}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex px-2 py-0.5 rounded text-[12px] font-semibold', FIN_STATUS_BADGE[status])}>
                      {FIN_STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {entry.anexo_path && (
                        <Button variant="ghost" size="icon" title="Abrir o boleto" onClick={() => abrirAnexo(entry.anexo_path!)}>
                          <Paperclip className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Abrir o boleto</span>
                        </Button>
                      )}
                      {onSettle && status !== 'paid' && status !== 'cancelled' && (
                        <Button variant="ghost" size="icon" title="Marcar como liquidado" onClick={() => onSettle(entry)}>
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Marcar como liquidado</span>
                        </Button>
                      )}
                      {onReopen && status === 'paid' && (
                        <Button variant="ghost" size="icon" title="Reabrir (liquidou por engano)" onClick={() => onReopen(entry)}>
                          <Undo2 className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Reabrir</span>
                        </Button>
                      )}
                      {onEdit && (
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => onEdit(entry)}>
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Editar</span>
                        </Button>
                      )}
                      {onDelete && !entry.purchase_request_id && (
                        <Button variant="ghost" size="icon" title="Excluir" onClick={() => onDelete(entry)}>
                          <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                          <span className="sr-only">Excluir</span>
                        </Button>
                      )}
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
                <span className="font-medium text-[14px] text-foreground">{entry.description}</span>
                <span className={cn('shrink-0 px-2 py-0.5 rounded text-[12px] font-semibold', FIN_STATUS_BADGE[status])}>
                  {FIN_STATUS_LABEL[status]}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{entry.counterparty || '—'} · {entry.category || 'Sem categoria'}</div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">Vence {formatDateBR(entry.due_date)}</span>
                <span className="font-mono font-semibold">{formatBRL(Number(entry.amount))}</span>
              </div>
              <div className="flex gap-2 pt-1">
                {entry.anexo_path && <Button size="sm" variant="outline" onClick={() => abrirAnexo(entry.anexo_path!)}>Boleto</Button>}
                {onSettle && status !== 'paid' && status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={() => onSettle(entry)}>Liquidar</Button>
                )}
                {onReopen && status === 'paid' && <Button size="sm" variant="outline" onClick={() => onReopen(entry)}>Reabrir</Button>}
                {onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>Editar</Button>}
                {onDelete && !entry.purchase_request_id && <Button size="sm" variant="ghost" onClick={() => onDelete(entry)}>Excluir</Button>}
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
