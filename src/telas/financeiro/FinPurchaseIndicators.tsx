import { BarChart3, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { KPICard } from '@/components/glpi/KPICard';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { Clock, ShoppingCart, Wallet, Package } from 'lucide-react';
import { usePurchaseIndicators, useBudgetSettings, useDepartmentBudgets } from '@/hooks/usePurchases';
import { formatBRLAmount } from '@/types/purchases';
import { cn } from '@/lib/utils';

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function FinPurchaseIndicators() {
  const { data, isLoading } = usePurchaseIndicators();
  const { data: settings } = useBudgetSettings();
  const { data: budgets = [] } = useDepartmentBudgets();

  const usesBudget = settings?.mode === 'per_department';

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Indicadores de Compras"
        description="Gasto do mês, produtos mais comprados, tempo de aprovação e fornecedores mais usados."
        icon={BarChart3}
      />

      <div className="p-4 lg:p-6 space-y-6">
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <KPIGrid lgCols={4}>
              <KPICard value={formatBRLAmount(data.monthTotal)} label="Aprovado no mês" icon={Wallet} color="blue" />
              <KPICard value={data.pendingApproval} label="Aguardando aprovação" icon={ShoppingCart} color="yellow" />
              <KPICard value={formatHours(data.avgApprovalHours)} label="Tempo médio de aprovação" icon={Clock} color="purple" />
              <KPICard value={data.topProducts.length} label="Produtos comprados no ano" icon={Package} color="green" />
            </KPIGrid>

            {/* Gasto x teto por setor */}
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Gasto do mês por setor</h2>
              {data.byDepartment.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra aprovada neste mês.</p>
              ) : (
                <ul className="space-y-3">
                  {data.byDepartment.map(d => {
                    const limit = budgets.find(b => b.department === d.department)?.monthly_limit ?? 0;
                    const pct = usesBudget && limit > 0 ? Math.min(100, (d.total / limit) * 100) : null;
                    const over = usesBudget && limit > 0 && d.total > limit;
                    return (
                      <li key={d.department} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{d.department}</span>
                          <span className="font-mono">
                            {formatBRLAmount(d.total)}
                            {usesBudget && limit > 0 && (
                              <span className="text-muted-foreground"> / {formatBRLAmount(limit)}</span>
                            )}
                          </span>
                        </div>
                        {pct != null && (
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
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
              {!usesBudget && (
                <p className="text-xs text-muted-foreground">
                  O teto por setor está desligado. Ative em Financeiro → Configurações para comparar gasto x limite.
                </p>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold">Produtos mais comprados (ano)</h2>
                {data.topProducts.length === 0 ? (
                  <EmptyState icon={Package} title="Sem compras registradas" description="Os produtos aparecem aqui após a primeira aprovação." />
                ) : (
                  <table className="w-full text-[13px]">
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
                <h2 className="text-sm font-semibold">Ranking de fornecedores (ano)</h2>
                {data.suppliers.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="Sem fornecedores aprovados" description="O ranking usa o orçamento escolhido em cada aprovação." />
                ) : (
                  <table className="w-full text-[13px]">
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
