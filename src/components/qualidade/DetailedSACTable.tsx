import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  TrendingUp, TrendingDown, Minus, Clock, ShieldCheck, AlertTriangle,
  MessageSquare, Users, Package, Flame, ThumbsDown, ChevronDown, ChevronRight,
  Star, RotateCcw, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketHoverList } from './TicketHoverList';

const CATEGORIES = [
  { id: 'atendimento', label: 'Atendimento', icon: MessageSquare },
  { id: 'prazos', label: 'Prazos', icon: Clock },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'equipe', label: 'Equipe', icon: ShieldCheck },
] as const;

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto', in_analysis: 'Em análise', awaiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido', closed: 'Encerrado',
};

const fmtH = (h: number) => (!h ? '—' : h >= 24 ? `${(h / 24).toFixed(1)}d` : `${Math.round(h)}h`);
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

function Trend({ change, inverse }: { change: number | null | undefined; inverse?: boolean }) {
  if (change === null || change === undefined) return <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />;
  if (Math.abs(change) <= 1) return <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />;
  const isGood = inverse ? change < 0 : change > 0;
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold',
      isGood ? 'text-status-success' : 'text-destructive')}>
      <Icon className="h-3.5 w-3.5" />
      {change > 0 ? '+' : ''}{change}%
    </span>
  );
}

interface Row {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string | number;
  change?: number | null;
  changeInverse?: boolean;
  category: string;
}

interface Props {
  tickets: any[];
  detail: any;
  variations: any;
  priorityData: { name: string; value: number; avg: number; color: string }[];
  topProducts: { label: string; count: number; tickets?: any[] }[];
  topClients: { label: string; count: number; tickets?: any[] }[];

  batchAnalysis: any[];
  staff: any[];
  notSolvedList: any[];
}

