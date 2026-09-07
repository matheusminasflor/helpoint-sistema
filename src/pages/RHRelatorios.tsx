import { useMemo, useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DetailedRHTable } from '@/components/rh/DetailedRHTable';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { TopRequestersCard } from '@/components/dashboard/TopRequestersCard';
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

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#e2445c', high: '#fdab3d', medium: '#ffcb00', low: '#00c875',
};
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

export default function RHRelatorios() {
  const [period, setPeriod] = useQueryState<NonNullable<MetricsFilter['period']>>('periodo', '30d');
  const [activeTab, setActiveTab] = useState('overview');
  const filter: MetricsFilter = { period, module: 'rh' };

  const { data: metrics, isLoading } = useTicketMetrics(filter);
  const { data: trends } = useTicketTrends(filter);

  const priorityData = useMemo(() => Object.entries(metrics?.byPriority || {}).map(([k, v]) => ({
    name: PRIORITY_LABEL[k] || k, value: v, color: PRIORITY_COLORS[k] || '#7e8599',
  })), [metrics]);

  const categoryData = useMemo(() => Object.entries(metrics?.byCategory || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 8), [metrics]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DashboardHeader
        title="Indicadores de RH"
        subtitle="Demandas de pessoas: admissão, férias, folha, benefícios, atestados e relacionamento."
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
                  <linearGradient id="rhOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0073ea" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0073ea" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rhResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00c875" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00c875" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd/MM', { locale: ptBR })} stroke="#7e8599" fontSize={11} />
                <YAxis stroke="#7e8599" fontSize={11} />
                <Tooltip labelFormatter={(d) => format(new Date(d as string), "dd 'de' MMMM", { locale: ptBR })} contentStyle={{ background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8 }} />
                <Area type="monotone" dataKey="opened" stroke="#0073ea" fill="url(#rhOpen)" name="Abertos" />
                <Area type="monotone" dataKey="resolved" stroke="#00c875" fill="url(#rhResolved)" name="Concluídos" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <RHPeopleWidget />
        </TabsContent>

        <TabsContent value="productivity" className="space-y-6 mt-4">
          <TechnicianPerformanceChart filter={filter} />
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6 mt-4">
          <DetailedRHTable
            tickets={(metrics as any)?.tickets || []}
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
      const data = unwrap(await supabase
        .from('rh_employee_profiles')
        .select('user_id, birth_date, admission_date, profile:user_id(full_name, email, department, avatar_url)')
        .eq('tenant_id', tenantId));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const currentMonth = new Date().getMonth();
  const today = new Date();

  const birthdays = profiles
    .filter((p: any) => p.birth_date && new Date(p.birth_date).getMonth() === currentMonth)
    .sort((a: any, b: any) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());

  const tenureMilestones = profiles
    .filter((p: any) => p.admission_date)
    .map((p: any) => {
      const years = differenceInYears(today, new Date(p.admission_date));
      const months = differenceInMonths(today, new Date(p.admission_date));
      return { ...p, years, months };
    })
    .filter((p: any) => {
      // celebrate this month: anniversary of admission falling in current month with >= 1 year
      const admMonth = new Date(p.admission_date).getMonth();
      return admMonth === currentMonth && p.years >= 1;
    })
    .sort((a: any, b: any) => b.years - a.years);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Cake className="w-4 h-4 text-rose-500" />
          <h3 className="text-base font-semibold">Aniversariantes do mês</h3>
          <Badge variant="outline" className="ml-auto">{birthdays.length}</Badge>
        </div>
        {birthdays.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aniversariante neste mês.</p>
        ) : (
          <div className="space-y-2">
            {birthdays.map((p: any) => (
              <div key={p.user_id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{p.profile?.full_name || p.profile?.email}</div>
                  <div className="text-xs text-muted-foreground">{p.profile?.department || '—'}</div>
                </div>
                <Badge className="bg-rose-100 text-rose-700 border-0">
                  {format(new Date(p.birth_date), 'dd/MM')}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-amber-500" />
          <h3 className="text-base font-semibold">Tempo de casa — destaques do mês</h3>
          <Badge variant="outline" className="ml-auto">{tenureMilestones.length}</Badge>
        </div>
        {tenureMilestones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aniversário de empresa neste mês.</p>
        ) : (
          <div className="space-y-2">
            {tenureMilestones.map((p: any) => (
              <div key={p.user_id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{p.profile?.full_name || p.profile?.email}</div>
                  <div className="text-xs text-muted-foreground">desde {format(new Date(p.admission_date), 'dd/MM/yyyy')}</div>
                </div>
                <Badge className="bg-amber-100 text-amber-800 border-0">
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
