import { useTenantPath } from '@/hooks/useTenantPath';
import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndicatorsView } from '@/components/dashboard/IndicatorsView';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard as GlpiKPICard } from '@/components/glpi/KPICard';
import { PatternsAnalysis } from '@/components/ti/PatternsAnalysis';
import { TILyraPanel } from '@/components/dashboard/TILyraPanel';
import { TechnicianPerformanceChart } from '@/components/dashboard/TechnicianPerformanceChart';
import { TopRequestersCard } from '@/components/dashboard/TopRequestersCard';
import { POPEffectivenessCard } from '@/components/dashboard/POPEffectivenessCard';
import { OverdueTicketsCard } from '@/components/dashboard/OverdueTicketsCard';
import { DashboardCustomizer } from '@/components/dashboard/DashboardCustomizer';
import { ExportPDFDialog } from '@/components/dashboard/ExportPDFDialog';
import { generatePDFReport } from '@/components/dashboard/PDFReportGenerator';
import { useDashboardPreferences, WidgetId } from '@/hooks/useDashboardPreferences';
import { useTicketMetrics, useTicketTrends, usePreviousMetrics, MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { useInventoryAssets } from '@/hooks/useInventory';
import { useLicenses } from '@/hooks/useLicenses';
import { useContracts } from '@/hooks/useContracts';
import { useMaintenances } from '@/hooks/useMaintenances';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useKanbanReportMetrics, ReportFilter, ActiveCard } from '@/hooks/useReportMetrics';
import { useLyraChat } from '@/hooks/useLyraChat';
import { useAISecretary } from '@/hooks/useAISecretary';
import {
  BarChart3, TrendingUp, TrendingDown, Minus, CheckCircle2, Clock, AlertTriangle,
  Users, Zap, Target, Timer, ChevronDown, CircleDot,
  TicketCheck, Monitor, FileKey, Wrench, FileText, Filter,
  CalendarIcon, Download, Settings2, BrainCircuit
} from 'lucide-react';
import { AIIndicatorAnalysis } from '@/components/dashboard/AIIndicatorAnalysis';
import { InventoryKPIs } from '@/components/inventory/InventoryKPIs';
import { LicensesKPIs } from '@/components/licenses/LicensesKPIs';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { format, addDays, isAfter, isBefore, startOfYear, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'year', label: 'Este Ano' },
  { value: 'custom', label: 'Personalizado' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'hsl(349, 68%, 51%)', high: 'hsl(25, 95%, 53%)', medium: 'hsl(45, 100%, 50%)', low: 'hsl(158, 64%, 40%)',
};
const CATEGORY_COLORS = [
  'hsl(213, 94%, 46%)', 'hsl(158, 64%, 40%)', 'hsl(25, 95%, 53%)', 'hsl(349, 68%, 51%)',
  'hsl(262, 83%, 58%)', 'hsl(45, 100%, 50%)', 'hsl(195, 84%, 42%)', 'hsl(340, 82%, 52%)',
];
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
  urgent: 'Urgente',
};
const PRIORITY_BADGE_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

interface ComparativeChange {
  percentageChange: number;
  trend: 'up' | 'down' | 'stable';
  previous: number;
}

function calculateChange(current: number, previous: number): ComparativeChange {
  const diff = current - previous;
  const percentageChange = previous === 0 ? (current > 0 ? 100 : 0) : Math.round((diff / previous) * 100);
  return { percentageChange, trend: percentageChange > 1 ? 'up' : percentageChange < -1 ? 'down' : 'stable', previous };
}

function ChangeIndicator({ change, inverse = false }: { change: ComparativeChange | null; inverse?: boolean }) {
  if (!change) return null;
  const isPositive = inverse ? change.trend === 'down' : change.trend === 'up';
  const isNegative = inverse ? change.trend === 'up' : change.trend === 'down';
  const Icon = change.trend === 'up' ? TrendingUp : change.trend === 'down' ? TrendingDown : Minus;
  return (
    <div className={cn(
      "flex items-center gap-1 text-xs font-medium",
      isPositive && "text-status-success",
      isNegative && "text-destructive",
      change.trend === 'stable' && "text-muted-foreground"
    )}>
      <Icon className="h-3 w-3" />
      <span>{change.percentageChange > 0 ? '+' : ''}{change.percentageChange}%</span>
    </div>
  );
}

