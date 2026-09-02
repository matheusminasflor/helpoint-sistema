import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTechnicianPerformance, TechnicianMetrics } from '@/hooks/useTechnicianPerformance';
import { MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Star, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TechnicianPerformanceChartProps {
  filter?: MetricsFilter;
  isFullscreen?: boolean;
}

function SatisfactionStars({ rating }: { rating: number }) {
  if (rating === 0) return <span className="text-muted-foreground text-xs">-</span>;
  
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

function SlaIndicator({ compliance }: { compliance: number }) {
  const color = compliance >= 90 ? 'text-primary' : compliance >= 75 ? 'text-status-warning' : 'text-destructive';
  
  return (
    <span className={cn("font-medium", color)}>
      {compliance}%
    </span>
  );
}

export function TechnicianPerformanceChart({ filter, isFullscreen }: TechnicianPerformanceChartProps) {
  const { data: technicians, isLoading } = useTechnicianPerformance(filter);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!technicians || technicians.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Desempenho por Técnico
          </CardTitle>
          <CardDescription>Métricas individuais da equipe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Nenhum técnico com chamados no período</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = technicians.map(tech => ({
    name: tech.name || tech.email.split('@')[0],
    resolvidos: tech.ticketsResolved,
    ativos: tech.activeTickets,
  }));

  const barColors = ['hsl(var(--primary))', 'hsl(var(--status-warning))'];

  return (
    <Card className={cn(isFullscreen && "border-0 shadow-none")}>
      <CardHeader className={cn(isFullscreen && "px-0")}>
        <CardTitle className={cn("flex items-center gap-2", isFullscreen ? "text-xl" : "text-base")}>
          <Users className="h-4 w-4" />
          Desempenho por Técnico
        </CardTitle>
        <CardDescription>Métricas individuais da equipe no período selecionado</CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-6", isFullscreen && "px-0")}>
        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-center">Resolvidos</TableHead>
                <TableHead className="text-center">Tempo Médio</TableHead>
                <TableHead className="text-center">SLA</TableHead>
                <TableHead className="text-center">Satisfação</TableHead>
                <TableHead className="text-center">Ativos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((tech) => (
                <TableRow key={tech.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{tech.name || tech.email.split('@')[0]}</span>
                      {tech.name && (
                        <span className="text-xs text-muted-foreground">{tech.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">
                      {tech.ticketsResolved}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {tech.avgResolutionTime > 0 ? `${tech.avgResolutionTime}h` : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <SlaIndicator compliance={tech.slaCompliance} />
                  </TableCell>
                  <TableCell className="text-center">
                    <SatisfactionStars rating={tech.avgSatisfaction} />
                  </TableCell>
                  <TableCell className="text-center">
                    {tech.activeTickets > 0 ? (
                      <Badge variant={tech.activeTickets > 5 ? "destructive" : "outline"}>
                        {tech.activeTickets}
                      </Badge>
                    ) : (
                      <CheckCircle className="h-4 w-4 text-primary mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Chart */}
        <div>
          <h4 className="text-sm font-medium mb-3">Tickets Resolvidos vs Ativos</h4>
          <ResponsiveContainer width="100%" height={isFullscreen ? 300 : 200}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={100}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="resolvidos" name="Resolvidos" fill={barColors[0]} radius={[0, 4, 4, 0]} />
              <Bar dataKey="ativos" name="Ativos" fill={barColors[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
