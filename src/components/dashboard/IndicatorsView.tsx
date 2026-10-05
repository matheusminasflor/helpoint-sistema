import { useState } from 'react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TicketMetrics, MetricsFilter, useViolatedSlaTickets, type ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { TechnicianPerformanceChart } from './TechnicianPerformanceChart';
import { TopRequestersCard } from './TopRequestersCard';
import { ListaDeChamadosNoHover } from './ListaDeChamadosNoHover';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  TrendingUp, TrendingDown, Minus, TicketCheck, Clock, Monitor,
  FileKey, AlertTriangle, FileText, Wrench, BookOpen, ShieldCheck,
  ChevronDown, ChevronRight, Info, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface IndicatorRow {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string | number;
  previous?: string | number | null;
  change?: number | null;
  changeInverse?: boolean;
  category: string;
  explicacao: IdDaExplicacao;
  /** Os chamados por trás do número — aparecem ao passar o mouse (dono, 2026-10-04). */
  hoverList?: ChamadoDoPeriodo[];
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

/**
 * As colunas de "Chamados por categoria". Cada uma diz quais status entram — a mesma regra serve
 * para o número e para a lista do hover. Sem "Fechados" desde 2026-10-04: o `closed` antigo já
 * chega aqui como `resolved` (`statusVisivel` em `useTicketMetrics`).
 */
const COLUNAS_DE_STATUS = [
  { id: 'open', rotulo: 'Abertos', status: ['open'], cor: 'text-primary' },
  { id: 'in_progress', rotulo: 'Em Andamento', status: ['in_progress'], cor: 'text-status-warning' },
  { id: 'waiting', rotulo: 'Aguardando', status: ['waiting_user', 'waiting_parts'], cor: 'text-status-warning' },
  { id: 'resolved', rotulo: 'Resolvidos', status: ['resolved'], cor: 'text-status-success' },
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

function DetailSection({ title, icon, count, explicacao, children }: {
  title: string; icon: React.ReactNode; count: number; explicacao: IdDaExplicacao; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex-1 justify-between h-10 px-4 hover:bg-background">
            <div className="flex items-center gap-2">
              {icon}
              <span className="text-sm font-medium text-foreground">{title}</span>
              <Badge variant="secondary" className="text-[10px]">{count}</Badge>
            </div>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>
        <ExplicacaoDoIndicador id={explicacao} className="px-3" />
      </div>
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

  // `filter` aqui: a lista de SLA violado ignorava o módulo, então o painel do
  // RH listava chamado de TI enquanto o cartão ao lado contava só o do RH.
  const { data: violatedTickets } = useViolatedSlaTickets(filter);

  // Os chamados por trás de cada número saem da MESMA consulta dos números (`metrics.chamados`):
  // a lista do hover não pode discordar da contagem (dono, 2026-10-04).
  const chamados = metrics?.chamados ?? [];
  const comStatus = (...status: readonly string[]) => chamados.filter(c => status.includes(c.status));

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
      id: 'opened', label: 'Chamados Abertos', category: 'helpdesk', explicacao: 'chamados.abertos',
      icon: <TicketCheck className="h-4 w-4 text-primary" />,
      value: metrics?.open || 0, previous: previousMetrics?.open,
      change: calcChange(metrics?.open || 0, previousMetrics?.open), changeInverse: true,
      hoverList: comStatus('open'),
      hoverEmpty: 'Nenhum chamado aberto no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=open')),
    },
    {
      id: 'in_progress', label: 'Em Andamento', category: 'helpdesk', explicacao: 'chamados.em_andamento',
      icon: <Clock className="h-4 w-4 text-status-warning" />,
      value: metrics?.inProgress || 0, previous: previousMetrics?.inProgress,
      change: calcChange(metrics?.inProgress || 0, previousMetrics?.inProgress), changeInverse: true,
      hoverList: comStatus('in_progress'),
      hoverEmpty: 'Nenhum chamado em andamento no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=in_progress')),
    },
    {
      id: 'resolved', label: 'Resolvidos', category: 'helpdesk', explicacao: 'chamados.resolvidos',
      icon: <ShieldCheck className="h-4 w-4 text-status-success" />,
      value: metrics?.resolved || 0, previous: previousMetrics?.resolved,
      change: calcChange(metrics?.resolved || 0, previousMetrics?.resolved),
      hoverList: comStatus('resolved'),
      hoverEmpty: 'Nenhum chamado resolvido no período.',
      onClick: () => navigate(tenantPath('/ti/chamados?status=resolved')),
    },
    {
      id: 'avg_resolution', label: 'Tempo Médio Resolução', category: 'helpdesk', explicacao: 'chamados.tempo_medio_resolucao',
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      value: `${metrics?.avgResolutionTime || 0}h`,
      previous: previousMetrics ? `${previousMetrics.avgResolutionTime}h` : null,
      change: calcChange(metrics?.avgResolutionTime || 0, previousMetrics?.avgResolutionTime), changeInverse: true,
    },
    {
      id: 'sla', label: 'SLA Cumprido', category: 'helpdesk', explicacao: 'chamados.sla_cumprido',
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
      value: `${metrics?.slaCompliance || 0}%`,
      previous: previousMetrics ? `${previousMetrics.slaCompliance}%` : null,
      change: calcChange(metrics?.slaCompliance || 0, previousMetrics?.slaCompliance),
    },
    {
      id: 'sla_violated', label: 'SLA Violados', category: 'helpdesk', explicacao: 'chamados.sla_violados',
      icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      value: metrics?.slaViolated || 0, previous: previousMetrics?.slaViolated,
      change: calcChange(metrics?.slaViolated || 0, previousMetrics?.slaViolated), changeInverse: true,
      hoverList: chamados.filter(c => c.sla_estourado),
      hoverEmpty: 'Nenhum chamado do período com o prazo vencido.',
    },
    {
      id: 'assets', label: 'Ativos de TI', category: 'ativos', explicacao: 'ti.ativos',
      icon: <Monitor className="h-4 w-4 text-primary" />,
      value: assetsValueLabel,
      onClick: () => navigate(tenantPath('/inventario')),
    },
    {
      id: 'licenses', label: 'Licenças Expirando (30d)', category: 'licencas', explicacao: 'ti.licencas_30d',
      icon: <FileKey className="h-4 w-4 text-status-warning" />,
      value: expiringLicenses,
    },
    {
      id: 'contracts', label: 'Contratos Expirando (30d)', category: 'contratos', explicacao: 'ti.contratos_30d',
      icon: <FileText className="h-4 w-4 text-status-warning" />,
      value: expiringContractsCount,
    },
    {
      id: 'maintenances', label: 'Manutenções Agendadas', category: 'manutencoes', explicacao: 'ti.manutencoes',
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
              <ExplicacaoDoIndicador id="chamados.indicadores_do_periodo" />
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
                        {hasHover && <TicketCheck className="h-3 w-3 text-muted-foreground" aria-label="passe o mouse para ver os chamados" />}
                      </div>
                    );
                    return (
                    <tr key={row.id} className={cn(
                      "border-b border-border/50 last:border-0 transition-colors hover:bg-background/60",
                      i % 2 === 0 && "bg-background/30"
                    )}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {hasHover ? (
                            <ListaDeChamadosNoHover
                              titulo={row.label}
                              chamados={row.hoverList!}
                              modulo={filter.module}
                              vazio={row.hoverEmpty}
                            >
                              {labelNode}
                            </ListaDeChamadosNoHover>
                          ) : labelNode}
                          <ExplicacaoDoIndicador id={row.explicacao} />
                        </div>
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
          <TabelaCategoriaPorStatus chamados={chamados} modulo={filter.module} />
        )}

        {/* O que pede atenção agora — era "Detalhamento dos Dados", título que não dizia o que havia
            dentro (o dono, 2026-10-04, não entendia a seção). */}
        <Card className="">
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" />
              O que pede atenção agora
              <ExplicacaoDoIndicador id="chamados.o_que_pede_atencao" />
            </CardTitle>
            <p className="text-xs text-muted-foreground normal-case">
              Chamados com prazo vencido, licenças e contratos vencendo em 30 dias e manutenções marcadas — situação de hoje, não do período.
            </p>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {/* SLA Violated Tickets */}
            <DetailSection
              title="Chamados com SLA Violado"
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              count={violatedTickets?.length || 0}
              explicacao="chamados.sla_violado_lista"
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
              explicacao="ti.licencas_30d"
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
              explicacao="ti.contratos_30d"
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
              explicacao="ti.manutencoes"
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
                Nada pedindo atenção agora.
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

