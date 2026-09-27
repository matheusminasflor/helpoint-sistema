import { useMemo, useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { RankCard, type RankRow } from '@/components/dashboard/RankCard';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { TopRequestersCard } from '@/components/dashboard/TopRequestersCard';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { useTicketMetrics, useTicketTrends, usePreviousMetrics, MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { useMKTSocialPosts } from '@/hooks/useMKTSocialPosts';
import {
  Ticket, CheckCircle2, Clock, AlertTriangle, Share2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SOCIAL_PLATFORM_LABELS } from '@/types/mkt';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#e2445c', high: '#fdab3d', medium: '#ffcb00', low: '#00c875',
};
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

export default function MKTRelatorios() {
  const [period, setPeriod] = useQueryState<NonNullable<MetricsFilter['period']>>('periodo', '30d');
  const [activeTab, setActiveTab] = useState('overview');
  const filter: MetricsFilter = { period, module: 'marketing' };

  const { data: metrics, isLoading } = useTicketMetrics(filter);
  usePreviousMetrics(filter);
  const { data: trends } = useTicketTrends(filter);
  const { data: allPosts = [] } = useMKTSocialPosts();
  const scheduledPosts = allPosts.filter(p => p.status === 'scheduled');

  const priorityData = useMemo(() => Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({
    name: PRIORITY_LABEL[k] || k, value: v, color: PRIORITY_COLORS[k] || '#7e8599',
  })), [metrics]);

  const categoryData = useMemo(() => Object.entries(metrics?.byCategory || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 8), [metrics]);

  const topPlatforms: RankRow[] = useMemo(() => {
    const map = new Map<string, number>();
    scheduledPosts.forEach(p => {
      const k = SOCIAL_PLATFORM_LABELS[p.platform] || p.platform;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, count]) => ({ label, count }));
  }, [scheduledPosts]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DashboardHeader
        title="Indicadores de Marketing"
        subtitle="Performance de chamados e cronograma de redes sociais."
        period={period as any}
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
              <KPICard value={metrics?.total ?? 0} label="Chamados no período" icon={Ticket} color="blue" />
              <KPICard value={`${metrics?.slaCompliance ?? 0}%`} label="SLA atendido" icon={CheckCircle2} color="green" />
              <KPICard value={metrics?.slaViolated ?? 0} label="SLA violados" icon={AlertTriangle} color="red" />
              <KPICard value={`${metrics?.avgResolutionTime ?? 0}h`} label="Tempo médio de entrega" icon={Clock} color="purple" />
            </KPIGrid>
          )}

          <Card className="p-5">
            <h3 className="text-base font-semibold mb-1">Evolução de chamados</h3>
            <p className="text-xs text-muted-foreground mb-3">Aberturas e entregas no período</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trends || []}>
                <defs>
                  <linearGradient id="mktOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a25ddc" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a25ddc" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mktResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00c875" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00c875" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd/MM', { locale: ptBR })} stroke="#7e8599" fontSize={11} />
                <YAxis stroke="#7e8599" fontSize={11} />
                <Tooltip labelFormatter={(d) => format(new Date(d as string), "dd 'de' MMMM", { locale: ptBR })} contentStyle={{ background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8 }} />
                <Area type="monotone" dataKey="opened" stroke="#a25ddc" fill="url(#mktOpen)" name="Abertos" />
                <Area type="monotone" dataKey="resolved" stroke="#00c875" fill="url(#mktResolved)" name="Entregues" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                  <XAxis type="number" stroke="#7e8599" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#7e8599" fontSize={11} width={70} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8 }} />
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
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhum chamado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="name" stroke="#7e8599" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="#7e8599" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#0073ea" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankCard title="Plataformas com mais posts agendados" rows={topPlatforms} emptyText="Nenhum post agendado." />
            <Card className="p-5">
              <h3 className="text-base font-semibold mb-1 flex items-center gap-2"><Share2 className="w-4 h-4" />Cronograma social</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {scheduledPosts.length} post(s) agendado(s) — visualize no <a className="text-primary underline" href="/mkt/social">Cronograma Social</a>.
              </p>
            </Card>
          </div>

          <TopRequestersCard filter={filter} />
        </TabsContent>

        <TabsContent value="patterns" className="mt-4">
          <PatternsAnalysis module="marketing" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
