// Indicadores de Marketing. Desde 2026-10-13 (dono: "o visual está fora do padrão; os dashboards em Visão
// Geral e a Análise Detalhada igual à da TI"): duas abas, como a TI. Visão Geral = os painéis (números,
// evolução, prioridade, categoria, cronograma social, padrões); Análise Detalhada = o mesmo componente da TI
// (`IndicatorsView`), só com os indicadores de chamado.
import { useMemo, useState } from 'react';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { OPCOES_DE_CALENDARIO } from '@/lib/period';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { RankCard, type RankRow } from '@/components/dashboard/RankCard';
import { IndicatorsView } from '@/components/dashboard/IndicatorsView';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { LinhaAgendaEAjuda } from '@/components/dashboard/AjudaAOutrosSetoresKPI';
import { ChartTooltipContent } from '@/components/ui/chart';
import { useTicketMetrics, useTicketTrends, usePreviousMetrics, MetricsFilter, filtroDoPeriodo, intervaloDoFiltro } from '@/hooks/useHelpdeskMetrics';
import { useMKTSocialPosts } from '@/hooks/useMKTSocialPosts';
import { useTenantPath } from '@/hooks/useTenantPath';
import { Link } from 'react-router-dom';
import { Ticket, CheckCircle2, Clock, AlertTriangle, Share2, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SOCIAL_PLATFORM_LABELS } from '@/types/mkt';

// As mesmas cores da TI (`TIRelatorios`): o padrão visual das telas de indicadores.
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'hsl(0, 72%, 51%)', high: 'hsl(25, 95%, 53%)', medium: 'hsl(45, 93%, 47%)', low: 'hsl(160, 84%, 39%)',
};
const PRIORITY_LABEL: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
const EIXO = { fill: 'hsl(215, 16%, 47%)', fontSize: 12 };

export default function MKTRelatorios() {
  const tenantPath = useTenantPath();
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<NonNullable<MetricsFilter['period']>>('30d');
  const [activeTab, setActiveTab] = useState('overview');
  // O período manda em todo bloco de chamados abaixo: todos leem este `filter`.
  const filter: MetricsFilter = { ...filtroDoPeriodo(periodo, intervalo), module: 'marketing' };

  const { data: metrics, isLoading } = useTicketMetrics(filter);
  const { data: previousMetrics } = usePreviousMetrics(filter);
  const { data: trends } = useTicketTrends(filter);
  const { data: allPosts = [] } = useMKTSocialPosts();
  const scheduledPosts = allPosts.filter(p => p.status === 'scheduled');

  const priorityData = useMemo(() => Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({
    name: PRIORITY_LABEL[k] || k, value: v, fill: PRIORITY_COLORS[k] || 'hsl(215, 16%, 47%)',
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
        title="Indicadores — Marketing"
        subtitle={`Chamados do Marketing e cronograma de redes sociais — ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={<TutorialDoRelatorio id="mkt-indicadores" />}
        period={periodo}
        onPeriodChange={(v) => escolher(v, intervaloDoFiltro(filter))}
        intervalo={intervalo}
        onIntervaloChange={definirIntervalo}
        periodOptions={[
          { value: 'today', label: 'Hoje' },
          { value: '7d', label: '7 dias' },
          { value: '30d', label: '30 dias' },
          { value: '90d', label: '90 dias' },
          ...OPCOES_DE_CALENDARIO,
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="detailed">Análise Detalhada</TabsTrigger>
        </TabsList>

        {/* TAB: Visão Geral — os painéis */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {isLoading ? (
            <KPIGrid lgCols={4}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>
          ) : (
            <KPIGrid lgCols={4}>
              <KPICard value={metrics?.total ?? 0} label="Chamados no período" icon={Ticket} color="blue" explicacao="chamados.total" />
              <KPICard value={`${metrics?.slaCompliance ?? 0}%`} label="SLA cumprido" icon={CheckCircle2} color="green" explicacao="chamados.sla_cumprido" />
              <KPICard value={metrics?.slaViolated ?? 0} label="SLA violados" icon={AlertTriangle} color="red" explicacao="chamados.sla_violados" />
              <KPICard value={`${metrics?.avgResolutionTime ?? 0}h`} label="Tempo médio de entrega" icon={Clock} color="purple" explicacao="chamados.tempo_medio_resolucao" />
            </KPIGrid>
          )}
          {!isLoading && <LinhaAgendaEAjuda metrics={metrics} modulo="marketing" filter={filter} />}

          {/* Tendência — o mesmo cartão da TI */}
          <Card className="p-5">
            <CardHeader className="pb-2 px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 text-primary" /> Tendência · Abertos x Entregues
                <ExplicacaoDoIndicador id="chamados.evolucao" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0 pb-0">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trends || []}>
                  <defs>
                    <linearGradient id="mktAbertos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(234, 89%, 54%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(234, 89%, 54%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mktEntregues" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'dd/MM', { locale: ptBR })} tick={EIXO} />
                  <YAxis tick={EIXO} width={30} />
                  <Tooltip content={<ChartTooltipContent labelFormatter={(v: string) => format(new Date(v), "dd 'de' MMMM", { locale: ptBR })} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="opened" name="Abertos" stroke="hsl(234, 89%, 54%)" strokeWidth={2} fill="url(#mktAbertos)" dot={false} />
                  <Area type="monotone" dataKey="resolved" name="Entregues" stroke="hsl(160, 84%, 39%)" strokeWidth={2} fill="url(#mktEntregues)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">Por prioridade <ExplicacaoDoIndicador id="chamados.por_prioridade" /></h3>
              {priorityData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhum chamado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priorityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={EIXO} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={EIXO} width={70} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" name="Chamados" radius={[0, 6, 6, 0]}>
                      {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">Por categoria <ExplicacaoDoIndicador id="chamados.por_categoria" /></h3>
              <p className="text-xs text-muted-foreground mb-3">As 8 categorias com mais chamados no período</p>
              {categoryData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhum chamado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={EIXO} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={EIXO} width={130} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" name="Chamados" fill="hsl(234, 89%, 54%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankCard title="Plataformas com mais posts agendados" rows={topPlatforms} emptyText="Nenhum post agendado." explicacao="mkt.plataformas" />
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Share2 className="w-4 h-4" />Cronograma social <ExplicacaoDoIndicador id="mkt.cronograma" /></h3>
              <p className="text-sm text-muted-foreground mt-2">
                {scheduledPosts.length} post(s) agendado(s) — veja no <Link className="text-primary underline" to={tenantPath('/mkt/social')}>Cronograma Social</Link>.
              </p>
            </Card>
          </div>

          <PatternsAnalysis module="marketing" />
        </TabsContent>

        {/* TAB: Análise Detalhada — igual à da TI, só com os indicadores de chamado */}
        <TabsContent value="detailed">
          <div className="mt-4">
            <IndicatorsView metrics={metrics || null} previousMetrics={previousMetrics || null} filter={filter} soChamados />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
