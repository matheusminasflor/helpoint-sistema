import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, Minus, Clock, ShieldCheck, AlertTriangle,
  MessageSquare, Users, Banknote, CalendarOff, Fuel, Bus, UtensilsCrossed,
  Cake, Award, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInYears } from 'date-fns';
import { useRHEmployees, useRHPayroll, useRHAbsences, useRHFuel, useRHTransport, useRHMeal } from '@/hooks/useRH';
import { currentMonth, fmtBRL } from '@/components/rh/shared';
import { estaAtivo, estaNaEmpresa } from '@/lib/rh-status';
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { ListaDeChamadosNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';
import { TabelaCategoriaPorStatus } from '@/components/dashboard/IndicatorsView';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';

const CATEGORIES = [
  { id: 'atendimento', label: 'Atendimento', icon: MessageSquare },
  { id: 'prazos', label: 'Prazos', icon: Clock },
  { id: 'pessoas', label: 'Pessoas', icon: Users },
  { id: 'folha', label: 'Folha', icon: Banknote },
  { id: 'beneficios', label: 'Benefícios', icon: Bus },
] as const;

const fmtH = (h: number) => (!h ? '—' : h >= 24 ? `${(h / 24).toFixed(1)}d` : `${Math.round(h)}h`);
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

function Trend({ change, inverse }: { change?: number | null; inverse?: boolean }) {
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
  id: string; label: string; icon: React.ReactNode;
  value: string | number; change?: number | null; changeInverse?: boolean; category: string;
  explicacao: IdDaExplicacao;
  /** Os chamados por trás do número, ao passar o mouse (dono, 2026-10-04). */
  chamados?: ChamadoDoPeriodo[];
}

/** O que ainda não terminou. Era `['open','in_progress','pending']` — `pending` não é status de chamado. */
const TERMINADOS = ['resolved', 'cancelled', 'rejected'];

interface Props {
  /** Os chamados do período, da mesma consulta dos números (`TicketMetrics.chamados`). */
  tickets: ChamadoDoPeriodo[];
  metrics: any;
  variations: any;
  priorityData: { name: string; value: number; color: string }[];
}

export function DetailedRHTable({ tickets, metrics, variations, priorityData }: Props) {
  const month = currentMonth();
  const { employees } = useRHEmployees();
  const { entries: payroll } = useRHPayroll(month);
  const { absences } = useRHAbsences(month);
  const { rows: fuel } = useRHFuel(month);
  const { rows: vt } = useRHTransport(month);
  const { rows: va } = useRHMeal(month);

  const [active, setActive] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('rh-detailed-categories');
    return saved ? new Set(JSON.parse(saved)) : new Set(CATEGORIES.map(c => c.id));
  });

  const toggle = (id: string) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size <= 1) return prev; next.delete(id); }
      else next.add(id);
      localStorage.setItem('rh-detailed-categories', JSON.stringify([...next]));
      return next;
    });
  };

  const today = new Date();
  const currMonth = today.getMonth();
  // Era `e.status === 'active'` — a palavra em inglês, que nada grava. O banco
  // grava `ativo`, então o cartão "Ativos" mostrava ZERO com a empresa inteira
  // trabalhando. Ver `@/lib/rh-status`.
  const activeEmployees = employees.filter((e: any) => estaAtivo(e.status));
  const admissionsInMonth = employees.filter((e: any) =>
    e.admission_date && new Date(e.admission_date).getMonth() === currMonth
    && new Date(e.admission_date).getFullYear() === today.getFullYear());
  const terminationsInMonth = employees.filter((e: any) =>
    e.termination_date && new Date(e.termination_date).getMonth() === currMonth
    && new Date(e.termination_date).getFullYear() === today.getFullYear());
  // `estaNaEmpresa` nas duas: desligado entrava em "Aniversariantes do mês" e em
  // "Tempo de casa". Quem saiu não faz aniversário na empresa nem completa ano
  // de casa — e a lista com ele parece maior do que o quadro real.
  const birthdays = employees.filter((e: any) =>
    estaNaEmpresa(e.status) && e.birth_date && new Date(e.birth_date).getMonth() === currMonth);
  const tenureMilestones = employees.filter((e: any) => {
    if (!estaNaEmpresa(e.status) || !e.admission_date) return false;
    const admMonth = new Date(e.admission_date).getMonth();
    return admMonth === currMonth && differenceInYears(today, new Date(e.admission_date)) >= 1;
  });

  const sum = (arr: any[], k: string) => arr.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
  const payTotals = {
    gross: sum(payroll, 'gross_salary'),
    net: sum(payroll, 'net_salary'),
    inss: sum(payroll, 'inss'),
    irpf: sum(payroll, 'irpf'),
    va: sum(payroll, 'meal_voucher'),
    vt: sum(payroll, 'transport_voucher'),
  };

  const absDays = absences.length;
  // Era `a.type === 'certificate' | 'medical'` (e `'late' | 'delay'`): a coluna é `kind`,
  // com os valores de `RHFaltas.tsx`. Atestados e atrasos mostravam zero sempre.
  const certs = absences.filter((a: any) => a.kind === 'atestado').length;
  const lates = absences.filter((a: any) => a.kind === 'atraso').length;

  const fuelTotal = sum(fuel, 'total_amount') || sum(fuel, 'amount');
  const vtTotal = sum(vt, 'total_amount') || sum(vt, 'amount');
  const vaTotal = sum(va, 'total_amount') || sum(va, 'amount');

  const total = metrics?.total ?? 0;
  // "Encerrados" saiu (dono, 2026-10-04: não existe mais "Fechado"); o `closed` antigo já chega
  // aqui como `resolved` (`statusVisivel` em `useTicketMetrics`).
  const emAberto = tickets.filter(t => !TERMINADOS.includes(t.status));
  const resolvidos = tickets.filter(t => t.status === 'resolved');

  const rows: Row[] = [
    // Atendimento
    { id: 'total', label: 'Total de chamados', category: 'atendimento', explicacao: 'chamados.total', icon: <MessageSquare className="h-4 w-4 text-primary" />, value: total, change: variations?.total, chamados: tickets },
    { id: 'open', label: 'Em aberto', category: 'atendimento', explicacao: 'chamados.em_aberto', icon: <AlertTriangle className="h-4 w-4 text-status-warning" />, value: emAberto.length, chamados: emAberto },
    { id: 'resolved', label: 'Resolvidos', category: 'atendimento', explicacao: 'chamados.resolvidos', icon: <ShieldCheck className="h-4 w-4 text-status-success" />, value: resolvidos.length, change: variations?.resolved, chamados: resolvidos },
    // Prazos
    { id: 'resp', label: '1ª resposta média', category: 'prazos', explicacao: 'chamados.primeira_resposta', icon: <Clock className="h-4 w-4 text-primary" />, value: fmtH(metrics?.avgFirstResponseTime || 0), changeInverse: true },
    { id: 'res', label: 'Resolução média', category: 'prazos', explicacao: 'chamados.tempo_medio_resolucao', icon: <Clock className="h-4 w-4 text-primary" />, value: `${metrics?.avgResolutionTime ?? 0}h`, change: variations?.avgResolutionTime, changeInverse: true },
    { id: 'sla', label: 'SLA cumprido', category: 'prazos', explicacao: 'chamados.sla_cumprido', icon: <ShieldCheck className="h-4 w-4 text-status-success" />, value: `${metrics?.slaCompliance ?? 0}%`, change: variations?.slaCompliance },
    { id: 'sla_br', label: 'SLA estourado', category: 'prazos', explicacao: 'chamados.sla_violados', icon: <AlertTriangle className="h-4 w-4 text-destructive" />, value: metrics?.slaViolated ?? 0, changeInverse: true, chamados: tickets.filter(t => t.sla_estourado) },
    // Pessoas
    { id: 'hc', label: 'Headcount ativo', category: 'pessoas', explicacao: 'rh.headcount', icon: <Users className="h-4 w-4 text-primary" />, value: activeEmployees.length },
    { id: 'adm', label: 'Admissões no mês', category: 'pessoas', explicacao: 'rh.admissoes', icon: <TrendingUp className="h-4 w-4 text-status-success" />, value: admissionsInMonth.length },
    { id: 'des', label: 'Desligamentos no mês', category: 'pessoas', explicacao: 'rh.desligamentos', icon: <TrendingDown className="h-4 w-4 text-destructive" />, value: terminationsInMonth.length, changeInverse: true },
    { id: 'bday', label: 'Aniversariantes do mês', category: 'pessoas', explicacao: 'rh.aniversariantes', icon: <Cake className="h-4 w-4 text-status-danger" />, value: birthdays.length },
    { id: 'tenure', label: 'Aniversários de empresa', category: 'pessoas', explicacao: 'rh.tempo_de_casa', icon: <Award className="h-4 w-4 text-status-warning" />, value: tenureMilestones.length },
    { id: 'abs', label: 'Faltas no mês', category: 'pessoas', explicacao: 'rh.faltas', icon: <CalendarOff className="h-4 w-4 text-status-warning" />, value: absDays, changeInverse: true },
    { id: 'cert', label: 'Atestados no mês', category: 'pessoas', explicacao: 'rh.atestados', icon: <CalendarOff className="h-4 w-4 text-muted-foreground" />, value: certs },
    { id: 'late', label: 'Atrasos no mês', category: 'pessoas', explicacao: 'rh.atrasos', icon: <Clock className="h-4 w-4 text-muted-foreground" />, value: lates },
    // Folha
    { id: 'gross', label: 'Folha bruta', category: 'folha', explicacao: 'rh.folha_bruta', icon: <Banknote className="h-4 w-4 text-primary" />, value: fmtBRL(payTotals.gross) },
    { id: 'net', label: 'Folha líquida', category: 'folha', explicacao: 'rh.folha_liquida', icon: <Banknote className="h-4 w-4 text-status-success" />, value: fmtBRL(payTotals.net) },
    { id: 'inss', label: 'INSS recolhido', category: 'folha', explicacao: 'rh.inss', icon: <Banknote className="h-4 w-4 text-muted-foreground" />, value: fmtBRL(payTotals.inss) },
    { id: 'irpf', label: 'IRPF retido', category: 'folha', explicacao: 'rh.irpf', icon: <Banknote className="h-4 w-4 text-muted-foreground" />, value: fmtBRL(payTotals.irpf) },
    // Benefícios
    { id: 'va_pay', label: 'VA pago', category: 'beneficios', explicacao: 'rh.va', icon: <UtensilsCrossed className="h-4 w-4 text-primary" />, value: fmtBRL(payTotals.va || vaTotal) },
    { id: 'vt_pay', label: 'VT pago', category: 'beneficios', explicacao: 'rh.vt', icon: <Bus className="h-4 w-4 text-primary" />, value: fmtBRL(payTotals.vt || vtTotal) },
    { id: 'fuel', label: 'Combustível reembolsado', category: 'beneficios', explicacao: 'rh.combustivel', icon: <Fuel className="h-4 w-4 text-primary" />, value: fmtBRL(fuelTotal) },
  ];

  const filtered = rows.filter(r => active.has(r.category));

  // Folha por empresa
  const byCompany: Record<string, { code: string; name: string; count: number; gross: number; net: number; inss: number; irpf: number }> = {};
  payroll.forEach((p: any) => {
    const key = p.company?.code || '—';
    if (!byCompany[key]) byCompany[key] = { code: key, name: p.company?.name || '—', count: 0, gross: 0, net: 0, inss: 0, irpf: 0 };
    byCompany[key].count++;
    byCompany[key].gross += Number(p.gross_salary) || 0;
    byCompany[key].net += Number(p.net_salary) || 0;
    byCompany[key].inss += Number(p.inss) || 0;
    byCompany[key].irpf += Number(p.irpf) || 0;
  });

  // Folha por departamento
  const byDept: Record<string, { count: number; gross: number; net: number }> = {};
  payroll.forEach((p: any) => {
    const dep = p.employee?.department || '—';
    if (!byDept[dep]) byDept[dep] = { count: 0, gross: 0, net: 0 };
    byDept[dep].count++;
    byDept[dep].gross += Number(p.gross_salary) || 0;
    byDept[dep].net += Number(p.net_salary) || 0;
  });

  // Top faltas
  const absByEmp: Record<string, { name: string; dept: string; days: number; lates: number }> = {};
  absences.forEach((a: any) => {
    const id = a.employee?.id || a.employee_id;
    if (!id) return;
    if (!absByEmp[id]) absByEmp[id] = { name: a.employee?.full_name || '—', dept: a.employee?.department || '—', days: 0, lates: 0 };
    // `kind`, como os cartões de cima: `a.type` não existe, e a coluna Atrasos ficava sempre vazia.
    if (a.kind === 'atraso') absByEmp[id].lates++; else absByEmp[id].days++;
  });
  const topAbs = Object.values(absByEmp).sort((a, b) => (b.days + b.lates) - (a.days + a.lates)).slice(0, 10);

  // Top combustível
  const fuelByEmp: Record<string, { name: string; km: number; amount: number }> = {};
  fuel.forEach((f: any) => {
    const id = f.employee?.id || f.employee_id;
    if (!id) return;
    if (!fuelByEmp[id]) fuelByEmp[id] = { name: f.employee?.full_name || '—', km: 0, amount: 0 };
    fuelByEmp[id].km += Number(f.km) || Number(f.total_km) || 0;
    fuelByEmp[id].amount += Number(f.total_amount) || Number(f.amount) || 0;
  });
  const topFuel = Object.values(fuelByEmp).sort((a, b) => b.amount - a.amount).slice(0, 10);

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
            <Users className="h-4 w-4" /> Indicadores do Período
            <ExplicacaoDoIndicador id="chamados.indicadores_do_periodo" />
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
                        {r.chamados ? (
                          <ListaDeChamadosNoHover titulo={r.label} chamados={r.chamados} modulo="rh">
                            <div className="flex items-center gap-2 cursor-pointer hover:text-primary">
                              {r.icon}<span className="font-medium text-foreground text-sm">{r.label}</span>
                              <MessageSquare className="h-3 w-3 text-muted-foreground" aria-label="passe o mouse para ver os chamados" />
                            </div>
                          </ListaDeChamadosNoHover>
                        ) : (
                          <>{r.icon}<span className="font-medium text-foreground text-sm">{r.label}</span></>
                        )}
                        <ExplicacaoDoIndicador id={r.explicacao} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right"><span className="font-bold font-mono text-foreground text-sm">{r.value}</span></td>
                    <td className="px-4 py-2 text-right"><Trend change={r.change} inverse={r.changeInverse} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Por prioridade */}
      {priorityData.length > 0 && active.has('atendimento') && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" /> Chamados por Prioridade
              <ExplicacaoDoIndicador id="chamados.por_prioridade" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prioridade</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qtde</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody>
                {priorityData.map((p, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 && 'bg-background/30')}>
                    <td className="px-4 py-2"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} /><span className="font-medium">{p.name}</span></div></td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{p.value}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{pct(p.value, total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Categoria × Status */}
      {/* A mesma tabela de todos os setores, com os chamados de cada número ao passar o mouse. */}
      {active.has('atendimento') && <TabelaCategoriaPorStatus chamados={tickets} modulo="rh" />}

      {/* Folha por empresa */}
      {active.has('folha') && Object.keys(byCompany).length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
              <Building2 className="h-4 w-4" /> Folha por Empresa
              <ExplicacaoDoIndicador id="rh.folha_por_empresa" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empresa</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Headcount</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bruto</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Líquido</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">INSS</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">IRPF</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(byCompany).sort((a, b) => b.gross - a.gross).map((c, i) => (
                  <tr key={c.code} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 && 'bg-background/30')}>
                    <td className="px-4 py-2 font-medium"><Badge variant="outline" className="mr-2">{c.code}</Badge>{c.name}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{c.count}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtBRL(c.gross)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-status-success">{fmtBRL(c.net)}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmtBRL(c.inss)}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmtBRL(c.irpf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Folha por departamento */}
      {active.has('folha') && Object.keys(byDept).length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
              <Users className="h-4 w-4" /> Folha por Departamento
              <ExplicacaoDoIndicador id="rh.folha_por_departamento" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Departamento</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Headcount</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custo total</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custo médio</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byDept).sort(([, a], [, b]) => b.gross - a.gross).map(([dep, d], i) => (
                  <tr key={dep} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 && 'bg-background/30')}>
                    <td className="px-4 py-2 font-medium">{dep}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{d.count}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtBRL(d.gross)}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmtBRL(d.count ? d.gross / d.count : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Top faltas */}
      {active.has('pessoas') && topAbs.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
              <CalendarOff className="h-4 w-4 text-status-warning" /> Top colaboradores com faltas
              <ExplicacaoDoIndicador id="rh.top_faltas" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colaborador</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Departamento</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faltas/Atestados</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atrasos</th>
                </tr>
              </thead>
              <tbody>
                {topAbs.map((a, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 && 'bg-background/30')}>
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.dept}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{a.days || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{a.lates || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Top combustível */}
      {active.has('beneficios') && topFuel.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
              <Fuel className="h-4 w-4" /> Top reembolsos de combustível
              <ExplicacaoDoIndicador id="rh.top_combustivel" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colaborador</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Km</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                </tr>
              </thead>
              <tbody>
                {topFuel.map((f, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 && 'bg-background/30')}>
                    <td className="px-4 py-2 font-medium">{f.name}</td>
                    <td className="px-4 py-2 text-right font-mono">{f.km.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{fmtBRL(f.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
