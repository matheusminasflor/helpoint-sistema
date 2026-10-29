import { COR, COR_ABERTOS, COR_DA_PRIORIDADE, COR_RESOLVIDOS } from '@/config/cores-dos-graficos';
import { useMemo, useState } from 'react';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { OPCOES_DE_CALENDARIO } from '@/lib/period';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { DetailedRHTable } from '@/components/rh/DetailedRHTable';
import { IndicadoresDePessoas } from '@/components/rh/IndicadoresDePessoas';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { TopRequestersCard } from '@/components/dashboard/TopRequestersCard';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { LinhaAgendaEAjuda } from '@/components/dashboard/AjudaAOutrosSetoresKPI';
import { useTicketMetrics, useTicketTrends, MetricsFilter, filtroDoPeriodo, intervaloDoFiltro } from '@/hooks/useHelpdeskMetrics';
import {
  Ticket, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { format } from 'date-fns';
import { fromLocalISODate } from '@/lib/dates';
import { ptBR } from 'date-fns/locale';

const PRIORITY_COLORS: Record<string, string> = {
  ...COR_DA_PRIORIDADE,
};
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

export default function RHRelatorios() {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<NonNullable<MetricsFilter['period']>>('30d');
  const [activeTab, setActiveTab] = useState('overview');
  // O período manda em todo bloco de chamados abaixo: todos leem este `filter`.
  const filter: MetricsFilter = { ...filtroDoPeriodo(periodo, intervalo), module: 'rh' };

  const { data: metrics, isLoading } = useTicketMetrics(filter);
  const { data: trends } = useTicketTrends(filter);

  const priorityData = useMemo(() => Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({
    name: PRIORITY_LABEL[k] || k, value: v, color: PRIORITY_COLORS[k] || COR.eixo,
  })), [metrics]);

  const categoryData = useMemo(() => Object.entries(metrics?.byCategory || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 8), [metrics]);

  return (
    <div className="px-4 lg:px-8 pb-6 w-full">
      <DashboardHeader
        title="Indicadores de RH"
        subtitle="As pessoas da empresa (quantas, entradas e saídas, faltas, folha e férias) e os chamados do RH."
        actions={<TutorialDoRelatorio id="rh-indicadores" />}
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
          {/* Pessoas primeiro (rodada 2, R4): quantas, quem entrou e saiu, faltas, folha e férias. Os chamados vêm depois. */}
          <section aria-label="Pessoas" className="space-y-3">
            <h2 className="text-[14px] font-semibold text-muted-foreground">Pessoas</h2>
            <IndicadoresDePessoas {...intervaloDoFiltro(filter)} />
          </section>

          <h2 className="text-[14px] font-semibold text-muted-foreground">Chamados do RH</h2>
          {isLoading ? (
            <KPIGrid lgCols={4}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>
          ) : (
            <KPIGrid lgCols={4}>
              <KPICard value={metrics?.total ?? 0} label="Chamados no período" icon={Ticket} color="blue" explicacao="chamados.total" />
              <KPICard value={`${metrics?.slaCompliance ?? 0}%`} label="SLA atendido" icon={CheckCircle2} color="green" explicacao="chamados.sla_cumprido" />
              <KPICard value={metrics?.slaViolated ?? 0} label="SLA violados" icon={AlertTriangle} color="red" explicacao="chamados.sla_violados" />
              {/* "de resolução": o número é `avgResolutionTime` (abertura → resolução); dizia "de resposta". */}
              <KPICard value={`${metrics?.avgResolutionTime ?? 0}h`} label="Tempo médio de resolução" icon={Clock} color="purple" explicacao="chamados.tempo_medio_resolucao" />
            </KPIGrid>
          )}
          {!isLoading && <LinhaAgendaEAjuda metrics={metrics} modulo="rh" filter={filter} />}

          <Card className="p-5">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">Evolução de chamados <ExplicacaoDoIndicador id="chamados.evolucao" /></h3>
            <p className="text-xs text-muted-foreground mb-3">Aberturas e conclusões no período</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trends || []}>
                <defs>
                  <linearGradient id="rhOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COR_ABERTOS} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COR_ABERTOS} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rhResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COR_RESOLVIDOS} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COR_RESOLVIDOS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} />
                <XAxis dataKey="date" tickFormatter={(d) => format(fromLocalISODate(d), 'dd/MM', { locale: ptBR })} stroke={COR.eixo} fontSize={11} />
                <YAxis stroke={COR.eixo} fontSize={11} />
                <Tooltip labelFormatter={(d) => format(fromLocalISODate(d as string), "dd 'de' MMMM", { locale: ptBR })} contentStyle={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: 'none', borderRadius: 14, boxShadow: '6px 6px 54px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="opened" stroke={COR_ABERTOS} fill="url(#rhOpen)" name="Abertos" />
                <Area type="monotone" dataKey="resolved" stroke={COR_RESOLVIDOS} fill="url(#rhResolved)" name="Concluídos" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <RHPeopleWidget />
        </TabsContent>

        <TabsContent value="productivity" className="space-y-6 mt-4">
          <TechnicianPerformanceChart filter={filter} />
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6 mt-4">
          {/* `metrics.chamados`: antes ia `metrics.tickets`, campo que nunca existiu — a tabela do RH
              mostrava "Em aberto" e "Resolvidos" zerados e a tabela de categorias vazia (2026-10-04). */}
          <DetailedRHTable
            tickets={metrics?.chamados ?? []}
            metrics={metrics}
            variations={{}}
            priorityData={priorityData}
          />
        </TabsContent>

        <TabsContent value="patterns" className="mt-4">
          <PatternsAnalysis module="rh" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============= Aniversariantes & Tempo de casa =============
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { Cake, Award } from 'lucide-react';
import { differenceInYears, differenceInMonths } from 'date-fns';

function RHPeopleWidget() {
  const { tenantId } = useAuth();
  const { data: profiles = [] } = useQuery({
    queryKey: ['rh-people-widget', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      // `neq('status', 'desligado')` no BANCO, não no filtro de baixo: quem saiu
      // da empresa aparecia em "Aniversariantes do mês" e em "Tempo de casa", e
      // a lista parecia um quadro de pessoal maior do que o real. Deixar o
      // Postgres cortar é uma linha a menos e uma viagem menor. Afastado fica —
      // ver `estaNaEmpresa` em `@/lib/rh-status`.
      const data = unwrap(await supabase
        .from('rh_employee_profiles')
        // O nome e o setor são do colaborador (com ou sem login), não do login: sem login, saía em branco (R4).
        .select('id, full_name, department, birth_date, admission_date, status')
        .eq('tenant_id', tenantId)
        .neq('status', 'desligado'));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const currentMonth = new Date().getMonth();
  const today = new Date();

  const birthdays = profiles
    .filter((p: any) => p.birth_date && fromLocalISODate(p.birth_date).getMonth() === currentMonth)
    .sort((a: any, b: any) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());

  const tenureMilestones = profiles
    .filter((p: any) => p.admission_date)
    .map((p: any) => {
      const years = differenceInYears(today, fromLocalISODate(p.admission_date));
      const months = differenceInMonths(today, fromLocalISODate(p.admission_date));
      return { ...p, years, months };
    })
    .filter((p: any) => {
      // celebrate this month: anniversary of admission falling in current month with >= 1 year
      const admMonth = fromLocalISODate(p.admission_date).getMonth();
      return admMonth === currentMonth && p.years >= 1;
    })
    .sort((a: any, b: any) => b.years - a.years);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Cake className="w-4 h-4 text-status-danger" />
          <h3 className="text-base font-semibold">Aniversariantes do mês</h3>
          <ExplicacaoDoIndicador id="rh.aniversariantes" />
          <Badge variant="outline" className="ml-auto">{birthdays.length}</Badge>
        </div>
        {birthdays.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aniversariante neste mês.</p>
        ) : (
          <div className="space-y-2">
            {/* `key={p.id}`, não `p.user_id`: colaborador sem conta no sistema tem
                `user_id` nulo, e dois assim colidiriam na mesma chave — o React
                desenharia um só. */}
            {birthdays.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{p.full_name || '—'}</div>
                  <div className="text-xs text-muted-foreground">{p.department || '—'}</div>
                </div>
                <Badge className="badge-danger text-status-danger border-0">
                  {format(fromLocalISODate(p.birth_date), 'dd/MM')}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-status-warning" />
          <h3 className="text-base font-semibold">Tempo de casa — destaques do mês</h3>
          <ExplicacaoDoIndicador id="rh.tempo_de_casa" />
          <Badge variant="outline" className="ml-auto">{tenureMilestones.length}</Badge>
        </div>
        {tenureMilestones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aniversário de empresa neste mês.</p>
        ) : (
          <div className="space-y-2">
            {tenureMilestones.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{p.full_name || '—'}</div>
                  <div className="text-xs text-muted-foreground">desde {format(fromLocalISODate(p.admission_date), 'dd/MM/yyyy')}</div>
                </div>
                <Badge className="badge-warning text-status-warning border-0">
                  {p.years} ano{p.years > 1 ? 's' : ''}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
