import { useState } from 'react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TicketMetrics, MetricsFilter, useViolatedSlaTickets, useTicketsByStatusList } from '@/hooks/useHelpdeskMetrics';
import { TechnicianPerformanceChart } from './TechnicianPerformanceChart';
import { TopRequestersCard } from './TopRequestersCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  TrendingUp, TrendingDown, Minus, TicketCheck, Clock, Monitor,
  FileKey, AlertTriangle, FileText, Wrench, BookOpen, ShieldCheck,
  ChevronDown, ChevronRight, Info, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TicketLite {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority?: string;
  created_at: string;
  assignee?: { full_name?: string | null; email?: string | null } | null;
}

interface IndicatorRow {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string | number;
  previous?: string | number | null;
  change?: number | null;
  changeInverse?: boolean;
  category: string;
  hoverList?: TicketLite[];
  hoverEmpty?: string;
  onClick?: () => void;
}

interface ExpiringLicense {
  id: string;
  name: string;
  vendor: string | null;
  expiry_date: string | null;
}

interface ExpiringContract {
  id: string;
  name: string;
  end_date: string | null;
}

interface ScheduledMaintenance {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  asset?: { name: string } | null;
}

interface IndicatorsViewProps {
  metrics: TicketMetrics | null;
  previousMetrics: TicketMetrics | null;
  activeAssets: number;
  totalAssets: number;
  assetsInStock?: number;
  assetsInMaintenance?: number;
  expiringLicenses: number;
  expiringContractsCount: number;
  scheduledMaintenancesCount: number;
  filter: MetricsFilter;
  expiringLicensesList?: ExpiringLicense[];
  expiringContractsList?: ExpiringContract[];
  scheduledMaintenancesList?: ScheduledMaintenance[];
}

const CATEGORIES = [
  { id: 'helpdesk', label: 'Helpdesk', icon: TicketCheck },
  { id: 'ativos', label: 'Ativos', icon: Monitor },
  { id: 'licencas', label: 'Licenças', icon: FileKey },
  { id: 'contratos', label: 'Contratos', icon: FileText },
  { id: 'manutencoes', label: 'Manutenções', icon: Wrench },
] as const;

function calcChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function TrendIcon({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null || change === undefined) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const isGood = inverse ? change < 0 : change > 0;
  const isBad = inverse ? change > 0 : change < 0;
  if (Math.abs(change) <= 1) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn("flex items-center gap-1 text-xs font-semibold",
      isGood && "text-status-success",
      isBad && "text-destructive"
    )}>
      <Icon className="h-3.5 w-3.5" />
      <span>{change > 0 ? '+' : ''}{change}%</span>
    </div>
  );
}