/**
 * "Chamados por categoria": cada número mostra, ao passar o mouse, os chamados dele (dono,
 * 2026-10-04). Exportada para os outros setores (Marketing, RH, Comercial, Educacional, Expedição,
 * Produção) usarem a mesma tabela na Análise detalhada.
 */
export function TabelaCategoriaPorStatus({ chamados, modulo }: { chamados: ChamadoDoPeriodo[]; modulo?: string }) {
  const porCategoria = new Map<string, ChamadoDoPeriodo[]>();
  for (const c of chamados) {
    const lista = porCategoria.get(c.category) ?? [];
    lista.push(c);
    porCategoria.set(c.category, lista);
  }
  const linhas = [...porCategoria.entries()].sort(([, a], [, b]) => b.length - a.length);
  if (linhas.length === 0) return null;

  return (
    <Card className="">
      <CardHeader className="pb-2 px-5">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
          <TicketCheck className="h-4 w-4" />
          Chamados por Categoria
          <ExplicacaoDoIndicador id="chamados.categoria_x_status" />
          <Badge variant="secondary" className="ml-2 text-[10px]">{linhas.length} categorias</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-background sticky top-0 z-10">
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Categoria</th>
                {COLUNAS_DE_STATUS.map(col => (
                  <th key={col.id} className={cn('text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider', col.cor)}>{col.rotulo}</th>
                ))}
                <th className="text-center px-4 py-2 font-semibold text-xs uppercase tracking-wider text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([categoria, doCat], i) => (
                <tr key={categoria} className={cn(
                  'border-b border-border/50 last:border-0 transition-colors hover:bg-background/60',
                  i % 2 === 0 && 'bg-background/30',
                )}>
                  <td className="px-4 py-2 font-medium text-foreground">{categoria}</td>
                  {COLUNAS_DE_STATUS.map(col => {
                    const lista = doCat.filter(c => (col.status as readonly string[]).includes(c.status));
                    return (
                      <td key={col.id} className={cn('px-4 py-2 text-center font-mono font-bold', col.cor)}>
                        {lista.length === 0 ? '—' : (
                          <ListaDeChamadosNoHover titulo={`${categoria} · ${col.rotulo}`} chamados={lista} modulo={modulo}>
                            <span className="cursor-pointer underline decoration-dotted underline-offset-4">{lista.length}</span>
                          </ListaDeChamadosNoHover>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-center font-mono font-bold text-foreground">
                    <ListaDeChamadosNoHover titulo={`${categoria} · todos`} chamados={doCat} modulo={modulo}>
                      <span className="cursor-pointer underline decoration-dotted underline-offset-4">{doCat.length}</span>
                    </ListaDeChamadosNoHover>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
