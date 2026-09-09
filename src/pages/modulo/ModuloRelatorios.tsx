import { useMemo, useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import type { Period } from '@/lib/period';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { useTicketMetrics, useTicketTrends, MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import {
  Ticket, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tokens semânticos (helpoint/cor-fixa): --priority-* já existe em index.css
// para esta mesma finalidade em outras telas (TicketDetail, FocusMode).
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'hsl(var(--priority-critical))',
  high: 'hsl(var(--priority-high))',
  medium: 'hsl(var(--priority-medium))',
  low: 'hsl(var(--priority-low))',
};
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

interface ModuloRelatoriosProps {
  module: 'comercial' | 'educacional';
  label: string;
  subtitle: string;
}

/**
 * Indicadores de Comercial e Educacional — mesmo molde de `RHRelatorios()`,
 * sem os widgets de domínio do RH (aniversariantes/tempo de casa e a tabela
 * detalhada de colaboradores): estes dois módulos não têm nada além de
 * chamados (plano L3a).
 */
export function ModuloRelatorios({ module, label, subtitle }: ModuloRelatoriosProps) {
  const [period, setPeriod] = useQueryState<NonNullable<MetricsFilter['period']>>('periodo', '30d');
  const [activeTab, setActiveTab] = useState('overview');
  const filter: MetricsFilter = { period, module };

  const { data: metrics, isLoading } = useTicketMetrics(filter);
  const { data: trends } = useTicketTrends(filter);

  const priorityData = useMemo(() => Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({
    name: PRIORITY_LABEL[k] || k, value: v, color: PRIORITY_COLORS[k] || 'hsl(var(--muted-foreground))',
  })), [metrics]);

  const categoryData = useMemo(() => Object.entries(metrics?.byCategory || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 8), [metrics]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DashboardHeader
        title={`Indicadores do ${label}`}
        subtitle={subtitle}
        period={period as unknown as Period}
        onPeriodChange={(v) => setPeriod(v as MetricsFilter['period'])}
        periodOptions={[
          { value: 'today', label: 'Hoje' },
          { value: '7d', label: '7 dias' },
          { value: '30d', label: '30 dias' },
          { value: '90d', label: '90 dias' },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="productivity">Produtividade</TabsTrigger>
          <TabsTrigger value="detailed">Análise Detalhada</TabsTrigger>
          <TabsTrigger value="patterns">Padrões (IA)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {isLoading ? (
            <KPIGrid lgCols={4}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>
          ) : (
            <KPIGrid lgCols={4}>
              <KPICard value={metrics?.total ?? 0} label="Solicitações no período" icon={Ticket} color="blue" />
              <KPICard value={`${metrics?.slaCompliance ?? 0}%`} label="SLA atendido" icon={CheckCircle2} color="green" />
              <KPICard value={metrics?.slaViolated ?? 0} label="SLA violados" icon={AlertTriangle} color="red" />
              <KPICard value={`${metrics?.avgResolutionTime ?? 0}h`} label="Tempo médio de resposta" icon={Clock} color="purple" />
            </KPIGrid>
          )}

          <Card className="p-5">
            <h3 className="text-base font-semibold mb-1">Evolução de solicitações</h3>
            <p className="text-xs text-muted-foreground mb-3">Aberturas e conclusões no período</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trends || []}>
                <defs>
                  <linearGradient id={`${module}Open`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`${module}Resolved`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--monday-green))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--monday-green))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd/MM', { locale: ptBR })} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip labelFormatter={(d) => format(new Date(d as string), "dd 'de' MMMM", { locale: ptBR })} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Area type="monotone" dataKey="opened" stroke="hsl(var(--primary))" fill={`url(#${module}Open)`} name="Abertos" />
                <Area type="monotone" dataKey="resolved" stroke="hsl(var(--monday-green))" fill={`url(#${module}Resolved)`} name="Concluídos" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="productivity" className="space-y-6 mt-4">
          <TechnicianPerformanceChart filter={filter} />
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-base font-semibold mb-3">Por prioridade</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={priorityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={70} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="text-base font-semibold mb-1">Por categoria</h3>
              <p className="text-xs text-muted-foreground mb-3">Top 8 categorias do período</p>
              {categoryData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhuma solicitação no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="patterns" className="mt-4">
          <PatternsAnalysis module={module} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
