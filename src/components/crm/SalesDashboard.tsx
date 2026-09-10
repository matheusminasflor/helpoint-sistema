import { useMemo, useState } from 'react';
import { Trophy, KanbanSquare, Percent, Timer } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { useQueryState } from '@/hooks/useQueryState';
import { useCRMPipelines, useSalesMetrics } from '@/hooks/useCRM';
import { formatBRL, SOURCE_LABELS, SALES_RANGES, rangeDates, type SalesRange } from '@/lib/crm';

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 };

/**
 * Aba "Vendas" dos indicadores do Comercial (E4). Um seletor de faixa e de
 * funil; quatro cartões; valor aberto por etapa; negócios criados por
 * semana; ranking por vendedor e por origem. Os números vêm prontos de
 * `crm_sales_metrics` — aqui só se mostra.
 */
export function SalesDashboard() {
  const [range, setRange] = useQueryState<SalesRange>('faixa', '30d');
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const { data: pipelines = [] } = useCRMPipelines();
  const { from, to } = useMemo(() => rangeDates(range), [range]);
  const { data: m, isLoading } = useSalesMetrics(from, to, pipelineId);

  const closed = (m?.won.count ?? 0) + (m?.lost.count ?? 0);
  const conversion = closed > 0 ? Math.round(((m?.won.count ?? 0) / closed) * 100) : null;
  const openTotal = m?.pipeline.reduce((acc, s) => ({ count: acc.count + s.count, value: acc.value + s.value }), { count: 0, value: 0 }) ?? { count: 0, value: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as SalesRange)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{SALES_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {pipelines.length > 1 && (
          <Select value={pipelineId ?? '__all__'} onValueChange={(v) => setPipelineId(v === '__all__' ? undefined : v)}>
            <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os funis</SelectItem>
              {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading || !m ? (
        <KPIGrid lgCols={4}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>
      ) : (
        <KPIGrid lgCols={4}>
          <KPICard value={formatBRL(openTotal.value)} label={`Aberto no funil · ${openTotal.count} negócio(s)`} icon={KanbanSquare} color="blue" />
          <KPICard value={formatBRL(m.won.value)} label={`Ganho no período · ${m.won.count} negócio(s)`} icon={Trophy} color="green" />
          <KPICard value={conversion === null ? '—' : `${conversion}%`} label={`Conversão · ${m.won.count} ganhos, ${m.lost.count} perdidos`} icon={Percent} color="purple" />
          <KPICard value={m.cycle_days === null ? '—' : `${m.cycle_days} d`} label="Ciclo médio até ganhar" icon={Timer} color="orange" />
        </KPIGrid>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1">Valor aberto por etapa</h3>
          <p className="text-xs text-muted-foreground mb-3">Foto de agora, só negócios em andamento</p>
          <ResponsiveContainer width="100%" height={Math.max(160, 36 * (m?.pipeline.length ?? 4))}>
            <BarChart data={m?.pipeline ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, item) => [`${formatBRL(v)} · ${item.payload.count} negócio(s)`, 'Aberto']} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1">Negócios criados por semana</h3>
          <p className="text-xs text-muted-foreground mb-3">{m?.created ?? 0} no período</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={m?.created_by_week ?? []}>
              <defs>
                <linearGradient id="crmCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(w: string) => w.slice(8, 10) + '/' + w.slice(5, 7)} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(w) => `Semana de ${String(w).slice(8, 10)}/${String(w).slice(5, 7)}`} />
              <Area type="monotone" dataKey="count" name="Criados" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#crmCreated)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="text-base font-semibold">Por vendedor</h3>
            <p className="text-xs text-muted-foreground">Ganho no período e carteira aberta agora</p>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y bg-secondary/60 text-left text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Vendedor</th>
                <th className="px-4 py-2 font-semibold text-right">Ganhos</th>
                <th className="px-4 py-2 font-semibold text-right">Valor ganho</th>
                <th className="px-4 py-2 font-semibold text-right">Abertos</th>
                <th className="px-4 py-2 font-semibold text-right">Valor aberto</th>
              </tr>
            </thead>
            <tbody>
              {(m?.by_owner ?? []).map((o) => (
                <tr key={o.owner_id ?? 'none'} className="border-b">
                  <td className="px-4 py-2 font-medium">{o.name}</td>
                  <td className="px-4 py-2 text-right">{o.won_count}</td>
                  <td className="px-4 py-2 text-right">{formatBRL(o.won_value)}</td>
                  <td className="px-4 py-2 text-right">{o.open_count}</td>
                  <td className="px-4 py-2 text-right">{formatBRL(o.open_value)}</td>
                </tr>
              ))}
              {m && m.by_owner.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Nenhum negócio no período.</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="text-base font-semibold">Por origem</h3>
            <p className="text-xs text-muted-foreground">De onde vieram os negócios criados no período</p>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y bg-secondary/60 text-left text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Origem</th>
                <th className="px-4 py-2 font-semibold text-right">Negócios</th>
                <th className="px-4 py-2 font-semibold text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {(m?.by_source ?? []).map((s) => (
                <tr key={s.source} className="border-b">
                  <td className="px-4 py-2 font-medium">{SOURCE_LABELS[s.source] ?? s.source}</td>
                  <td className="px-4 py-2 text-right">{s.count}</td>
                  <td className="px-4 py-2 text-right">{m && m.created > 0 ? Math.round((s.count / m.created) * 100) : 0}%</td>
                </tr>
              ))}
              {m && m.by_source.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Nenhum negócio criado no período.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
