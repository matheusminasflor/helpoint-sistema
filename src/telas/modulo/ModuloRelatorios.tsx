import { useMemo, useState } from 'react';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { OPCOES_DE_CALENDARIO } from '@/lib/period';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import type { IdDoTutorial } from '@/config/tutoriais-dos-relatorios';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { TabelaCategoriaPorStatus } from '@/components/dashboard/IndicatorsView';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { useTicketMetrics, useTicketTrends, MetricsFilter, filtroDoPeriodo, intervaloDoFiltro } from '@/hooks/useHelpdeskMetrics';
import {
  Ticket, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import { LinhaAgendaEAjuda } from '@/components/dashboard/AjudaAOutrosSetoresKPI';
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
  module: 'comercial' | 'educacional' | 'expedicao' | 'producao' | 'qualidade';
  label: string;
  subtitle: string;
  /** Sobrescreve "Indicadores do {label}" — o Comercial chama esta visão de "Atendimento". */
  titulo?: string;
  tutorial: IdDoTutorial;
}

/**
 * Indicadores de Comercial e Educacional — mesmo molde de `RHRelatorios()`,
 * sem os widgets de domínio do RH (aniversariantes/tempo de casa e a tabela
 * detalhada de colaboradores): estes dois módulos não têm nada além de
 * chamados (plano L3a).
 */
export function ModuloRelatorios({ module, label, subtitle, titulo, tutorial }: ModuloRelatoriosProps) {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<NonNullable<MetricsFilter['period']>>('30d');
  const [activeTab, setActiveTab] = useState('overview');
  // O período manda em todo bloco de chamados abaixo: todos leem este `filter`.
  const filter: MetricsFilter = { ...filtroDoPeriodo(periodo, intervalo), module };

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
        title={titulo ?? `Indicadores do ${label}`}
        subtitle={subtitle}
        actions={<TutorialDoRelatorio id={tutorial} />}
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
          <TabsTrigger value="productivity">Produtividade</TabsTrigger>
          <TabsTrigger value="detailed">Análise Detalhada</TabsTrigger>
          <TabsTrigger value="patterns">Padrões (IA)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {isLoading ? (
            <KPIGrid lgCols={5}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>
          ) : (
            <KPIGrid lgCols={5}>
              <KPICard value={metrics?.total ?? 0} label="Solicitações no período" icon={Ticket} color="blue" explicacao="chamados.total" />
              <KPICard value={`${metrics?.slaCompliance ?? 0}%`} label="SLA atendido" icon={CheckCircle2} color="green" explicacao="chamados.sla_cumprido" />
              <KPICard value={`${metrics?.firstResponseCompliance ?? 0}%`} label="1ª resposta no prazo" icon={CheckCircle2} color="blue" explicacao="chamados.primeira_resposta_no_prazo" />
              <KPICard value={metrics?.slaViolated ?? 0} label="SLA violados" icon={AlertTriangle} color="red" explicacao="chamados.sla_violados" />
              {/* "de resolução", não "de resposta": o número é `avgResolutionTime` (abertura → resolução).
                  O rótulo antigo dizia outra coisa — achado ao escrever a explicação, 2026-10-04. */}
              <KPICard value={`${metrics?.avgResolutionTime ?? 0}h`} label="Tempo médio de resolução" icon={Clock} color="purple" explicacao="chamados.tempo_medio_resolucao" />
            </KPIGrid>
          )}

          {/* Agendados e ajuda a outros setores (dono, 2026-10-07). */}
          {!isLoading && <LinhaAgendaEAjuda metrics={metrics} modulo={module} filter={filter} />}

          <Card className="p-5">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">Evolução de solicitações <ExplicacaoDoIndicador id="chamados.evolucao" /></h3>
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
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">Por prioridade <ExplicacaoDoIndicador id="chamados.por_prioridade" /></h3>
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
              <h3 className="text-base font-semibold mb-1 flex items-center gap-2">Por categoria <ExplicacaoDoIndicador id="chamados.por_categoria" /></h3>
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

          {/* Os chamados por trás de cada número, ao passar o mouse (dono, 2026-10-04). */}
          <TabelaCategoriaPorStatus chamados={metrics?.chamados ?? []} modulo={module} />
        </TabsContent>

        <TabsContent value="patterns" className="mt-4">
          <PatternsAnalysis module={module} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
