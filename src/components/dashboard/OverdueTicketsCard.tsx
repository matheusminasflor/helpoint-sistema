import { useTenantPath } from '@/hooks/useTenantPath';
import { AlertTriangle, Clock, ExternalLink, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface OverdueMetrics {
  slaViolated: number;
  slaViolationRate: number;
  avgOverdueTime: number;
  violatedByPriority: Record<string, number>;
  violatedByCategory: Record<string, number>;
  total: number;
}

interface OverdueTicketsCardProps {
  metrics: OverdueMetrics | null;
  previousViolationRate?: number;
  className?: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

export function OverdueTicketsCard({ metrics, previousViolationRate, className }: OverdueTicketsCardProps) {
  const tenantPath = useTenantPath();
  const slaViolated = metrics?.slaViolated || 0;
  const slaViolationRate = metrics?.slaViolationRate || 0;
  const avgOverdueTime = metrics?.avgOverdueTime || 0;
  const violatedByPriority = metrics?.violatedByPriority || {};

  // Calculate trend
  const hasTrend = previousViolationRate !== undefined;
  const trendDiff = hasTrend ? slaViolationRate - previousViolationRate : 0;
  const isImproving = trendDiff < 0;

  // Get top priority violations
  const priorityEntries = Object.entries(violatedByPriority)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const hasViolations = slaViolated > 0;

  return (
    <Card className={cn("border-destructive/20", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn(
              "h-5 w-5",
              hasViolations ? "text-destructive" : "text-muted-foreground"
            )} />
            <CardTitle className="text-base">SLA Violados</CardTitle>
          </div>
          {hasViolations && (
            <Link 
              to={tenantPath("/ti/chamados?filter=sla_violated")} 
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver todos <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <CardDescription>
          Chamados que ultrapassaram o prazo de SLA
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metric */}
        <div className="flex items-center justify-between">
          <div>
            <p className={cn(
              "text-3xl font-bold font-mono",
              hasViolations ? "text-destructive" : "text-muted-foreground"
            )}>
              {slaViolated}
            </p>
            <p className="text-sm text-muted-foreground">
              chamados vencidos
            </p>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className={cn(
                "text-lg font-semibold",
                hasViolations ? "text-destructive" : "text-muted-foreground"
              )}>
                {slaViolationRate}%
              </span>
              {hasTrend && trendDiff !== 0 && (
                <span className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  isImproving ? "text-primary" : "text-destructive"
                )}>
                  <TrendingDown className={cn(
                    "h-3 w-3",
                    !isImproving && "rotate-180"
                  )} />
                  {Math.abs(trendDiff)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">taxa de violação</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress 
            value={slaViolationRate} 
            className={cn(
              "h-2",
              hasViolations && "[&>div]:bg-destructive"
            )}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Average Overdue Time */}
        {hasViolations && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Atraso médio: <span className="text-destructive">{avgOverdueTime}h</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Tempo médio além do prazo de SLA
              </p>
            </div>
          </div>
        )}

        {/* By Priority */}
        {priorityEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Por Prioridade
            </p>
            <div className="grid grid-cols-2 gap-2">
              {priorityEntries.map(([priority, count]) => (
                <div 
                  key={priority}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
                >
                  <div className={cn("w-2 h-2 rounded-full", PRIORITY_COLORS[priority] || 'bg-muted')} />
                  <span className="text-xs text-muted-foreground flex-1">
                    {PRIORITY_LABELS[priority] || priority}
                  </span>
                  <span className="text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasViolations && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Nenhum SLA violado!</p>
              <p className="text-xs text-muted-foreground">
                Todos os chamados estão dentro do prazo
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
