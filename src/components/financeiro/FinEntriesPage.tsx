import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { feitoComDesfazer } from '@/lib/desfazer';
import { ListaCortada } from '@/components/ui/ListaCortada';
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
import { daysFromTodayISO, todayISO } from '@/lib/dates';
import { useDeleteFinEntry, useFinEntries, useUpdateFinEntry, usePagarSelecionadas } from '@/hooks/useFinanceiro';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { FinEntriesTable } from './FinEntriesTable';
import { FinEntryDialog } from './FinEntryDialog';
import { FinImportDialog } from './FinImportDialog';
import { FaturasDoCartao } from './FaturasDoCartao';
import { FILIAIS_DA_COMPRA } from '@/types/purchases';
import {
  FIN_STATUS_LABEL, KIND_LABEL, competenceLabel, effectiveStatus, formatBRL,
  type FinEntry, type FinKind, type FinStatus,
} from '@/types/financeiro';

interface Props {
  kind: FinKind;
  description: string;
}

export function FinEntriesPage({ kind, description }: Props) {
  const { data: entries = [], isLoading, cortou } = useFinEntries(kind);
  const update = useUpdateFinEntry();
  const remove = useDeleteFinEntry();
  // As caixinhas da seção (Contas a Pagar ou a Receber) — a mesma conta de `pode_no_financeiro`.
  const { can } = useDepartmentPermissions('financeiro');
  const secao = kind === 'payable' ? 'payables' : 'receivables';
  const podeCriar = can(secao, 'create');
  const podeImportar = can(secao, 'import');
  const podeEditar = can(secao, 'edit');
  const podeBaixar = can(secao, 'settle');
  const podeExcluir = can(secao, 'delete');

  const [search, setSearch] = useQueryState<string>('q', '');
  const [status, setStatus] = useQueryState<FinStatus | 'all'>('situacao', 'all');
  const [competence, setCompetence] = useQueryState('competencia', 'all');
  // Filial da compra (INBRAS/MF), campo desde 2026-10-14.
  const [filial, setFilial] = useQueryState('filial', 'all');
  // "Vence entre" (etapa 4 · Financeiro, 2026-10-24); o Fluxo de caixa abre a lista já com o mês clicado.
  const [venceDe, setVenceDe] = useQueryState<string>('de', '');
  const [venceAte, setVenceAte] = useQueryState<string>('ate', '');
  // Pagar várias de uma vez, com a data.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [dataDoLote, setDataDoLote] = useState(todayISO());
  const pagarLote = usePagarSelecionadas();
  const selecionar = (ids: string[], marcar: boolean) => setSelecionadas((s) => {
    const n = new Set(s); ids.forEach((id) => (marcar ? n.add(id) : n.delete(id))); return n;
  });
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
      if (filial !== 'all' && (e.filial ?? 'sem') !== filial) return false;
      if (venceDe && e.due_date < venceDe) return false;
      if (venceAte && e.due_date > venceAte) return false;
      if (!q) return true;
      return [e.description, e.counterparty, e.category, e.document_number, e.cost_center]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [entries, search, status, competence, filial, venceDe, venceAte]);

  const kpis = useMemo(() => {
    const today = todayISO();
    const in7 = daysFromTodayISO(7);
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

  // Liquidar pergunta a data do pagamento (defeito 10, 2026-10-24): gravava sempre hoje, e pagar ontem exigia editar.
  const [liquidando, setLiquidando] = useState<FinEntry | null>(null);
  const [dataDoPagamento, setDataDoPagamento] = useState(todayISO());
  const settle = (entry: FinEntry) => { setDataDoPagamento(todayISO()); setLiquidando(entry); };
  // "Feito · Desfazer" (regra 1, 2026-10-24): a linha já aparece paga; o banco grava em 8 s.
  const qc = useQueryClient();
  const marcaNaTela = (id: string, mudanca: Partial<FinEntry>) =>
    qc.setQueriesData<FinEntry[]>({ queryKey: ['fin-entries'] }, (linhas) =>
      linhas?.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  const confirmarLiquidacao = () => {
    if (!liquidando || !dataDoPagamento) return;
    const e = liquidando;
    const data = dataDoPagamento;
    marcaNaTela(e.id, { status: 'paid', settled_at: data });
    setLiquidando(null);
    feitoComDesfazer({
      chave: `lancamento:${e.id}`,
      mensagem: kind === 'payable' ? 'Conta marcada como paga' : 'Recebimento registrado',
      gravar: () => update.mutateAsync({ id: e.id, status: 'paid', settled_at: data }),
      aoDesfazer: () => marcaNaTela(e.id, { status: e.status, settled_at: e.settled_at }),
      // O aviso de erro e a recarga são da própria gravação (`useUpdateFinEntry`); falhou, a tela volta ao banco.
      depois: (erro) => { if (erro) void qc.invalidateQueries({ queryKey: ['fin-entries'] }); },
    });
  };
  const reopen = (entry: FinEntry) =>
    update.mutate({ id: entry.id, status: 'pending', settled_at: null });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={KIND_LABEL[kind]}
        description={description}
        icon={kind === 'payable' ? Banknote : Wallet}
        actions={
          <>
            {podeImportar && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                Importar planilha
              </Button>
            )}
            {podeCriar && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                Novo lançamento
              </Button>
            )}
          </>
        }
      />

      {cortou && <ListaCortada />}

      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard value={formatBRL(kpis.open)} label={kind === 'payable' ? 'Em aberto a pagar' : 'Em aberto a receber'} icon={CalendarClock} color="blue" />
          <KPICard value={formatBRL(kpis.settled)} label={kind === 'payable' ? 'Já pago' : 'Já recebido'} icon={CheckCircle2} color="green" />
          <KPICard value={formatBRL(kpis.late)} label="Vencido em aberto" icon={AlertTriangle} color="red" />
          <KPICard value={formatBRL(kpis.soon)} label="Vence em até 7 dias" icon={CalendarClock} color="orange" />
        </div>

        {kind === 'payable' && <FaturasDoCartao entries={entries} podeBaixar={podeBaixar} />}

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
            {kind === 'payable' && (
              <Select value={filial} onValueChange={setFilial}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Filtrar por filial"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {FILIAIS_DA_COMPRA.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  <SelectItem value="sem">Sem filial</SelectItem>
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              Vence entre
              <Input type="date" value={venceDe} onChange={(e) => setVenceDe(e.target.value)} className="h-9 w-[150px]" aria-label="Vence a partir de" />
              e
              <Input type="date" value={venceAte} onChange={(e) => setVenceAte(e.target.value)} className="h-9 w-[150px]" aria-label="Vence até" />
            </label>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} lançamentos</span>
          </div>

          {selecionadas.size > 0 && (() => {
            const marcadas = filtered.filter((e) => selecionadas.has(e.id));
            const total = marcadas.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border bg-secondary/60 text-[14px]">
                <span className="font-medium tabular-nums">{marcadas.length} conta{marcadas.length === 1 ? '' : 's'} · {formatBRL(total)}</span>
                <label className="flex items-center gap-1.5 text-[13px]">
                  {kind === 'payable' ? 'Pagas em' : 'Recebidas em'}
                  <Input type="date" value={dataDoLote} max={todayISO()} onChange={(e) => setDataDoLote(e.target.value)} className="h-8 w-[150px]" />
                </label>
                <Button size="sm" disabled={!dataDoLote || pagarLote.isPending || marcadas.length === 0}
                  onClick={() => pagarLote.mutate({ ids: marcadas.map((e) => e.id), data: dataDoLote }, { onSuccess: () => setSelecionadas(new Set()) })}>
                  {kind === 'payable' ? 'Marcar como pagas' : 'Marcar como recebidas'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())}>Limpar</Button>
              </div>
            );
          })()}

          <FinEntriesTable
            entries={filtered}
            kind={kind}
            isLoading={isLoading}
            onEdit={podeEditar ? (e) => { setEditing(e); setFormOpen(true); } : undefined}
            onDelete={podeExcluir ? setDeleting : undefined}
            onSettle={podeBaixar ? settle : undefined}
            onReopen={podeBaixar ? reopen : undefined}
            selecionadas={podeBaixar ? selecionadas : undefined}
            onSelecionar={podeBaixar ? selecionar : undefined}
            onCreate={podeCriar ? () => { setEditing(null); setFormOpen(true); } : undefined}
          />
        </Card>
      </div>

      <FinEntryDialog open={formOpen} onOpenChange={setFormOpen} kind={kind} entry={editing} />
      <FinImportDialog open={importOpen} onOpenChange={setImportOpen} kind={kind} existing={entries} />

      <AlertDialog open={!!liquidando} onOpenChange={(v) => !v && setLiquidando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{kind === 'payable' ? 'Pago em que dia?' : 'Recebido em que dia?'}</AlertDialogTitle>
            <AlertDialogDescription>“{liquidando?.description}” · {liquidando ? formatBRL(Number(liquidando.amount) || 0) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="data-do-pagamento" className="text-sm font-medium">Data {kind === 'payable' ? 'do pagamento' : 'do recebimento'}</label>
            <Input id="data-do-pagamento" name="data-do-pagamento" type="date" value={dataDoPagamento} max={todayISO()}
              onChange={(e) => setDataDoPagamento(e.target.value)} className="h-10 max-w-[200px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={!dataDoPagamento || update.isPending}
              onClick={(e) => { e.preventDefault(); confirmarLiquidacao(); }}>
              {update.isPending ? 'Gravando…' : 'Liquidar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