function DetailSection({ title, icon, count, children }: {
  title: string; icon: React.ReactNode; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between h-10 px-4 hover:bg-background">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium text-foreground">{title}</span>
            <Badge variant="secondary" className="text-[10px]">{count}</Badge>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function IndicatorsView({
  metrics, previousMetrics, activeAssets, totalAssets,
  assetsInStock, assetsInMaintenance,
  expiringLicenses, expiringContractsCount, scheduledMaintenancesCount, filter,
  expiringLicensesList = [], expiringContractsList = [], scheduledMaintenancesList = [],
}: IndicatorsViewProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [activeCategories, setActiveCategories] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('ti-indicators-categories');
    return saved ? new Set(JSON.parse(saved)) : new Set(CATEGORIES.map(c => c.id));
  });

  const { data: violatedTickets } = useViolatedSlaTickets();
  const { data: openList = [] } = useTicketsByStatusList(filter, ['open']);
  const { data: inProgressList = [] } = useTicketsByStatusList(filter, ['in_progress']);
  const { data: resolvedList = [] } = useTicketsByStatusList(filter, ['resolved']);

  const toggleCategory = (id: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('ti-indicators-categories', JSON.stringify([...next]));
      return next;
    });
  };

  const assetsValueLabel = (assetsInStock !== undefined || assetsInMaintenance !== undefined)
    ? `${activeAssets} em uso · ${assetsInStock ?? Math.max(totalAssets - activeAssets - (assetsInMaintenance ?? 0), 0)} em estoque · ${totalAssets} no total`
    : `${activeAssets} em uso de ${totalAssets} no total`;

  const rows: IndicatorRow[] = [
    {
      id: 'opened', label: 'Chamados Abertos', category: 'helpdesk',
      icon: <TicketCheck className="h-4 w-4 text-primary" />,
      value: metrics?.open || 0, previous: previousMetrics?.open,
      change: calcChange(metrics?.open || 0, previousMetrics?.open), changeInverse: true,
      hoverList: openList as TicketLite[],
      hoverEmpty: 'Nenhum chamado aberto no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=open')),
    },
    {
      id: 'in_progress', label: 'Em Andamento', category: 'helpdesk',
      icon: <Clock className="h-4 w-4 text-status-warning" />,
      value: metrics?.inProgress || 0, previous: previousMetrics?.inProgress,
      change: calcChange(metrics?.inProgress || 0, previousMetrics?.inProgress), changeInverse: true,
      hoverList: inProgressList as TicketLite[],
      hoverEmpty: 'Nenhum chamado em andamento no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=in_progress')),
    },
    {
      id: 'resolved', label: 'Resolvidos', category: 'helpdesk',
      icon: <ShieldCheck className="h-4 w-4 text-status-success" />,
      value: metrics?.resolved || 0, previous: previousMetrics?.resolved,
      change: calcChange(metrics?.resolved || 0, previousMetrics?.resolved),
      hoverList: resolvedList as TicketLite[],
      hoverEmpty: 'Nenhum chamado resolvido no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=resolved')),
    },
    {
      id: 'avg_resolution', label: 'Tempo Médio Resolução', category: 'helpdesk',
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      value: `${metrics?.avgResolutionTime || 0}h`,
      previous: previousMetrics ? `${previousMetrics.avgResolutionTime}h` : null,
      change: calcChange(metrics?.avgResolutionTime || 0, previousMetrics?.avgResolutionTime), changeInverse: true,
    },
    {
      id: 'sla', label: 'SLA Cumprido', category: 'helpdesk',
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
      value: `${metrics?.slaCompliance || 0}%`,
      previous: previousMetrics ? `${previousMetrics.slaCompliance}%` : null,
      change: calcChange(metrics?.slaCompliance || 0, previousMetrics?.slaCompliance),
    },
    {
      id: 'sla_violated', label: 'SLA Violados', category: 'helpdesk',
      icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      value: metrics?.slaViolated || 0, previous: previousMetrics?.slaViolated,
      change: calcChange(metrics?.slaViolated || 0, previousMetrics?.slaViolated), changeInverse: true,
    },
    {
      id: 'assets', label: 'Ativos de TI', category: 'ativos',
      icon: <Monitor className="h-4 w-4 text-primary" />,
      value: assetsValueLabel,
      onClick: () => navigate(tenantPath('/inventario')),
    },
    {
      id: 'licenses', label: 'Licenças Expirando (30d)', category: 'licencas',
      icon: <FileKey className="h-4 w-4 text-status-warning" />,
      value: expiringLicenses,
    },
    {
      id: 'contracts', label: 'Contratos Expirando (30d)', category: 'contratos',
      icon: <FileText className="h-4 w-4 text-status-warning" />,
      value: expiringContractsCount,
    },
    {
      id: 'maintenances', label: 'Manutenções Agendadas', category: 'manutencoes',
      icon: <Wrench className="h-4 w-4 text-muted-foreground" />,
      value: scheduledMaintenancesCount,
    },
  ];

  const filteredRows = rows.filter(r => activeCategories.has(r.category));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Category Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>
          {CATEGORIES.map(cat => {
            const active = activeCategories.has(cat.id);
            const Icon = cat.icon;
            return (
              <Button
                key={cat.id}
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn("h-7 text-xs gap-1.5 rounded-full", !active && "opacity-60")}
                onClick={() => toggleCategory(cat.id)}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
              </Button>
            );
          })}
        </div>

        {/* Main Indicators Table */}
        <Card className="">
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <BookOpen className="h-4 w-4" />
              Indicadores do Período
              <Badge variant="secondary" className="ml-2 text-[10px]">{filteredRows.length} métricas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-background sticky top-0 z-10">
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Métrica</th>
                    <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Valor</th>
                    <th className="text-center px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help justify-center">
                            Variação <Info className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Comparação percentual com o período equivalente anterior. Ex: se o filtro é 30 dias, compara com os 30 dias anteriores.</p>
                        </TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help">
                            Anterior <Info className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Valor registrado no período anterior equivalente ao filtro selecionado.</p>
                        </TooltipContent>
                      </Tooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const hasHover = !!row.hoverList;
                    const labelNode = (
                      <div className={cn("flex items-center gap-2", (hasHover || row.onClick) && "cursor-pointer hover:text-primary")}
                           onClick={row.onClick}>
                        {row.icon}
                        <span className="font-medium text-foreground text-sm">{row.label}</span>
                        {hasHover && <Info className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    );
                    return (
                    <tr key={row.id} className={cn(
                      "border-b border-border/50 last:border-0 transition-colors hover:bg-background/60",
                      i % 2 === 0 && "bg-background/30"
                    )}>
                      <td className="px-4 py-2">
                        {hasHover ? (
                          <HoverCard openDelay={150}>
                            <HoverCardTrigger asChild>{labelNode}</HoverCardTrigger>
                            <HoverCardContent side="right" className="w-[360px] p-0">
                              <div className="px-3 py-2 border-b border-border bg-muted/30">
                                <p className="text-xs font-semibold text-foreground">{row.label}</p>
                                <p className="text-[10px] text-muted-foreground">Últimos 10 do período</p>
                              </div>
                              {row.hoverList!.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-3">{row.hoverEmpty}</p>
                              ) : (
                                <div className="max-h-[280px] overflow-y-auto">
                                  {row.hoverList!.map(t => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => navigate(tenantPath(`/ti/chamados/${t.id}`))}
                                      className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/40 last:border-0"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] text-muted-foreground">#{t.ticket_number}</span>
                                        <span className="text-xs text-foreground truncate flex-1">{t.title}</span>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground mt-0.5">
                                        {t.assignee?.full_name || t.assignee?.email || 'Sem responsável'} · {format(new Date(t.created_at), "dd/MM/yy HH:mm")}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </HoverCardContent>
                          </HoverCard>
                        ) : labelNode}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-bold font-mono text-foreground text-sm">{row.value}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex justify-center">
                          <TrendIcon change={row.change ?? null} inverse={row.changeInverse} />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground font-mono text-xs">
                        {row.previous !== undefined && row.previous !== null ? row.previous : '—'}
                      </td>
                    </tr>
                  );})}
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Selecione ao menos uma categoria acima</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Category x Status Table */}
        {metrics?.byCategoryAndStatus && Object.keys(metrics.byCategoryAndStatus).length > 0 && (
          <Card className="">
            <CardHeader className="pb-2 px-5">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
                <TicketCheck className="h-4 w-4" />
                Chamados por Categoria
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {Object.keys(metrics.byCategoryAndStatus).length} categorias
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-background sticky top-0 z-10">
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Categoria</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-primary">Abertos</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-status-warning">Em Andamento</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-amber-600">Aguardando</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-status-success">Resolvidos</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Fechados</th>
                      <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metrics.byCategoryAndStatus)
                      .sort(([, a], [, b]) => {
                        const totalA = Object.values(a).reduce((s, v) => s + v, 0);
                        const totalB = Object.values(b).reduce((s, v) => s + v, 0);
                        return totalB - totalA;
                      })
                      .map(([category, statuses], i) => {
                        const open = (statuses['open'] || 0);
                        const inProgress = (statuses['in_progress'] || 0);
                        const waiting = (statuses['waiting_user'] || 0) + (statuses['waiting_parts'] || 0);
                        const resolved = (statuses['resolved'] || 0);
                        const closed = (statuses['closed'] || 0);
                        const total = Object.values(statuses).reduce((s, v) => s + v, 0);
                        return (
                          <tr key={category} className={cn(
                            "border-b border-border/50 last:border-0 transition-colors hover:bg-background/60",
                            i % 2 === 0 && "bg-background/30"
                          )}>
                            <td className="px-4 py-2 font-medium text-foreground">{category}</td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-primary">{open || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-status-warning">{inProgress || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-amber-600">{waiting || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-status-success">{resolved || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono text-muted-foreground">{closed || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-foreground">{total}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detail Sections */}
        <Card className="">
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" />
              Detalhamento dos Dados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {/* SLA Violated Tickets */}
            <DetailSection
              title="Chamados com SLA Violado"
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              count={violatedTickets?.length || 0}
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Título</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Responsável</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Prazo SLA</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violatedTickets?.map((ticket: any) => (
                      <tr key={ticket.id} className="border-b border-border/50 last:border-0 hover:bg-background/60">
                        <td className="px-3 py-2 font-mono text-muted-foreground">#{ticket.ticket_number}</td>
                        <td className="px-3 py-2 text-foreground max-w-[200px] truncate">{ticket.title}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">{ticket.assigned?.full_name || ticket.assigned?.email || 'Não atribuído'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {ticket.sla_due_at ? format(new Date(ticket.sla_due_at), "dd/MM/yy HH:mm") : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-destructive font-medium">
                            {ticket.sla_due_at ? formatDistanceToNow(new Date(ticket.sla_due_at), { locale: ptBR, addSuffix: false }) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {/* Expiring Licenses */}
            <DetailSection
              title="Licenças Expirando (30 dias)"
              icon={<FileKey className="h-4 w-4 text-status-warning" />}
              count={expiringLicensesList.length}
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Fornecedor</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Expira em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringLicensesList.map(l => (
                      <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-background/60">
                        <td className="px-3 py-2 text-foreground font-medium">{l.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.vendor || '—'}</td>
                        <td className="px-3 py-2 text-status-warning font-medium">
                          {l.expiry_date ? format(new Date(l.expiry_date), "dd/MM/yyyy") : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {/* Expiring Contracts */}
            <DetailSection
              title="Contratos Expirando (30 dias)"
              icon={<FileText className="h-4 w-4 text-status-warning" />}
              count={expiringContractsList.length}
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Vence em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringContractsList.map(c => (
                      <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-background/60">
                        <td className="px-3 py-2 text-foreground font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-status-warning font-medium">
                          {c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {/* Scheduled Maintenances */}
            <DetailSection
              title="Manutenções Agendadas"
              icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
              count={scheduledMaintenancesList.length}
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Título</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Ativo</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Data Agendada</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledMaintenancesList.map(m => (
                      <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-background/60">
                        <td className="px-3 py-2 text-foreground font-medium">{m.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.asset?.name || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.scheduled_date ? format(new Date(m.scheduled_date), "dd/MM/yyyy") : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {(violatedTickets?.length === 0 && expiringLicensesList.length === 0 && expiringContractsList.length === 0 && scheduledMaintenancesList.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum item de atenção no momento.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Technician Performance & Top Requesters */}
        <div className="grid gap-6 lg:grid-cols-2">
          <TechnicianPerformanceChart filter={filter} />
          <TopRequestersCard filter={filter} />
        </div>
      </div>
    </TooltipProvider>
  );
}
