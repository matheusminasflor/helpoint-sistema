import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryState } from '@/hooks/useQueryState';
import { useFinEntries } from '@/hooks/useFinanceiro';
import { competenceLabel, effectiveStatus, formatBRL, type FinEntry } from '@/types/financeiro';

type View = 'projetado' | 'realizado';

/** Agrupa por mês do vencimento (projetado) ou da liquidação (realizado). */
function monthKey(entry: FinEntry, view: View): string | null {
  if (view === 'projetado') return entry.competence?.slice(0, 7) ?? null;
  return entry.settled_at ? entry.settled_at.slice(0, 7) : null;
}

export default function FinCashFlow() {
  const { data: entries = [], isLoading } = useFinEntries();
  const [view, setView] = useQueryState<View>('visao', 'projetado');
  const [months, setMonths] = useQueryState('meses', '12');

  const rows = useMemo(() => {
    const limit = Number(months) || 12;
    const buckets = new Map<string, { inflow: number; outflow: number }>();

    for (const e of entries) {
      const status = effectiveStatus(e);
      if (status === 'cancelled') continue;
      if (view === 'realizado' && status !== 'paid') continue;
      const key = monthKey(e, view);
      if (!key) continue;
      const bucket = buckets.get(key) || { inflow: 0, outflow: 0 };
      const amount = Number(e.amount) || 0;
      if (e.kind === 'receivable') bucket.inflow += amount; else bucket.outflow += amount;
      buckets.set(key, bucket);
    }

    const ordered = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-limit);
    let running = 0;
    return ordered.map(([key, v]) => {
      const net = v.inflow - v.outflow;
      running += net;
      return {
        key,
        label: competenceLabel(`${key}-01`),
        entradas: Number(v.inflow.toFixed(2)),
        saidas: Number(v.outflow.toFixed(2)),
        saldo: Number(net.toFixed(2)),
        acumulado: Number(running.toFixed(2)),
      };
    });
  }, [entries, view, months]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ inflow: acc.inflow + r.entradas, outflow: acc.outflow + r.saidas }),
    { inflow: 0, outflow: 0 },
  ), [rows]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Fluxo de caixa"
        description="Entradas e saídas mês a mês, com saldo do período e saldo acumulado."
        icon={TrendingUp}
        actions={
          <>
            <Select value={view} onValueChange={v => setView(v as View)}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Visão do fluxo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="projetado">Projetado (vencimentos)</SelectItem>
                <SelectItem value="realizado">Realizado (liquidados)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Meses exibidos"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">Últimos 6 meses</SelectItem>
                <SelectItem value="12">Últimos 12 meses</SelectItem>
                <SelectItem value="24">Últimos 24 meses</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="p-4 lg:p-6 space-y-4">
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : rows.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={TrendingUp}
              title="Sem movimentação para exibir"
              description="Importe uma planilha de contas a pagar ou a receber para montar o fluxo de caixa."
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Entradas no período</p>
                <p className="text-xl font-bold font-mono text-foreground">{formatBRL(totals.inflow)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Saídas no período</p>
                <p className="text-xl font-bold font-mono text-foreground">{formatBRL(totals.outflow)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Saldo acumulado</p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {formatBRL(rows[rows.length - 1]?.acumulado ?? 0)}
                </p>
              </Card>
            </div>

            <Card className="p-4">
              <h2 className="text-[13px] font-semibold text-foreground mb-3">Entradas x saídas por mês</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                    <Bar dataKey="entradas" name="Entradas" fill="#00c875" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="#e2445c" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="acumulado" name="Saldo acumulado" stroke="#0073ea" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-semibold border-r border-border">Mês</th>
                      <th className="px-3 py-2 font-semibold border-r border-border text-right">Entradas</th>
                      <th className="px-3 py-2 font-semibold border-r border-border text-right">Saídas</th>
                      <th className="px-3 py-2 font-semibold border-r border-border text-right">Saldo do mês</th>
                      <th className="px-3 py-2 font-semibold text-right">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} className="border-b border-border hover:bg-secondary/50">
                        <td className="px-3 py-2 font-mono text-xs">{r.label}</td>
                        <td className="px-3 py-2 font-mono text-right tabular-nums">{formatBRL(r.entradas)}</td>
                        <td className="px-3 py-2 font-mono text-right tabular-nums">{formatBRL(r.saidas)}</td>
                        <td className="px-3 py-2 font-mono text-right tabular-nums">{formatBRL(r.saldo)}</td>
                        <td className="px-3 py-2 font-mono text-right tabular-nums font-semibold">{formatBRL(r.acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
