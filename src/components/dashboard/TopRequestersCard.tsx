import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTopRequesters, RequesterMetric } from '@/hooks/useRequesterMetrics';
import { RequesterAnalysisSheet } from './RequesterAnalysisSheet';
import { MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { Users, AlertTriangle, Building2 } from 'lucide-react';

interface TopRequestersCardProps {
  filter?: MetricsFilter;
}

export function TopRequestersCard({ filter }: TopRequestersCardProps) {
  const { data: requesters, isLoading } = useTopRequesters(filter, 10);
  const [selectedRequester, setSelectedRequester] = useState<RequesterMetric | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleRequesterClick = (requester: RequesterMetric) => {
    setSelectedRequester(requester);
    setSheetOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Top Solicitantes
          </CardTitle>
          <CardDescription>Usuários que mais abrem chamados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!requesters || requesters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Top Solicitantes
          </CardTitle>
          <CardDescription>Usuários que mais abrem chamados</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum chamado no período selecionado
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = requesters[0]?.ticket_count || 1;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Top Solicitantes
          </CardTitle>
          <CardDescription>Clique em um solicitante para análise detalhada</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-3">
              {requesters.map((requester, index) => {
                const barWidth = (requester.ticket_count / maxCount) * 100;
                
                return (
                  <div
                    key={requester.id}
                    className="relative p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleRequesterClick(requester)}
                  >
                    <div
                      className="absolute inset-0 bg-primary/10 rounded-lg transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                    
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {requester.full_name || requester.email}
                          </p>
                          {requester.department && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {requester.department}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {requester.urgent_count > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {requester.urgent_count}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs font-bold">
                          {requester.ticket_count} {requester.ticket_count === 1 ? 'chamado' : 'chamados'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <RequesterAnalysisSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        requester={selectedRequester}
        filter={filter}
      />
    </>
  );
}
