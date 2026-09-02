import { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, Plus, Upload, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { KPICard } from '@/components/glpi/KPICard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQueryState } from '@/hooks/useQueryState';
import { useDeleteFinEntry, useFinEntries, useUpdateFinEntry } from '@/hooks/useFinanceiro';
import { FinEntriesTable } from './FinEntriesTable';
import { FinEntryDialog } from './FinEntryDialog';
import { FinImportDialog } from './FinImportDialog';
import {
  FIN_STATUS_LABEL, KIND_LABEL, competenceLabel, effectiveStatus, formatBRL,
  type FinEntry, type FinKind, type FinStatus,
} from '@/types/financeiro';

interface Props {
  kind: FinKind;
  description: string;
}

export function FinEntriesPage({ kind, description }: Props) {
  const { data: entries = [], isLoading } = useFinEntries(kind);
  const update = useUpdateFinEntry();
  const remove = useDeleteFinEntry();

  const [search, setSearch] = useQueryState<string>('q', '');
  const [status, setStatus] = useQueryState<FinStatus | 'all'>('situacao', 'all');
  const [competence, setCompetence] = useQueryState('competencia', 'all');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<FinEntry | null>(null);
  const [deleting, setDeleting] = useState<FinEntry | null>(null);

  const competences = useMemo(
    () => [...new Set(entries.map(e => e.competence))].sort().reverse(),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (status !== 'all' && effectiveStatus(e) !== status) return false;
      if (competence !== 'all' && e.competence !== competence) return false;
      if (!q) return true;
      return [e.description, e.counterparty, e.category, e.document_number, e.cost_center]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [entries, search, status, competence]);

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let open = 0, settled = 0, late = 0, soon = 0;
    for (const e of filtered) {
      const s = effectiveStatus(e);
      const amount = Number(e.amount) || 0;
      if (s === 'paid') settled += amount;
      if (s === 'pending' || s === 'overdue') open += amount;
      if (s === 'overdue') late += amount;
      if (s === 'pending' && e.due_date >= today && e.due_date <= in7) soon += amount;
    }
    return { open, settled, late, soon };
  }, [filtered]);

  const settle = (entry: FinEntry) =>
    update.mutate({ id: entry.id, status: 'paid', settled_at: new Date().toISOString().slice(0, 10) });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={KIND_LABEL[kind]}
        description={description}
        icon={kind === 'payable' ? Banknote : Wallet}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              Importar planilha
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              Novo lançamento
            </Button>
          </>
        }
      />

      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard value={formatBRL(kpis.open)} label={kind === 'payable' ? 'Em aberto a pagar' : 'Em aberto a receber'} icon={CalendarClock} color="blue" />
          <KPICard value={formatBRL(kpis.settled)} label={kind === 'payable' ? 'Já pago' : 'Já recebido'} icon={CheckCircle2} color="green" />
          <KPICard value={formatBRL(kpis.late)} label="Vencido em aberto" icon={AlertTriangle} color="red" />
          <KPICard value={formatBRL(kpis.soon)} label="Vence em até 7 dias" icon={CalendarClock} color="orange" />
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por descrição, parte, documento..."
              className="h-9 max-w-xs"
              aria-label="Buscar lançamentos"
            />
            <Select value={status} onValueChange={v => setStatus(v as FinStatus | 'all')}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {(Object.keys(FIN_STATUS_LABEL) as FinStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{FIN_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={competence} onValueChange={setCompetence}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Filtrar por competência"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as competências</SelectItem>
                {competences.map(c => <SelectItem key={c} value={c}>{competenceLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} lançamentos</span>
          </div>

          <FinEntriesTable
            entries={filtered}
            kind={kind}
            isLoading={isLoading}
            onEdit={(e) => { setEditing(e); setFormOpen(true); }}
            onDelete={setDeleting}
            onSettle={settle}
            onCreate={() => { setEditing(null); setFormOpen(true); }}
          />
        </Card>
      </div>

      <FinEntryDialog open={formOpen} onOpenChange={setFormOpen} kind={kind} entry={editing} />
      <FinImportDialog open={importOpen} onOpenChange={setImportOpen} kind={kind} existing={entries} />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o lançamento "{deleting?.description}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento sai do fluxo de caixa e dos indicadores. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter lançamento</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleting) remove.mutate(deleting.id); setDeleting(null); }}
            >
              Excluir lançamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
