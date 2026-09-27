import { useMemo } from 'react';
import { ListaCortada } from '@/components/ui/ListaCortada';
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
  const { data: entries = [], isLoading, cortou } = useFinEntries();
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

    // A RÉGUA DE MESES, e não as chaves que existem (correção de 2026-09-27).
    //
    // Antes daqui era `[...buckets.keys()].sort().slice(-limit)`: os N últimos
    // meses QUE TINHAM LANÇAMENTO. Com parcela lançada até 2027-08, "últimos 6
    // meses" mostrava 2027-03 a 2027-08 e **o mês corrente desaparecia da tela**.
    // Mês sem movimento também sumia, e a linha de acumulado pulava o buraco
    // ligando dois meses não vizinhos como se fossem seguidos.
    //
    // Agora a janela é ancorada no mês de hoje e tem sempre `limit` meses:
    //   - `realizado` (liquidados) olha para TRÁS — é o que já aconteceu;
    //   - `projetado` (vencimentos) olha para FRENTE a partir deste mês — é o
    //     compromisso que ainda vai vencer, que é a razão da visão existir.
    // Mês sem movimento aparece com zero, que aqui é medida e não ausência: não
    // houve entrada nem saída naquele mês.
    const hoje = new Date();
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const regua: string[] = [];
    for (let i = 0; i < limit; i++) {
      const passo = view === 'realizado' ? -(limit - 1 - i) : i;
      const m = new Date(base.getFullYear(), base.getMonth() + passo, 1);
      regua.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }

    let running = 0;
    return regua.map((key) => {
      const v = buckets.get(key) ?? { inflow: 0, outflow: 0 };
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

  /** Quanto ficou fora da janela — para a tela não fingir que mostra tudo. */
  const foraDaJanela = useMemo(() => {
    const dentro = new Set(rows.map(r => r.key));
    let quantos = 0;
    for (const e of entries) {
      const status = effectiveStatus(e);
      if (status === 'cancelled') continue;
      if (view === 'realizado' && status !== 'paid') continue;
      const key = monthKey(e, view);
      if (key && !dentro.has(key)) quantos++;
    }
    return quantos;
  }, [entries, rows, view]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ inflow: acc.inflow + r.entradas, outflow: acc.outflow + r.saidas }),
    { inflow: 0, outflow: 0 },
  ), [rows]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Fluxo de caixa"
        description="Entradas e saídas mês a mês. O projetado olha os vencimentos à frente; o realizado, o que já foi liquidado."
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
            {/* O rótulo segue a visão: "últimos" no realizado, "próximos" no
                projetado. Dizia "Últimos" nas duas, e no projetado isso era
                falso — a janela é de vencimento, que está à frente. */}
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Meses exibidos"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['6', '12', '24'].map(n => (
                  <SelectItem key={n} value={n}>
                    {view === 'realizado' ? `Últimos ${n} meses` : `Próximos ${n} meses`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {cortou && <ListaCortada />}

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
                {/* Diz que é da janela. O acumulado começa em zero no primeiro
                    mês exibido, então NÃO é o caixa da empresa — e nada na tela
                    dizia isso: trocar 12 por 6 meses mudava o número. */}
                <p className="text-xs text-muted-foreground">Saldo acumulado dos meses exibidos</p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {formatBRL(rows[rows.length - 1]?.acumulado ?? 0)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  soma dos {rows.length} meses desta janela, não o saldo em conta
                  {foraDaJanela > 0 && ` · ${foraDaJanela} lançamento${foraDaJanela > 1 ? 's' : ''} fora dela`}
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
