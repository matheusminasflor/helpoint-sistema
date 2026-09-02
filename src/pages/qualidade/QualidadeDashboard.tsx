import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Loader2, MessageSquare, CheckCircle2, Clock, AlertCircle, TrendingUp, TrendingDown,
  Users,
} from 'lucide-react';
import { KPICard } from '@/components/glpi/KPICard';
import type { RankRow } from '@/components/dashboard/RankCard';

import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { periodStart, type Period } from '@/lib/period';
import { SatisfactionBlock } from '@/components/qualidade/SatisfactionBlock';
import { TicketHoverList } from '@/components/qualidade/TicketHoverList';
import { DetailedSACTable } from '@/components/qualidade/DetailedSACTable';


import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, eachDayOfInterval, startOfDay, differenceInDays } from 'date-fns';

import { ptBR } from 'date-fns/locale';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#e2445c', high: '#fdab3d', medium: '#ffcb00', low: '#00c875',
};
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_analysis: 'Em análise',
  awaiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const variation = (curr: number, prev: number) => {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
};


export default function QualidadeDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [activeTab, setActiveTab] = useState('overview');
  const [tickets, setTickets] = useState<any[]>([]);
  const [prevTickets, setPrevTickets] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [productItems, setProductItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const start = periodStart(period);
      const now = new Date();

      // Período atual
      let q = supabase
        .from('sac_tickets')
        .select('*, sac_categories(name), assignee:profiles!sac_tickets_assigned_to_fkey(id, full_name, email)');
      if (start) q = q.gte('created_at', start.toISOString());
      const { data: cur } = await q;
      const curr = cur || [];
      setTickets(curr);

      // Período anterior (mesma duração)
      if (start) {
        const days = differenceInDays(now, start) || 1;
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - days);
        const { data: prev } = await supabase
          .from('sac_tickets')
          .select('id, status, priority, created_at, resolved_at, first_response_at, sla_due_at, satisfaction_resolved, category_id, sac_categories(name)')
          .gte('created_at', prevStart.toISOString())
          .lt('created_at', start.toISOString());
        setPrevTickets(prev || []);
      } else {
        setPrevTickets([]);
      }

      // Comentários e produtos só do período atual
      const ids = curr.map((t: any) => t.id);
      if (ids.length > 0) {
        const [{ data: cm }, { data: pi }] = await Promise.all([
          supabase.from('sac_ticket_comments').select('ticket_id, author_type, created_at').in('ticket_id', ids),
          supabase.from('sac_ticket_products').select('ticket_id, product_name, product_batch').in('ticket_id', ids),
        ]);
        setComments(cm || []);
        setProductItems(pi || []);
      } else {
        setComments([]); setProductItems([]);
      }

      setLoading(false);
    })();
  }, [period]);

  // ============ KPIs Visão Geral ============
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => ['open', 'in_analysis', 'awaiting_customer'].includes(t.status)).length;
    const resolved = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
    const rate = pct(resolved, total);
    const respH = tickets.filter(t => t.first_response_at).map(t => (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const avgResponse = respH.length ? Math.round(respH.reduce((a, b) => a + b, 0) / respH.length) : 0;
    const resH = tickets.filter(t => t.resolved_at).map(t => (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const avgResolve = resH.length ? Math.round(resH.reduce((a, b) => a + b, 0) / resH.length) : 0;
    return { total, open, resolved, rate, avgResponse, avgResolve };
  }, [tickets]);

  // ============ KPIs Análise Detalhada ============
  const detail = useMemo(() => {
    const total = tickets.length;
    const now = Date.now();

    const respH = tickets.filter(t => t.first_response_at).map(t => (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const avgResp = respH.length ? respH.reduce((a, b) => a + b, 0) / respH.length : 0;
    const respUnder24 = pct(respH.filter(h => h <= 24).length, respH.length);

    const resH = tickets.filter(t => t.resolved_at).map(t => (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const avgRes = resH.length ? resH.reduce((a, b) => a + b, 0) / resH.length : 0;

    const slaTotal = tickets.filter(t => t.sla_due_at).length;
    const slaOk = tickets.filter(t => t.sla_due_at && t.resolved_at && new Date(t.resolved_at) <= new Date(t.sla_due_at)).length;
    const slaPct = pct(slaOk, slaTotal);
    const slaBreached = tickets.filter(t => {
      if (!t.sla_due_at) return false;
      // Marco final = resolved_at; chamados fora do relógio não acumulam atraso
      if (t.resolved_at) return new Date(t.resolved_at) > new Date(t.sla_due_at);
      if (['resolved', 'closed', 'cancelled', 'rejected'].includes(t.status)) return false;
      return new Date(t.sla_due_at).getTime() < now;
    }).length;

    const closH = tickets.filter(t => t.resolved_at && t.closed_at).map(t => (new Date(t.closed_at).getTime() - new Date(t.resolved_at).getTime()) / 36e5);
    const avgClose = closH.length ? closH.reduce((a, b) => a + b, 0) / closH.length : 0;

    const ratedSet = tickets.filter(t => t.satisfaction_resolved);
    const solved = ratedSet.filter(t => t.satisfaction_resolved === 'yes').length;
    const partial = ratedSet.filter(t => t.satisfaction_resolved === 'partial').length;
    const notSolved = ratedSet.filter(t => t.satisfaction_resolved === 'no').length;

    // Reaberturas: comentário de cliente após resolved_at
    const reopenedIds = new Set<string>();
    comments.forEach(c => {
      const t = tickets.find(tk => tk.id === c.ticket_id);
      if (t?.resolved_at && c.author_type === 'customer' && new Date(c.created_at) > new Date(t.resolved_at)) {
        reopenedIds.add(c.ticket_id);
      }
    });

    // Auto-atendimento: resolvido sem first_response_at
    const selfServe = tickets.filter(t => ['resolved', 'closed'].includes(t.status) && !t.first_response_at).length;

    return {
      total, avgResp, respUnder24, avgRes, slaPct, slaBreached, avgClose,
      solved, partial, notSolved, ratedTotal: ratedSet.length,
      reopened: reopenedIds.size, selfServe,
    };
  }, [tickets, comments]);

  // ============ Variações vs período anterior ============
  const variations = useMemo(() => {
    const prevTotal = prevTickets.length;
    const prevResolved = prevTickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
    const prevRespH = prevTickets.filter(t => t.first_response_at).map(t => (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const prevAvgResp = prevRespH.length ? prevRespH.reduce((a, b) => a + b, 0) / prevRespH.length : 0;
    const prevResH = prevTickets.filter(t => t.resolved_at).map(t => (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    const prevAvgRes = prevResH.length ? prevResH.reduce((a, b) => a + b, 0) / prevResH.length : 0;
    const prevSlaTotal = prevTickets.filter(t => t.sla_due_at).length;
    const prevSlaOk = prevTickets.filter(t => t.sla_due_at && t.resolved_at && new Date(t.resolved_at) <= new Date(t.sla_due_at)).length;
    const prevSla = pct(prevSlaOk, prevSlaTotal);

    return {
      total: variation(tickets.length, prevTotal),
      resolved: variation(tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length, prevResolved),
      avgResp: variation(Math.round(detail.avgResp), Math.round(prevAvgResp)),
      avgRes: variation(Math.round(detail.avgRes), Math.round(prevAvgRes)),
      sla: variation(detail.slaPct, prevSla),
    };
  }, [tickets, prevTickets, detail]);

  // helper: monta payload de hover a partir do ticket
  const toHover = (t: any) => ({
    id: t.id,
    protocol: `SAC-${String(t.ticket_number).padStart(5, '0')}`,
    customer: t.customer_name,
    status: t.status,
    created_at: t.created_at,
  });

  // ============ Rankings ============
  const rank = (key: (t: any) => string | null | undefined, top = 5): RankRow[] => {
    const map = new Map<string, { count: number; tickets: any[] }>();
    tickets.forEach(t => {
      const v = key(t);
      if (!v) return;
      if (!map.has(v)) map.set(v, { count: 0, tickets: [] });
      const m = map.get(v)!;
      m.count++;
      m.tickets.push(toHover(t));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, top)
      .map(([label, v]) => ({ label, count: v.count, tickets: v.tickets }));
  };

  const topClients = useMemo(() => rank(t => t.customer_name), [tickets]);
  const topCategories = useMemo(() => rank(t => t.sac_categories?.name || null, 10), [tickets]);

  // Produtos (head + itens multi-produto)
  const topProducts = useMemo(() => {
    const map = new Map<string, { count: number; ticketIds: Set<string> }>();
    const add = (name: string, ticket: any) => {
      if (!map.has(name)) map.set(name, { count: 0, ticketIds: new Set() });
      const m = map.get(name)!;
      m.count++;
      if (ticket) m.ticketIds.add(ticket.id);
    };
    tickets.forEach(t => { if (t.product_name) add(t.product_name, t); });
    productItems.forEach(p => {
      if (!p.product_name) return;
      const t = tickets.find(tk => tk.id === p.ticket_id);
      add(p.product_name, t);
    });
    const byId = new Map(tickets.map(t => [t.id, t]));
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([label, v]) => ({
        label,
        count: v.count,
        tickets: Array.from(v.ticketIds).map(id => byId.get(id)).filter(Boolean).map(toHover),
      }));
  }, [tickets, productItems]);

  // Lotes com surto (≥3 em 7 dias)
  const batchAnalysis = useMemo(() => {
    type B = { key: string; product: string; batch: string; count: number; first: Date; last: Date; dates: Date[]; ticketIds: Set<string> };

    const map = new Map<string, B>();
    const push = (product: string, batch: string, when: Date, ticketId: string) => {
      const k = `${product}__${batch}`;
      if (!map.has(k)) map.set(k, { key: k, product, batch, count: 0, first: when, last: when, dates: [], ticketIds: new Set() });
      const b = map.get(k)!;
      b.count++;
      if (when < b.first) b.first = when;
      if (when > b.last) b.last = when;
      b.dates.push(when);
      b.ticketIds.add(ticketId);
    };
    tickets.forEach(t => {
      if (t.product_name && t.product_batch) push(t.product_name, t.product_batch, new Date(t.created_at), t.id);
    });
    productItems.forEach(p => {
      const t = tickets.find(tk => tk.id === p.ticket_id);
      if (t && p.product_name && p.product_batch) push(p.product_name, p.product_batch, new Date(t.created_at), t.id);
    });

    return Array.from(map.values()).map(b => {
      // surto: ≥3 ocorrências numa janela de 7 dias
      const sorted = [...b.dates].sort((x, y) => x.getTime() - y.getTime());
      let surge = false;
      for (let i = 0; i + 2 < sorted.length; i++) {
        if ((sorted[i + 2].getTime() - sorted[i].getTime()) <= 7 * 24 * 3600 * 1000) { surge = true; break; }
      }
      return { ...b, surge };
    }).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [tickets, productItems]);

  // Prioridades com tempo médio
  const priorityData = useMemo(() => {
    const map = new Map<string, { count: number; times: number[] }>();
    tickets.forEach(t => {
      if (!t.priority) return;
      if (!map.has(t.priority)) map.set(t.priority, { count: 0, times: [] });
      const m = map.get(t.priority)!;
      m.count++;
      if (t.resolved_at) m.times.push((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
    });
    return Array.from(map.entries()).map(([k, v]) => ({
      name: PRIORITY_LABEL[k] || k,
      value: v.count,
      avg: v.times.length ? Math.round(v.times.reduce((a, b) => a + b, 0) / v.times.length) : 0,
      color: PRIORITY_COLORS[k] || '#7e8599',
    })).sort((a, b) => b.value - a.value);
  }, [tickets]);

  // Tendência
  const trends = useMemo(() => {
    if (tickets.length === 0) return [];
    const start = periodStart(period) || new Date(Math.min(...tickets.map(t => new Date(t.created_at).getTime())));
    const days = eachDayOfInterval({ start, end: new Date() });
    return days.map(d => {
      const k = startOfDay(d).getTime();
      const opened = tickets.filter(t => startOfDay(new Date(t.created_at)).getTime() === k).length;
      const resolved = tickets.filter(t => t.resolved_at && startOfDay(new Date(t.resolved_at)).getTime() === k).length;
      return { date: d.toISOString(), opened, resolved };
    });
  }, [tickets, period]);

  // Atendentes
  const byAssignee = useMemo(() => {
    const map = new Map<string, { name: string; total: number; resolved: number; firstRespTimes: number[]; resolveTimes: number[]; slaBreached: number; staleOpen: number }>();
    const now = Date.now();
    tickets.forEach(t => {
      if (!t.assigned_to || !t.assignee) return;
      const id = t.assigned_to;
      const name = t.assignee.full_name || t.assignee.email;
      if (!map.has(id)) map.set(id, { name, total: 0, resolved: 0, firstRespTimes: [], resolveTimes: [], slaBreached: 0, staleOpen: 0 });
      const m = map.get(id)!;
      m.total++;
      if (t.first_response_at) m.firstRespTimes.push((new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
      if (['resolved', 'closed'].includes(t.status)) {
        m.resolved++;
        if (t.resolved_at) m.resolveTimes.push((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 36e5);
        if (t.sla_due_at && t.resolved_at && new Date(t.resolved_at) > new Date(t.sla_due_at)) m.slaBreached++;
      } else {
        const ageDays = (now - new Date(t.created_at).getTime()) / (24 * 3600 * 1000);
        if (ageDays > 7) m.staleOpen++;
        if (!['cancelled', 'rejected'].includes(t.status) && t.sla_due_at && new Date(t.sla_due_at).getTime() < now) m.slaBreached++;
      }
    });
    return Array.from(map.values()).map(m => ({
      ...m,
      avgFirst: m.firstRespTimes.length ? Math.round(m.firstRespTimes.reduce((a, b) => a + b, 0) / m.firstRespTimes.length) : 0,
      avgResolve: m.resolveTimes.length ? Math.round(m.resolveTimes.reduce((a, b) => a + b, 0) / m.resolveTimes.length) : 0,
      ratePct: pct(m.resolved, m.total),
    }));
  }, [tickets]);

  const fastest = useMemo(() => [...byAssignee].sort((a, b) => b.resolved - a.resolved).slice(0, 8), [byAssignee]);
  const slowest = useMemo(
    () => [...byAssignee].filter(a => a.resolveTimes.length > 0 || a.staleOpen > 0 || a.slaBreached > 0)
      .sort((a, b) => (b.avgResolve + b.slaBreached * 10) - (a.avgResolve + a.slaBreached * 10)).slice(0, 8),
    [byAssignee],
  );

  // Heatmap (dia da semana × faixa horária)
  const heatmap = useMemo(() => {
    const buckets = [0, 4, 8, 12, 16, 20]; // 6 faixas de 4h
    const bucketLabel = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];
    const dayLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const grid: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
    let max = 0;
    tickets.forEach(t => {
      const d = new Date(t.created_at);
      const wd = d.getDay();
      const h = d.getHours();
      const b = buckets.findIndex((s, i) => h >= s && h < (buckets[i + 1] ?? 24));
      grid[wd][b]++;
      if (grid[wd][b] > max) max = grid[wd][b];
    });
    return { grid, max, bucketLabel, dayLabel };
  }, [tickets]);

  // Funil de status (com tickets para hover)
  const funnel = useMemo(() => {
    const keys = ['open', 'in_analysis', 'awaiting_customer', 'resolved', 'closed'] as const;
    const grouped: Record<string, any[]> = { open: [], in_analysis: [], awaiting_customer: [], resolved: [], closed: [] };
    tickets.forEach(t => { if (t.status && grouped[t.status]) grouped[t.status].push(t); });
    const max = Math.max(...keys.map(k => grouped[k].length), 1);
    return keys.map(k => ({
      key: k,
      label: STATUS_LABEL[k],
      count: grouped[k].length,
      pct: pct(grouped[k].length, max),
      tickets: grouped[k].map(toHover),
    }));
  }, [tickets]);


  // Motivos de não-solução
  const notSolvedList = useMemo(() => {
    return tickets
      .filter(t => t.satisfaction_resolved === 'no' || t.satisfaction_resolved === 'partial')
      .slice(0, 10)
      .map(t => ({
        id: t.id,
        protocol: `SAC-${String(t.ticket_number).padStart(5, '0')}`,
        category: t.sac_categories?.name || '—',
        status: t.satisfaction_resolved === 'no' ? 'Não resolvido' : 'Parcial',
        comment: t.satisfaction_comment || '—',
        rating: t.satisfaction_rating,
      }));
  }, [tickets]);

  // Top produto × categoria
  const productByCategory = useMemo(() => {
    const map = new Map<string, number>();
    tickets.forEach(t => {
      if (t.product_name && t.sac_categories?.name) {
        const k = `${t.product_name} → ${t.sac_categories.name}`;
        map.set(k, (map.get(k) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count }));
  }, [tickets]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DashboardHeader
        title="Indicadores de Qualidade — SAC"
        subtitle="Visão executiva do atendimento ao cliente."
        period={period}
        onPeriodChange={setPeriod}
        actions={
          <>
            <a href="/qualidade/sacs"><Button size="sm" variant="default"><MessageSquare className="w-3 h-3 mr-1" />Ver SACs</Button></a>
            <a href="/qualidade/configuracoes"><Button size="sm" variant="outline">Configurações</Button></a>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="productivity">Produtividade</TabsTrigger>
          <TabsTrigger value="detailed">Análise Detalhada</TabsTrigger>
          <TabsTrigger value="patterns">Padrões (IA)</TabsTrigger>
        </TabsList>

        {loading && (
          <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        )}

        {!loading && (
          <>
            {/* VISÃO GERAL */}
            <TabsContent value="overview" className="space-y-6 mt-4">
              <KPIGrid>
                <KPICard value={kpis.total} label="Total SACs" icon={MessageSquare} color="blue" />
                <KPICard value={kpis.open} label="Em aberto" icon={AlertCircle} color="orange" />
                <KPICard value={kpis.resolved} label="Resolvidos" icon={CheckCircle2} color="green" />
                <KPICard value={`${kpis.rate}%`} label="Taxa resolução" icon={TrendingUp} color="purple" />
                <KPICard value={kpis.avgResponse} label="1ª resposta (h)" icon={Clock} color="yellow" />
                <KPICard value={kpis.avgResolve} label="Resolução (h)" icon={Clock} color="grey" />
              </KPIGrid>

              <SatisfactionBlock startDate={periodStart(period)?.toISOString() ?? null} />

              <Card className="p-5">
                <h3 className="text-base font-semibold mb-1">Evolução de SACs</h3>
                <p className="text-xs text-muted-foreground mb-3">Aberturas e resoluções no período</p>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trends}>
                    <defs>
                      <linearGradient id="sacOpen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e2445c" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#e2445c" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="sacRes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00c875" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#00c875" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd/MM', { locale: ptBR })} stroke="#7e8599" fontSize={11} />
                    <YAxis stroke="#7e8599" fontSize={11} />
                    <Tooltip labelFormatter={(d) => format(new Date(d as string), "dd 'de' MMMM", { locale: ptBR })} contentStyle={{ background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="opened" stroke="#e2445c" fill="url(#sacOpen)" name="Abertos" />
                    <Area type="monotone" dataKey="resolved" stroke="#00c875" fill="url(#sacRes)" name="Resolvidos" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            {/* PRODUTIVIDADE */}
            <TabsContent value="productivity" className="space-y-6 mt-4">
              <Card className="p-5">
                <h3 className="text-base font-semibold mb-1 flex items-center gap-2"><Users className="w-4 h-4" /> Atendentes</h3>
                <p className="text-xs text-muted-foreground mb-3">Volume e tempo médio de resolução</p>
                {byAssignee.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhum SAC com atendente atribuído.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-background/50">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Atendente</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Atribuídos</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Resolvidos</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Tempo médio (h)</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">% Resolução</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fastest.map((a, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-2 font-medium">{a.name}</td>
                            <td className="px-3 py-2 text-right font-mono">{a.total}</td>
                            <td className="px-3 py-2 text-right font-mono text-green-600">{a.resolved}</td>
                            <td className="px-3 py-2 text-right font-mono">{a.avgResolve}h</td>
                            <td className="px-3 py-2 text-right font-mono">{a.ratePct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* ANÁLISE DETALHADA — padrão tabular igual ao TI */}
            <TabsContent value="detailed" className="space-y-6 mt-4">
              <DetailedSACTable
                tickets={tickets}
                detail={detail}
                variations={variations}
                priorityData={priorityData}
                topProducts={topProducts}
                topClients={topClients}
                batchAnalysis={batchAnalysis}
                staff={byAssignee}
                notSolvedList={notSolvedList}
              />
            </TabsContent>


            {/* PADRÕES IA */}
            <TabsContent value="patterns" className="mt-4">
              <Card className="p-8 text-center">
                <h3 className="text-base font-semibold mb-2">Padrões em SACs</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  A detecção automática de padrões no SAC está em preparação.
                  Use os rankings de produtos, lotes e categorias na aba "Análise Detalhada" para identificar surtos manualmente.
                </p>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
