import { useMemo } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, Clock, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryState } from '@/hooks/useQueryState';
import { useFinEntries } from '@/hooks/useFinanceiro';
import { cn } from '@/lib/utils';
import { effectiveStatus, formatBRL, formatDateBR, type FinEntry } from '@/types/financeiro';

/** Mesma regra usada nos demais indicadores do sistema. */
function calcChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const DAY = 86400000;
const PERIODS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 180 dias' },
  { value: '365', label: 'Últimos 12 meses' },
];

/** Limite de desvio para sinalizar categoria fora do padrão: 30% acima da média anterior. */
const DEVIATION_THRESHOLD = 0.3;

function within(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d >= start && d <= end;
}

function avgDays(entries: FinEntry[]): number {
  const values = entries
    .filter(e => e.settled_at)
    .map(e => (new Date(e.settled_at!).getTime() - new Date(e.due_date).getTime()) / DAY);
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function Delta({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null) return <span className="text-xs text-muted-foreground">sem base anterior</span>;
  const good = inverse ? change <= 0 : change >= 0;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', good ? 'text-[hsl(var(--badge-success-text))]' : 'text-[hsl(var(--badge-danger-text))]')}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {Math.abs(change)}% vs. período anterior
    </span>
  );
}

export default function FinIndicators() {
  const { data: entries = [], isLoading } = useFinEntries();
  const [days, setDays] = useQueryState('periodo', '90');

  const data = useMemo(() => {
    const span = Number(days) || 90;
    const end = new Date();
    const start = new Date(end.getTime() - span * DAY);
    const prevEnd = new Date(start.getTime() - DAY);
    const prevStart = new Date(prevEnd.getTime() - span * DAY);

    const inPeriod = entries.filter(e => within(e.due_date, start, end));
    const inPrev = entries.filter(e => within(e.due_date, prevStart, prevEnd));

    const sum = (list: FinEntry[], predicate: (e: FinEntry) => boolean) =>
      list.filter(predicate).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const payable = (e: FinEntry) => e.kind === 'payable' && effectiveStatus(e) !== 'cancelled';
    const receivable = (e: FinEntry) => e.kind === 'receivable' && effectiveStatus(e) !== 'cancelled';

    const totalPayable = sum(inPeriod, payable);
    const totalReceivable = sum(inPeriod, receivable);
    const prevPayable = sum(inPrev, payable);
    const prevReceivable = sum(inPrev, receivable);

    const paid = sum(entries, e => e.kind === 'payable' && e.status === 'paid' && within(e.settled_at, start, end));
    const received = sum(entries, e => e.kind === 'receivable' && e.status === 'paid' && within(e.settled_at, start, end));
    const balance = received - paid;
    const prevBalance =
      sum(entries, e => e.kind === 'receivable' && e.status === 'paid' && within(e.settled_at, prevStart, prevEnd)) -
      sum(entries, e => e.kind === 'payable' && e.status === 'paid' && within(e.settled_at, prevStart, prevEnd));

    const overdueReceivable = sum(entries, e => e.kind === 'receivable' && effectiveStatus(e) === 'overdue');
    const openReceivable = sum(entries, e => e.kind === 'receivable' && ['overdue', 'pending'].includes(effectiveStatus(e)));
    const defaultRate = openReceivable > 0 ? Math.round((overdueReceivable / openReceivable) * 100) : 0;

    const avgPay = avgDays(inPeriod.filter(e => e.kind === 'payable'));
    const avgReceive = avgDays(inPeriod.filter(e => e.kind === 'receivable'));

    // Direcionais de atenção
    const todayISO = end.toISOString().slice(0, 10);
    const in7ISO = new Date(end.getTime() + 7 * DAY).toISOString().slice(0, 10);
    const dueSoon = entries
      .filter(e => effectiveStatus(e) === 'pending' && e.due_date >= todayISO && e.due_date <= in7ISO)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const overdue = entries
      .filter(e => effectiveStatus(e) === 'overdue')
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    // Categoria de despesa 30%+ acima da média do período anterior
    const byCategory = (list: FinEntry[]) => {
      const map = new Map<string, number>();
      for (const e of list) {
        if (e.kind !== 'payable' || effectiveStatus(e) === 'cancelled') continue;
        const key = e.category?.trim() || 'Sem categoria';
        map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
      }
      return map;
    };
    const currentByCat = byCategory(inPeriod);
    const prevByCat = byCategory(inPrev);
    const spikes = [...currentByCat.entries()]
      .map(([category, current]) => {
        const previous = prevByCat.get(category) || 0;
        const change = previous > 0 ? (current - previous) / previous : null;
        return { category, current, previous, change };
      })
      .filter(c => c.change !== null && c.change >= DEVIATION_THRESHOLD)
      .sort((a, b) => (b.change! - a.change!));

    return {
      balance, prevBalance, totalPayable, totalReceivable, prevPayable, prevReceivable,
      defaultRate, overdueReceivable, avgPay, avgReceive, dueSoon, overdue, spikes,
    };
  }, [entries, days]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Indicadores financeiros"
        description="Saldo, volume a pagar e a receber, inadimplência e prazos médios, comparados ao período anterior."
        icon={BarChart3}
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[190px]" aria-label="Período"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="p-4 lg:p-6 space-y-4">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={BarChart3}
              title="Ainda não há dados financeiros"
              description="Importe contas a pagar e a receber para gerar os indicadores do período."
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="w-3.5 h-3.5" aria-hidden="true" /> Saldo realizado no período</div>
                <p className="text-xl font-bold font-mono text-foreground">{formatBRL(data.balance)}</p>
                <Delta change={calcChange(data.balance, data.prevBalance)} />
              </Card>
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Total a pagar no período</div>
                <p className="text-xl font-bold font-mono text-foreground">{formatBRL(data.totalPayable)}</p>
                <Delta change={calcChange(data.totalPayable, data.prevPayable)} inverse />
              </Card>
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Total a receber no período</div>
                <p className="text-xl font-bold font-mono text-foreground">{formatBRL(data.totalReceivable)}</p>
                <Delta change={calcChange(data.totalReceivable, data.prevReceivable)} />
              </Card>
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Inadimplência</div>
                <p className="text-xl font-bold font-mono text-foreground">{data.defaultRate}%</p>
                <p className="text-xs text-muted-foreground">{formatBRL(data.overdueReceivable)} vencidos e não recebidos</p>
              </Card>
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> Prazo médio de pagamento</div>
                <p className="text-xl font-bold font-mono text-foreground">{data.avgPay} dias</p>
                <p className="text-xs text-muted-foreground">em relação ao vencimento (negativo = antecipado)</p>
              </Card>
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> Prazo médio de recebimento</div>
                <p className="text-xl font-bold font-mono text-foreground">{data.avgReceive} dias</p>
                <p className="text-xs text-muted-foreground">em relação ao vencimento (negativo = antecipado)</p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <h2 className="text-[13px] font-semibold text-foreground mb-2">Vence nos próximos 7 dias</h2>
                {data.dueSoon.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nada vencendo nesta semana.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.dueSoon.slice(0, 8).map(e => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate">{e.description}</span>
                        <span className="font-mono text-xs shrink-0">{formatDateBR(e.due_date)} · {formatBRL(Number(e.amount))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="text-[13px] font-semibold text-foreground mb-2">Já vencidos em aberto</h2>
                {data.overdue.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nenhuma conta em atraso.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.overdue.slice(0, 8).map(e => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate">{e.description}</span>
                        <span className="font-mono text-xs shrink-0 text-[hsl(var(--badge-danger-text))]">{formatDateBR(e.due_date)} · {formatBRL(Number(e.amount))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="text-[13px] font-semibold text-foreground mb-1">Gastos fora do padrão</h2>
                <p className="text-xs text-muted-foreground mb-2">
                  Categorias com despesa 30% ou mais acima do mesmo intervalo anterior.
                </p>
                {data.spikes.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nenhuma categoria acima do limite.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.spikes.slice(0, 8).map(s => (
                      <li key={s.category} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate">{s.category}</span>
                        <span className="font-mono text-xs shrink-0 text-[hsl(var(--badge-danger-text))]">
                          +{Math.round((s.change || 0) * 100)}% · {formatBRL(s.current)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