function periodToFilter(period: string, dateRange?: DateRange): MetricsFilter {
  const now = new Date();
  const eod = endOfDay(now);
  switch (period) {
    case 'year': return { period: 'custom', startDate: startOfYear(now), endDate: eod };
    case 'custom': return { period: 'custom', startDate: dateRange?.from, endDate: dateRange?.to ? endOfDay(dateRange.to) : undefined };
    default: return { period: period as MetricsFilter['period'] };
  }
}

function ChartTooltipContent({ active, payload, label, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg  p-3 text-sm">
      <p className="font-medium text-foreground mb-1.5">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function TIRelatorios() {
  const tenantPath = useTenantPath();
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useQueryState<string>('periodo', '30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [collaboratorId, setCollaboratorId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useQueryState<string>('aba', 'overview');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);

  const { orderedWidgets, preferences, defaultPeriod, save, isSaving } = useDashboardPreferences('ti');

  const handlePeriodChange = (value: string) => {
    setSelectedPeriod(value);
    if (value !== 'custom') setDateRange(undefined);
  };

  const filter = periodToFilter(selectedPeriod, dateRange);
  // CRITICAL: indicadores TI mostram apenas chamados do módulo 'tickets' (TI), nunca MKT/RH/Qualidade
  const filterWithTech: MetricsFilter = { ...filter, technicianId: collaboratorId, module: 'tickets' };
  const filterWithModule: MetricsFilter = { ...filter, module: 'tickets' };

  const { data: metrics } = useTicketMetrics(filterWithModule);
  const { data: previousMetrics } = usePreviousMetrics(filterWithModule);
  const { data: trends } = useTicketTrends(filterWithModule);
  const { assets } = useInventoryAssets();
  const { data: licenses } = useLicenses();
  const { data: contracts } = useContracts();
  const { data: maintenances } = useMaintenances();
  const { data: technicians } = useTechnicians();

  const reportFilter: ReportFilter = { period: selectedPeriod as ReportFilter['period'], collaboratorId };
  const { data: kanbanData } = useKanbanReportMetrics('ti', reportFilter);

  // Lyra
  const { tickets: lyraTickets, kanbanCards: lyraKanbanCards } = useAISecretary();
  const { messages, isTyping, sendMessage } = useLyraChat({
    tickets: lyraTickets || [], kanbanCards: lyraKanbanCards || [], tasks: [],
  });

  const today = new Date();
  const next30Days = addDays(today, 30);
  const next90Days = addDays(today, 90);

  // Inventory breakdown by status
  const assetsByStatus = (assets || []).reduce<Record<string, number>>((acc, a) => {
    const s = (a.status || 'unknown').toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const assetsInUse = (assets || []).filter(a => a.assigned_to).length;
  const assetsInStock = (assets || []).filter(a => !a.assigned_to && (a.status === 'active' || a.status === 'in_stock')).length;
  const assetsInMaintenance = assetsByStatus['maintenance'] || 0;
  const totalAssets = assets?.length || 0;
  const activeAssets = assetsInUse;

  // Breakdown por categoria
  const assetsByCategory = (assets || []).reduce<Record<string, { inUse: number; stock: number }>>((acc, a) => {
    const cat = a.category || 'Outros';
    if (!acc[cat]) acc[cat] = { inUse: 0, stock: 0 };
    if (a.assigned_to) acc[cat].inUse++;
    else acc[cat].stock++;
    return acc;
  }, {});

  // Licenças/Domínios
  const expiredLicenses = licenses?.filter(l => l.expiry_date && new Date(l.expiry_date) < today) || [];
  const expiringLicensesCount = licenses?.filter(l => {
    if (!l.expiry_date) return false;
    const d = new Date(l.expiry_date);
    return isAfter(d, today) && isBefore(d, next30Days);
  }).length || 0;
  const expiringLicenses90 = licenses?.filter(l => {
    if (!l.expiry_date) return false;
    const d = new Date(l.expiry_date);
    return isAfter(d, today) && isBefore(d, next90Days);
  }).length || 0;
  const expiringLicensesList = licenses?.filter(l => {
    if (!l.expiry_date) return false;
    const d = new Date(l.expiry_date);
    return isAfter(d, today) && isBefore(d, next30Days);
  }) || [];
  const expiredContracts = contracts?.filter(c => c.end_date && new Date(c.end_date) < today) || [];
  const expiringContracts = contracts?.filter(c => {
    if (!c.end_date) return false;
    const d = new Date(c.end_date);
    return isAfter(d, today) && isBefore(d, next30Days);
  }) || [];
  const scheduledMaintenances = maintenances?.filter(m => {
    if (!m.scheduled_date) return false;
    const d = new Date(m.scheduled_date);
    return isAfter(d, today) && isBefore(d, next30Days) && ['scheduled', 'in_progress'].includes(m.status);
  }) || [];

  const openChange = previousMetrics ? calculateChange(metrics?.open || 0, previousMetrics.open) : null;
  const slaChange = previousMetrics ? calculateChange(metrics?.slaCompliance || 0, previousMetrics.slaCompliance) : null;

  const priorityData = Object.entries(metrics?.byPriority || {}).map(([key, value]) => ({
    name: PRIORITY_LABELS[key] || key, value, fill: PRIORITY_COLORS[key] || 'hsl(215, 16%, 47%)',
  }));
  const categoryData = Object.entries(metrics?.byCategory || {}).map(([key, value], index) => ({
    name: key, value, fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));

  const isWidgetVisible = (widgetId: WidgetId): boolean => orderedWidgets.includes(widgetId);

  const km = kanbanData?.metrics;




  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DashboardHeader
        title="Indicadores — TI"
        subtitle={`Visão consolidada de métricas operacionais — ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        period={selectedPeriod as any}
        onPeriodChange={(v) => handlePeriodChange(v as string)}
        periodOptions={[
          { value: 'today', label: 'Hoje' },
          { value: '7d', label: '7 dias' },
          { value: '30d', label: '30 dias' },
          { value: '90d', label: '90 dias' },
          { value: 'year', label: 'Ano' },
        ]}
        actions={
          <>
            <Button size="sm" variant="default" onClick={() => setAiAnalysisOpen(true)}>
              <BrainCircuit className="w-3 h-3 mr-1" />Analisar com IA
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExportDialogOpen(true)}>
              <Download className="w-3 h-3 mr-1" />Exportar PDF
            </Button>
            {activeTab === 'overview' && (
              <Button size="sm" variant="outline" onClick={() => setCustomizerOpen(true)}>
                <Settings2 className="w-3 h-3 mr-1" />Personalizar
              </Button>
            )}
          </>
        }
      />

      {/* Secondary filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {selectedPeriod === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateRange?.from ? (
                  dateRange?.to
                    ? <span>{format(dateRange.from, "dd/MM/yy")} - {format(dateRange.to, "dd/MM/yy")}</span>
                    : format(dateRange.from, "dd/MM/yyyy")
                ) : <span>Selecione as datas</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Colaborador:</span>
          <Select value={collaboratorId || 'all'} onValueChange={v => setCollaboratorId(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {technicians?.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedPeriod !== 'custom' && (
          <Button variant="ghost" size="sm" onClick={() => handlePeriodChange('custom')} className="h-8 text-xs text-muted-foreground">
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />Período personalizado
          </Button>
        )}
      </div>


      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="detailed">Análise Detalhada</TabsTrigger>
        </TabsList>

        {/* TAB: Visão Geral — enxuta */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 mt-4">
            {/* LEFT COLUMN */}
            <div className="space-y-6 min-w-0">
              {/* KPIs essenciais — TI somente */}
              <KPIGrid lgCols={4}>
                <GlpiKPICard
                  value={metrics?.open || 0}
                  label="Chamados TI em aberto"
                  icon={TicketCheck} color="orange"
                  onClick={() => navigate(tenantPath('/ti/chamados'))}
                />
                <GlpiKPICard
                  value={`${metrics?.slaCompliance || 0}%`}
                  label="SLA cumprido"
                  icon={Clock} color="blue"
                />
                <GlpiKPICard
                  value={expiredLicenses.length + expiredContracts.length}
                  label={`Vencidos · ${expiredLicenses.length} lic · ${expiredContracts.length} contr`}
                  icon={AlertTriangle} color="red"
                  onClick={() => navigate(tenantPath('/ti/licencas'))}
                />
                <GlpiKPICard
                  value={expiringLicensesCount + expiringContracts.length}
                  label={`A vencer 30d · ${expiringLicenses90} em 90d`}
                  icon={FileKey} color="yellow"
                  onClick={() => navigate(tenantPath('/ti/licencas'))}
                />
              </KPIGrid>

              {/* Inventário por status */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-primary" /> Inventário de TI
                  </h3>
                  <Link to={tenantPath("/inventario")} className="text-xs text-primary hover:underline">Ver inventário →</Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-2xl font-bold font-mono text-foreground">{assetsInUse}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em uso</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-2xl font-bold font-mono text-status-success">{assetsInStock}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em estoque</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-2xl font-bold font-mono text-status-warning">{assetsInMaintenance}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em manutenção</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-2xl font-bold font-mono text-muted-foreground">{totalAssets}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total cadastrado</div>
                  </div>
                </div>
                {Object.keys(assetsByCategory).length > 0 && (
                  <div className="border-t pt-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Por categoria (em uso / estoque)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(assetsByCategory).sort((a, b) => (b[1].inUse + b[1].stock) - (a[1].inUse + a[1].stock)).map(([cat, v]) => (
                        <div key={cat} className="flex items-center justify-between text-xs py-0.5">
                          <span className="text-foreground truncate">{cat}</span>
                          <span className="font-mono text-muted-foreground shrink-0">
                            <span className="text-foreground font-semibold">{v.inUse}</span> em uso · <span className="text-status-success font-semibold">{v.stock}</span> estoque
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Tendência */}
              <Card className="p-5">
                <CardHeader className="pb-2 px-0 pt-0">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" /> Tendência · Abertos x Resolvidos
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-0 pb-0">
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={trends || []}>
                      <defs>
                        <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(234, 89%, 54%)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(234, 89%, 54%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'dd/MM', { locale: ptBR })} tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 10 }} width={30} />
                      <Tooltip content={<ChartTooltipContent labelFormatter={(v: string) => format(new Date(v), "dd 'de' MMMM", { locale: ptBR })} />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Area type="monotone" dataKey="opened" name="Abertos" stroke="hsl(234, 89%, 54%)" strokeWidth={2} fill="url(#gradOpened)" dot={false} />
                      <Area type="monotone" dataKey="resolved" name="Resolvidos" stroke="hsl(160, 84%, 39%)" strokeWidth={2} fill="url(#gradResolved)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Atenção agora — 3 mini-blocos compactos */}
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Atenção agora</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Contratos expirando */}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-status-warning" />
                      <span className="text-sm font-semibold text-foreground">Contratos expirando</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">{expiringContracts.length}</Badge>
                    </div>
                    {expiringContracts.length > 0 ? (
                      <ul className="space-y-1.5">
                        {expiringContracts.slice(0, 3).map(c => (
                          <li key={c.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium truncate max-w-[60%] text-foreground">{c.name}</span>
                            <span className="text-muted-foreground font-mono">{c.end_date && format(new Date(c.end_date), 'dd/MM')}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum nos próximos 30 dias.</p>
                    )}
                    <Link to={tenantPath("/ti/contratos")} className="text-xs text-primary hover:underline mt-3 block font-medium">Ver todos →</Link>
                  </Card>

                  {/* Manutenções */}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Próximas manutenções</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">{scheduledMaintenances.length}</Badge>
                    </div>
                    {scheduledMaintenances.length > 0 ? (
                      <ul className="space-y-1.5">
                        {scheduledMaintenances.slice(0, 3).map(m => (
                          <li key={m.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium truncate max-w-[60%] text-foreground">{m.title}</span>
                            <span className="text-muted-foreground font-mono">{m.scheduled_date && format(new Date(m.scheduled_date), 'dd/MM')}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma agendada.</p>
                    )}
                    <Link to={tenantPath("/ti/manutencoes")} className="text-xs text-primary hover:underline mt-3 block font-medium">Ver todas →</Link>
                  </Card>

                  {/* SLA violados */}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-foreground">SLA violados</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-destructive">{metrics?.slaViolated || 0}</span>
                      <span className="text-xs text-muted-foreground">chamados</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Atraso médio {metrics?.avgOverdueTime || 0}h · {metrics?.slaViolationRate || 0}% do total
                    </p>
                    <button
                      onClick={() => setActiveTab('detailed')}
                      className="text-xs text-primary hover:underline mt-3 block font-medium"
                    >
                      Ver detalhes →
                    </button>
                  </Card>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — Lyra */}
            <div className="hidden lg:block">
              <TILyraPanel
                messages={messages} isTyping={isTyping} onSend={sendMessage}
                ticketCount={metrics?.open} slaCompliance={metrics?.slaCompliance}
                expiringLicenses={expiringLicensesCount}
              />
            </div>
          </div>
        </TabsContent>





        {/* TAB: Análise Detalhada */}
        <TabsContent value="detailed">
          <div className="mt-4">
            <IndicatorsView
              metrics={metrics || null}
              previousMetrics={previousMetrics || null}
              activeAssets={activeAssets}
              totalAssets={totalAssets}
              assetsInStock={assetsInStock}
              assetsInMaintenance={assetsInMaintenance}
              expiringLicenses={expiringLicensesCount}
              expiringContractsCount={expiringContracts.length}
              scheduledMaintenancesCount={scheduledMaintenances.length}
              filter={filterWithTech}
              expiringLicensesList={expiringLicensesList}
              expiringContractsList={expiringContracts.map(c => ({ id: c.id, name: c.name, end_date: c.end_date }))}
              scheduledMaintenancesList={scheduledMaintenances.map(m => ({ id: m.id, title: m.title, scheduled_date: m.scheduled_date, status: m.status, asset: m.asset }))}
            />
          </div>
        </TabsContent>

      </Tabs>


      <ExportPDFDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        reportData={{
          metrics: metrics || null, previousMetrics: previousMetrics || null, trends: trends || null,
          filter: filterWithTech, activeAssets, totalAssets, expiringLicenses: expiringLicensesCount,
          expiringContractsCount: expiringContracts.length, scheduledMaintenancesCount: scheduledMaintenances.length,
          technicianName: technicians?.find(t => t.id === collaboratorId)?.full_name || technicians?.find(t => t.id === collaboratorId)?.email,
        }}
      />

      <AIIndicatorAnalysis
        open={aiAnalysisOpen}
        onClose={() => setAiAnalysisOpen(false)}
        period={PERIOD_OPTIONS.find(o => o.value === selectedPeriod)?.label || selectedPeriod}
        metrics={{
          chamados: {
            abertos: metrics?.open || 0,
            em_andamento: metrics?.inProgress || 0,
            resolvidos: metrics?.resolved || 0,
            fechados: metrics?.closed || 0,
            sla_cumprido_percent: metrics?.slaCompliance || 0,
            tempo_medio_resolucao_horas: metrics?.avgResolutionTime || 0,
            por_prioridade: metrics?.byPriority || {},
            por_categoria: metrics?.byCategory || {},
          },
          inventario: {
            ativos_operacionais: activeAssets,
            total_cadastrados: totalAssets,
          },
          licencas_expirando_30d: expiringLicensesCount,
          contratos_expirando_30d: expiringContracts.length,
          manutencoes_agendadas: scheduledMaintenances.length,
          kanban: km ? {
            total_cards: km.total,
            em_andamento: km.inProgress,
            concluidos: km.completed,
            atrasados: km.overdue,
            pendentes: km.pending,
          } : null,
        }}
      />

      <DashboardCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        visibleWidgets={preferences?.visible_widgets || []}
        widgetOrder={preferences?.widget_order || []}
        defaultPeriod={defaultPeriod}
        onSave={save}
        isSaving={isSaving}
      />
    </div>
  );
}

function KPIMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-foreground tracking-tight">{value}</div>
    </Card>
  );
}

function ActiveCardsByColumn({ cards }: { cards: ActiveCard[] }) {
  const grouped = cards.reduce<Record<string, ActiveCard[]>>((acc, card) => {
    if (!acc[card.columnName]) acc[card.columnName] = [];
    acc[card.columnName].push(card);
    return acc;
  }, {});

  const columnOrder = ['Chamados', 'Pendentes', 'Em Andamento', 'Vencidos'];
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ia = columnOrder.indexOf(a);
    const ib = columnOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
        <CircleDot className="h-4 w-4 text-primary" /> Demanda Ativa
        <Badge variant="secondary" className="ml-1 text-[10px]">{cards.length}</Badge>
      </h2>
      <div className="space-y-3">
        {sortedGroups.map(([columnName, columnCards]) => (
          <Collapsible key={columnName} defaultOpen>
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                    <span className="text-sm font-semibold text-foreground">{columnName}</span>
                    <Badge variant="secondary" className="text-[10px]">{columnCards.length}</Badge>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t divide-y divide-slate-100">
                  {columnCards.map(card => (
                    <div key={card.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <span className="flex-1 text-sm text-foreground truncate">{card.title}</span>
                      {card.priority && (
                        <Badge className={cn('text-[10px] border', PRIORITY_BADGE_COLORS[card.priority] || 'bg-muted text-muted-foreground')}>
                          {PRIORITY_LABELS[card.priority] || card.priority}
                        </Badge>
                      )}
                      {card.assigneeName && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={card.assigneeAvatar || ''} />
                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                              {card.assigneeName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground hidden sm:inline">{card.assigneeName.split(' ')[0]}</span>
                        </div>
                      )}
                      {card.dueDate && (
                        <span className={cn(
                          'text-[10px] font-mono shrink-0',
                          new Date(card.dueDate) < new Date() ? 'text-red-600 font-bold' : 'text-muted-foreground'
                        )}>
                          {format(new Date(card.dueDate), 'dd/MM')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
