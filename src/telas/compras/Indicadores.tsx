import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, ShoppingCart, Wallet, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { KPICard } from '@/components/glpi/KPICard';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { usePurchaseIndicators, useBudgetSettings, useDepartmentBudgets, useComprasFeitas, useTemposDeDecisao } from '@/hooks/usePurchases';
import { formatarEspera } from '@/lib/tempo-de-decisao';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { filtroDoPeriodo, getDateRangeFromPeriod, intervaloDoFiltro, type MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { OPCOES_DE_CALENDARIO } from '@/lib/period';
import { gastoNoPeriodo, gastoPorMes, ehSemSetor } from '@/lib/gasto-de-compras';
import { rotuloDoSetor } from '@/lib/setores';
import { formatBRLAmount } from '@/types/purchases';
import { cn } from '@/lib/utils';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeDoSetor = (s: string) => (ehSemSetor(s) ? 'Sem setor' : rotuloDoSetor(s));

/**
 * Indicadores de Compras. Desde 2026-10-13 (dono: "por período ou mensal, e setores mais gastos por mês e
 * ano"): o período de cima vale para o gasto e o ranking de setores; o mês a mês tem o ano à parte.
 * Gasto = o que foi COMPRADO (registrado como feito), pelo total aprovado.
 */
export default function ComprasIndicadores() {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<'30d' | '90d' | 'este_mes'>('este_mes');
  const filtro: MetricsFilter = filtroDoPeriodo(periodo, intervalo);
  const { startDate, endDate } = getDateRangeFromPeriod(filtro);
  const { data, isLoading } = usePurchaseIndicators();
  // A mesma conta da tela Aprovar compras (defeito 8, regra 7): eram duas fórmulas com o mesmo nome.
  const { data: tempos } = useTemposDeDecisao();
  const { data: compras = [], isLoading: carregandoCompras } = useComprasFeitas();
  const { data: settings } = useBudgetSettings();
  const { data: budgets = [] } = useDepartmentBudgets();
  const [ano, setAno] = useState(new Date().getFullYear());

  // O teto é mensal: só se compara com ele quando o período é este mês.
  const usesBudget = settings?.mode === 'per_department' && periodo === 'este_mes';
  const de = startDate.getTime();
  const ate = endDate.getTime();
  const noPeriodo = useMemo(() => gastoNoPeriodo(compras, new Date(de), new Date(ate)), [compras, de, ate]);
  const meses = useMemo(() => gastoPorMes(compras, ano), [compras, ano]);
  const totalDoAno = meses.reduce((s, m) => s + m.total, 0);
  // Os 6 setores que mais gastaram no ano, para a tabela mês a mês.
  const setoresDoAno = useMemo(() => {
    const soma = new Map<string, number>();
    meses.forEach((m) => Object.entries(m.porSetor).forEach(([s, v]) => soma.set(s, (soma.get(s) ?? 0) + v)));
    return [...soma.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [meses]);
  const anoAtual = new Date().getFullYear();

  return (
    <div className="px-4 lg:px-8 pb-6 w-full">
      <DashboardHeader
        title="Indicadores de Compras"
        subtitle="Quanto foi comprado no período, os setores que mais gastaram, o mês a mês, produtos e fornecedores."
        actions={<TutorialDoRelatorio id="compras-indicadores" />}
        period={periodo}
        onPeriodChange={(v) => escolher(v, intervaloDoFiltro(filtro))}
        intervalo={intervalo}
        onIntervaloChange={definirIntervalo}
        periodOptions={[{ value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }, ...OPCOES_DE_CALENDARIO]}
      />

      <div className="space-y-6">
        {isLoading || !data || carregandoCompras ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <KPIGrid lgCols={4}>
              <KPICard value={formatBRLAmount(noPeriodo.total)} label="Comprado no período" icon={Wallet} color="blue" explicacao="compras.comprado_periodo" />
              <KPICard value={data.pendingApproval} label="Aguardando aprovação" icon={ShoppingCart} color="yellow" explicacao="compras.aguardando" />
              <KPICard value={tempos?.mediaEmMinutos != null ? formatarEspera(tempos.mediaEmMinutos) : "—"} label="Tempo médio de decisão" icon={Clock} color="purple" explicacao="compras.tempo_aprovacao" />
              {/* `totalProdutos`, não `topProducts.length`: a segunda é o tamanho
                  do top 8, então o cartão travava em 8 e parava de crescer. */}
              <KPICard value={data.totalProdutos} label="Produtos comprados no ano" icon={Package} color="green" explicacao="compras.produtos_ano" />
            </KPIGrid>

            {/* Os setores que mais gastaram no período; em "Este mês", contra o teto do setor. */}
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">Setores que mais gastaram no período <ExplicacaoDoIndicador id="compras.gasto_por_setor" /></h2>
              {noPeriodo.porSetor.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra feita no período.</p>
              ) : (
                <ul className="space-y-3">
                  {noPeriodo.porSetor.map(d => {
                    const limit = budgets.find(b => b.department === d.setor)?.monthly_limit ?? 0;
                    const comTeto = usesBudget && limit > 0;
                    const pct = comTeto ? Math.min(100, (d.valor / limit) * 100)
                      : noPeriodo.total > 0 ? (d.valor / noPeriodo.total) * 100 : 0;
                    const over = comTeto && d.valor > limit;
                    return (
                      <li key={d.setor} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{nomeDoSetor(d.setor)}</span>
                          <span className="font-mono">
                            {formatBRLAmount(d.valor)}
                            {comTeto
                              ? <span className="text-muted-foreground"> / {formatBRLAmount(limit)}</span>
                              : <span className="text-muted-foreground"> · {Math.round(pct)}%</span>}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                        </div>
                        {over && (
                          <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            Teto mensal do setor ultrapassado.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {usesBudget ? 'Barra = quanto do teto mensal do setor já foi usado.'
                  : settings?.mode === 'per_department' ? 'Barra = parte de cada setor no total. Escolha "Este mês" para comparar com o teto do setor.'
                  : 'Barra = parte de cada setor no total. O teto por setor está desligado (Compras → Configurações → Teto de gasto).'}
              </p>
            </Card>

            {/* Mês a mês do ano (dono, 2026-10-13). */}
            <Card className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold flex items-center gap-2">Gasto mês a mês <ExplicacaoDoIndicador id="compras.mes_a_mes" /></h2>
                <div className="inline-flex rounded-md border border-border p-0.5 text-[13px]" role="group" aria-label="Ano">
                  {[anoAtual - 1, anoAtual].map((a) => (
                    <button key={a} type="button" onClick={() => setAno(a)} aria-pressed={ano === a}
                      className={cn('rounded px-2.5 py-0.5 font-medium', ano === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground">Total de {ano}: <b className="font-mono text-foreground">{formatBRLAmount(totalDoAno)}</b></p>
              {totalDoAno === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra feita em {ano}.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={meses.map((m) => ({ mes: MESES[m.mes], total: m.total }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={80} tickFormatter={(v) => formatBRLAmount(Number(v))} />
                      <Tooltip formatter={(v) => formatBRLAmount(Number(v))}
                        contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' }} />
                      <Bar dataKey="total" name="Comprado" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] min-w-[760px]">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-1.5 pr-2 font-semibold">Setor</th>
                          {MESES.map((m) => <th key={m} className="py-1.5 px-1 font-semibold text-right">{m}</th>)}
                          <th className="py-1.5 pl-2 font-semibold text-right">{ano}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setoresDoAno.map(([setor, totalDoSetor]) => (
                          <tr key={setor} className="border-b border-border/60 last:border-0">
                            <td className="py-1.5 pr-2 font-medium">{nomeDoSetor(setor)}</td>
                            {meses.map((m) => (
                              <td key={m.mes} className="py-1.5 px-1 font-mono text-right tabular-nums">
                                {m.porSetor[setor] ? Math.round(m.porSetor[setor]).toLocaleString('pt-BR') : '—'}
                              </td>
                            ))}
                            <td className="py-1.5 pl-2 font-mono text-right font-semibold">{formatBRLAmount(totalDoSetor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[12px] text-muted-foreground">Valores dos meses em reais, sem centavos. Os 6 setores que mais gastaram no ano.</p>
                </>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">Produtos mais comprados (ano) <ExplicacaoDoIndicador id="compras.top_produtos" /></h2>
                {/* Dizer DE QUANTOS é o top: sem isto a tabela de 8 linhas passa
                    por ser a lista inteira — o mesmo princípio de `<ListaCortada />`. */}
                {data.totalProdutos > data.topProducts.length && (
                  <p className="text-[12px] text-muted-foreground">
                    Os {data.topProducts.length} mais comprados, de {data.totalProdutos} produtos no ano.
                  </p>
                )}
                {data.topProducts.length === 0 ? (
                  <EmptyState icon={Package} title="Sem compras registradas" description="Os produtos aparecem aqui após a primeira aprovação." />
                ) : (
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1.5 font-semibold">Produto</th>
                        <th className="py-1.5 font-semibold text-right">Compras</th>
                        <th className="py-1.5 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map(p => (
                        <tr key={p.name} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-2 truncate max-w-[220px]" title={p.name}>{p.name}</td>
                          <td className="py-1.5 font-mono text-right">{p.count}</td>
                          <td className="py-1.5 font-mono text-right">{formatBRLAmount(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">Ranking de fornecedores (ano) <ExplicacaoDoIndicador id="compras.fornecedores" /></h2>
                {data.totalFornecedores > data.suppliers.length && (
                  <p className="text-[12px] text-muted-foreground">
                    Os {data.suppliers.length} maiores, de {data.totalFornecedores} fornecedores no ano.
                  </p>
                )}
                {data.suppliers.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="Sem fornecedores aprovados" description="O ranking usa o orçamento escolhido em cada aprovação." />
                ) : (
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1.5 font-semibold">Fornecedor</th>
                        <th className="py-1.5 font-semibold text-right">Compras</th>
                        <th className="py-1.5 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.suppliers.map(s => (
                        <tr key={s.supplier} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-2 truncate max-w-[220px]" title={s.supplier}>{s.supplier}</td>
                          <td className="py-1.5 font-mono text-right">{s.count}</td>
                          <td className="py-1.5 font-mono text-right">{formatBRLAmount(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