export function DetailedSACTable({
  tickets, detail, variations, priorityData,
  topProducts, topClients, batchAnalysis, staff, notSolvedList,
}: Props) {
  const [active, setActive] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sac-detailed-categories');
    return saved ? new Set(JSON.parse(saved)) : new Set(CATEGORIES.map(c => c.id));
  });
  const [openCollapse, setOpenCollapse] = useState(false);

  const toggle = (id: string) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else next.add(id);
      localStorage.setItem('sac-detailed-categories', JSON.stringify([...next]));
      return next;
    });
  };

  const total = detail.total;
  const reopenRate = total > 0 ? Math.round((detail.reopened / total) * 100) : 0;
  const selfRate = total > 0 ? Math.round((detail.selfServe / total) * 100) : 0;
  const solvedRate = detail.ratedTotal > 0 ? Math.round((detail.solved / detail.ratedTotal) * 100) : 0;

  const rows: Row[] = [
    { id: 'total', label: 'Total de SACs', category: 'atendimento',
      icon: <MessageSquare className="h-4 w-4 text-primary" />,
      value: total, change: variations.total },
    { id: 'open', label: 'Em aberto', category: 'atendimento',
      icon: <AlertTriangle className="h-4 w-4 text-status-warning" />,
      value: tickets.filter(t => ['open','in_analysis','awaiting_customer'].includes(t.status)).length },
    { id: 'resolved', label: 'Resolvidos', category: 'atendimento',
      icon: <ShieldCheck className="h-4 w-4 text-status-success" />,
      value: tickets.filter(t => ['resolved','closed'].includes(t.status)).length, change: variations.resolved },
    { id: 'closed', label: 'Encerrados', category: 'atendimento',
      icon: <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
      value: tickets.filter(t => t.status === 'closed').length },
    { id: 'resp', label: '1ª resposta média', category: 'prazos',
      icon: <Clock className="h-4 w-4 text-primary" />,
      value: fmtH(detail.avgResp), change: variations.avgResp, changeInverse: true },
    { id: 'resp24', label: '% atendido em 24h', category: 'prazos',
      icon: <Clock className="h-4 w-4 text-muted-foreground" />, value: `${detail.respUnder24}%` },
    { id: 'res', label: 'Resolução média', category: 'prazos',
      icon: <Clock className="h-4 w-4 text-primary" />,
      value: fmtH(detail.avgRes), change: variations.avgRes, changeInverse: true },
    { id: 'sla', label: 'SLA cumprido', category: 'prazos',
      icon: <ShieldCheck className="h-4 w-4 text-status-success" />,
      value: `${detail.slaPct}%`, change: variations.sla },
    { id: 'sla_br', label: 'SLA estourado', category: 'prazos',
      icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      value: detail.slaBreached, changeInverse: true },
    { id: 'close', label: 'Tempo de encerramento', category: 'prazos',
      icon: <Clock className="h-4 w-4 text-muted-foreground" />, value: fmtH(detail.avgClose) },
    { id: 'reopen', label: 'Reaberturas', category: 'atendimento',
      icon: <RotateCcw className="h-4 w-4 text-status-warning" />,
      value: `${detail.reopened} (${reopenRate}%)`, changeInverse: true },
    { id: 'self', label: 'Auto-atendimento', category: 'atendimento',
      icon: <Sparkles className="h-4 w-4 text-muted-foreground" />,
      value: `${detail.selfServe} (${selfRate}%)` },
    { id: 'solved', label: 'Taxa de solução', category: 'atendimento',
      icon: <ShieldCheck className="h-4 w-4 text-status-success" />,
      value: `${solvedRate}% (${detail.solved}/${detail.ratedTotal})` },
    { id: 'partial', label: 'Solução parcial', category: 'atendimento',
      icon: <ThumbsDown className="h-4 w-4 text-status-warning" />, value: detail.partial },
    { id: 'no', label: 'Sem solução', category: 'atendimento',
      icon: <ThumbsDown className="h-4 w-4 text-destructive" />, value: detail.notSolved, changeInverse: true },
  ];

  const filtered = rows.filter(r => active.has(r.category));

  // Categoria × Status
  const byCatStatus: Record<string, Record<string, number>> = {};
  tickets.forEach(t => {
    const cat = t.sac_categories?.name || 'Sem categoria';
    if (!byCatStatus[cat]) byCatStatus[cat] = {};
    byCatStatus[cat][t.status] = (byCatStatus[cat][t.status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>
        {CATEGORIES.map(cat => {
          const a = active.has(cat.id);
          const Icon = cat.icon;
          return (
            <Button key={cat.id} variant={a ? 'default' : 'outline'} size="sm"
              className={cn('h-7 text-xs gap-1.5 rounded-full', !a && 'opacity-60')}
              onClick={() => toggle(cat.id)}>
              <Icon className="h-3 w-3" />{cat.label}
            </Button>
          );
        })}
      </div>

      {/* Indicadores do período */}
      <Card>
        <CardHeader className="pb-2 px-5">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
            <MessageSquare className="h-4 w-4" /> Indicadores do Período
            <Badge variant="secondary" className="ml-2 text-[10px]">{filtered.length} métricas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Métrica</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Valor</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Variação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={cn(
                    'border-b border-border/50 last:border-0 hover:bg-background/60',
                    i % 2 === 0 && 'bg-background/30',
                  )}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {r.icon}
                        <span className="font-medium text-foreground text-sm">{r.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-bold font-mono text-foreground text-sm">{r.value}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Trend change={r.change} inverse={r.changeInverse} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Prioridades */}
      {priorityData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" /> Por Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prioridade</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qtde</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">%</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolução média</th>
                </tr>
              </thead>
              <tbody>
                {priorityData.map((p, i) => (
                  <tr key={i} className={cn(
                    'border-b border-border/50 last:border-0',
                    i % 2 === 0 && 'bg-background/30',
                  )}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{p.value}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{pct(p.value, total)}%</td>
                    <td className="px-4 py-2 text-right font-mono">{p.avg ? `${p.avg}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* SACs por categoria × status */}
      {Object.keys(byCatStatus).length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <MessageSquare className="h-4 w-4" /> SACs por Categoria
              <Badge variant="secondary" className="ml-2 text-[10px]">{Object.keys(byCatStatus).length} categorias</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-background">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoria</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-primary uppercase tracking-wider">Aberto</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-status-warning uppercase tracking-wider">Em análise</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-amber-600 uppercase tracking-wider">Aguard. cliente</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-status-success uppercase tracking-wider">Resolvido</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Encerrado</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-foreground uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byCatStatus)
                    .sort(([, a], [, b]) => Object.values(b).reduce((s, v) => s + v, 0) - Object.values(a).reduce((s, v) => s + v, 0))
                    .map(([cat, st], i) => {
                      const tot = Object.values(st).reduce((s, v) => s + v, 0);
                      return (
                        <tr key={cat} className={cn(
                          'border-b border-border/50 last:border-0 hover:bg-background/60',
                          i % 2 === 0 && 'bg-background/30',
                        )}>
                          <td className="px-4 py-2 font-medium">{cat}</td>
                          <td className="px-4 py-2 text-center font-mono font-bold text-primary">{st.open || '—'}</td>
                          <td className="px-4 py-2 text-center font-mono font-bold text-status-warning">{st.in_analysis || '—'}</td>
                          <td className="px-4 py-2 text-center font-mono font-bold text-amber-600">{st.awaiting_customer || '—'}</td>
                          <td className="px-4 py-2 text-center font-mono font-bold text-status-success">{st.resolved || '—'}</td>
                          <td className="px-4 py-2 text-center font-mono text-muted-foreground">{st.closed || '—'}</td>
                          <td className="px-4 py-2 text-center font-mono font-bold">{tot}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Produtos mais reclamados */}
      {active.has('produtos') && topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Package className="h-4 w-4" /> Produtos mais reclamados
              <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">passe o mouse para ver os SACs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-border/50 bg-background text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Produto</span>
              <span className="text-right">SACs</span>
              <span className="text-right">% do total</span>
            </div>
            {topProducts.map((p, i) => (
              <TicketHoverList key={i} tickets={p.tickets || []} title={`SACs · ${p.label}`}>
                <div className={cn(
                  'grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-border/50 last:border-0 text-sm hover:bg-background/60',
                  i % 2 === 0 && 'bg-background/30',
                )}>
                  <span className="font-medium truncate">{p.label}</span>
                  <span className="text-right font-mono font-bold">{p.count}</span>
                  <span className="text-right font-mono text-muted-foreground">{pct(p.count, total)}%</span>
                </div>
              </TicketHoverList>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lotes */}
      {active.has('produtos') && batchAnalysis.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Flame className="h-4 w-4 text-orange-500" /> Lotes problemáticos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1.4fr_1fr_70px_80px_80px_80px] px-4 py-2 border-b border-border/50 bg-background text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Produto</span>
              <span>Lote</span>
              <span className="text-right">SACs</span>
              <span className="text-right">1ª oco.</span>
              <span className="text-right">Última</span>
              <span className="text-center">Surto</span>
            </div>
            {batchAnalysis.map((b, i) => {
              const hoverTickets = Array.from(b.ticketIds as Set<string>)
                .map(id => tickets.find(t => t.id === id))
                .filter(Boolean)
                .map(t => ({ id: t.id, protocol: `SAC-${String(t.ticket_number).padStart(5, '0')}`, customer: t.customer_name, status: t.status }));
              return (
                <TicketHoverList key={i} tickets={hoverTickets} title={`Lote ${b.batch} · ${b.product}`}>
                  <div className={cn(
                    'grid grid-cols-[1.4fr_1fr_70px_80px_80px_80px] px-4 py-2 border-b border-border/50 last:border-0 text-sm hover:bg-background/60 items-center',
                    i % 2 === 0 && 'bg-background/30',
                  )}>
                    <span className="font-medium truncate">{b.product}</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">{b.batch}</span>
                    <span className="text-right font-mono font-bold">{b.count}</span>
                    <span className="text-right font-mono text-xs">{format(b.first, 'dd/MM', { locale: ptBR })}</span>
                    <span className="text-right font-mono text-xs">{format(b.last, 'dd/MM', { locale: ptBR })}</span>
                    <span className="text-center">
                      {b.surge ? <Badge variant="destructive" className="text-[10px] gap-0.5"><Flame className="w-3 h-3" />surto</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </span>
                  </div>
                </TicketHoverList>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Clientes */}
      {active.has('clientes') && topClients.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Users className="h-4 w-4" /> Clientes que mais abriram SAC
              <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">passe o mouse para ver os SACs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-border/50 bg-background text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Cliente</span>
              <span className="text-right">SACs</span>
              <span className="text-right">% do total</span>
            </div>
            {topClients.map((c, i) => (
              <TicketHoverList key={i} tickets={c.tickets || []} title={`SACs · ${c.label}`}>
                <div className={cn(
                  'grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-border/50 last:border-0 text-sm hover:bg-background/60',
                  i % 2 === 0 && 'bg-background/30',
                )}>
                  <span className="font-medium truncate">{c.label}</span>
                  <span className="text-right font-mono font-bold">{c.count}</span>
                  <span className="text-right font-mono text-muted-foreground">{pct(c.count, total)}%</span>
                </div>
              </TicketHoverList>
            ))}
          </CardContent>
        </Card>
      )}


      {/* Equipe */}
      {active.has('equipe') && staff.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4" /> Performance da equipe
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-background">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atendente</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atribuídos</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolvidos</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Resol.</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">1ª resp</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolução</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-destructive uppercase tracking-wider">SLA estourado</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-amber-600 uppercase tracking-wider">Parados +7d</th>
                  </tr>
                </thead>
                <tbody>
                  {[...staff].sort((a, b) => b.resolved - a.resolved).map((s, i) => (
                    <tr key={i} className={cn(
                      'border-b border-border/50 last:border-0 hover:bg-background/60',
                      i % 2 === 0 && 'bg-background/30',
                      s.slaBreached > 0 && 'bg-destructive/5',
                    )}>
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{s.total}</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-status-success">{s.resolved}</td>
                      <td className="px-4 py-2 text-right font-mono">{s.ratePct}%</td>
                      <td className="px-4 py-2 text-right font-mono">{s.avgFirst ? `${s.avgFirst}h` : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{s.avgResolve ? `${s.avgResolve}h` : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-destructive">{s.slaBreached || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-amber-600">{s.staleOpen || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Não-solução */}
      {notSolvedList.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <ThumbsDown className="h-4 w-4 text-destructive" /> Motivos de não-solução
              <Badge variant="secondary" className="ml-2 text-[10px]">{notSolvedList.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Collapsible open={openCollapse} onOpenChange={setOpenCollapse}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-10 px-4 hover:bg-background">
                  <span className="text-sm font-medium">Ver SACs sem solução completa</span>
                  {openCollapse ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-background">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Protocolo</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoria</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comentário</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notSolvedList.map((n, i) => (
                      <tr key={n.id} className={cn(
                        'border-b border-border/50 last:border-0',
                        i % 2 === 0 && 'bg-background/30',
                      )}>
                        <td className="px-4 py-2 font-mono text-xs">{n.protocol}</td>
                        <td className="px-4 py-2">{n.category}</td>
                        <td className="px-4 py-2">
                          <Badge variant={n.status === 'Não resolvido' ? 'destructive' : 'secondary'} className="text-[10px]">{n.status}</Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-md truncate">{n.comment}</td>
                        <td className="px-4 py-2 text-right">
                          {n.rating ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-500 text-xs">
                              <Star className="h-3 w-3 fill-current" /> {n.rating}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
