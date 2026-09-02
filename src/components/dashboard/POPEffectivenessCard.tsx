import { useTenantPath } from '@/hooks/useTenantPath';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Star, TrendingUp, CheckCircle2, Eye, MessageSquare } from 'lucide-react';
import { usePOPEffectivenessMetrics } from '@/hooks/usePOPFeedback';
import { Link } from 'react-router-dom';

export function POPEffectivenessCard() {
  const tenantPath = useTenantPath();
  const { data: metrics, isLoading } = usePOPEffectivenessMetrics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Efetividade dos Tutoriais
        </CardTitle>
        <CardDescription>
          Central de ajuda e base de conhecimento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Taxa de Resolução
            </div>
            <div className="text-2xl font-bold text-primary">
              {metrics?.resolutionRate || 0}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5" />
              Avaliação Média
            </div>
            <div className="text-2xl font-bold flex items-center gap-1">
              {metrics?.avgRating ? metrics.avgRating.toFixed(1) : '—'}
              {metrics?.avgRating ? (
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-b py-2">
          <div className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            <span>{metrics?.totalViews || 0} visualizações</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{metrics?.totalSolved || 0} resolvidos</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{metrics?.totalFeedbacks || 0} feedbacks</span>
          </div>
        </div>

        {/* Top POPs */}
        {metrics?.topPOPs && metrics.topPOPs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Tutoriais Mais Efetivos</h4>
            <div className="space-y-1.5">
              {metrics.topPOPs.slice(0, 3).map((pop, index) => (
                <div 
                  key={pop.id}
                  className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 w-5 h-5 flex items-center justify-center p-0 text-xs">
                      {index + 1}
                    </Badge>
                    <span className="truncate">{pop.title}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {Math.round(pop.rate)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions Alert */}
        {metrics?.recentSuggestions && metrics.recentSuggestions.length > 0 && (
          <div className="pt-2 border-t">
            <Link 
              to={tenantPath("/ti/pops")}
              className="flex items-center justify-between text-xs hover:underline"
            >
              <span className="text-muted-foreground">
                {metrics.recentSuggestions.length} sugestões pendentes
              </span>
              <span className="text-primary">Ver todas →</span>
            </Link>
          </div>
        )}

        {/* Empty State */}
        {(!metrics?.topPOPs || metrics.topPOPs.length === 0) && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum tutorial cadastrado ainda</p>
            <Link to={tenantPath("/ti/pops")} className="text-primary hover:underline text-xs">
              Criar primeiro tutorial →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
