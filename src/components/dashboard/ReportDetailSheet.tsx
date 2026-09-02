import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  InsightReport, InsightSnapshot, METRIC_LABELS, FREQUENCY_LABELS,
} from "@/hooks/useInsightReports";
import { Brain, Download, Calendar, BarChart3, TrendingUp, Clock, AlertTriangle, Users, Monitor, Pencil, Trash2, Pause, Play, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { useAssistantName } from '@/hooks/useAssistantName';

interface ReportDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: InsightReport | null;
  snapshot: InsightSnapshot | null;
  onEdit?: (report: InsightReport) => void;
  onDelete?: (report: InsightReport) => void;
  onToggle?: (report: InsightReport) => void;
  onGenerateNow?: (report: InsightReport) => void;
  isGenerating?: boolean;
}

const METRIC_ICONS: Record<string, React.ReactNode> = {
  tickets_open_closed: <BarChart3 className="h-4 w-4 text-primary" />,
  avg_resolution_time: <Clock className="h-4 w-4 text-status-warning" />,
  sla_violations: <AlertTriangle className="h-4 w-4 text-destructive" />,
  critical_assets: <Monitor className="h-4 w-4 text-status-danger" />,
  technician_performance: <TrendingUp className="h-4 w-4 text-status-success" />,
  top_requesters: <Users className="h-4 w-4 text-primary" />,
};

function MiniMetricCard({ metricKey, data }: { metricKey: string; data: any }) {
  const icon = METRIC_ICONS[metricKey];
  const label = METRIC_LABELS[metricKey] || metricKey;
  const value = data?.value ?? data?.total ?? "—";
  const detail = data?.detail || null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-xl font-bold font-mono text-foreground">{value}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function LyraAnalysisBlock({ analysis }: { analysis: string | null }) {
  const assistantName = useAssistantName();
  if (!analysis) return null;
  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-primary" />
          Análise da {assistantName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownRenderer content={analysis} />
      </CardContent>
    </Card>
  );
}

export function ReportDetailSheet({ open, onOpenChange, report, snapshot, onEdit, onDelete, onToggle, onGenerateNow, isGenerating }: ReportDetailSheetProps) {
  const assistantName = useAssistantName();
  if (!report) return null;

  const metricsData = snapshot?.metrics_data || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">{report.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {FREQUENCY_LABELS[report.frequency] || report.frequency}
            </Badge>
            <Badge variant={report.is_active ? "default" : "outline"} className="text-xs">
              {report.is_active ? "Ativo" : "Pausado"}
            </Badge>
          </SheetDescription>
        </SheetHeader>

        {snapshot ? (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Gerado em {format(new Date(snapshot.generated_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {report.target_metrics.map((metricKey) => (
                <MiniMetricCard key={metricKey} metricKey={metricKey} data={metricsData[metricKey]} />
              ))}
            </div>

            {metricsData.chart_data && (
              <Card className="shadow-sm">
                <CardContent className="p-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={metricsData.chart_data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={20}>
                        {(metricsData.chart_data as any[]).map((_: any, i: number) => (
                          <Cell key={i} fill={`hsl(var(--primary))`} opacity={0.6 + i * 0.08} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Separator />
            <LyraAnalysisBlock analysis={snapshot.lyra_analysis} />

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onToggle?.(report)}>
                  {report.is_active ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Ativar</>}
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onEdit?.(report)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => onDelete?.(report)}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onGenerateNow?.(report)}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isGenerating ? "Gerando..." : "Gerar Novo"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum snapshot gerado ainda para este relatório.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em "Gerar Agora" para coletar métricas e receber a análise da {assistantName}.
            </p>
            <div className="flex items-center gap-1.5 mt-4">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => onGenerateNow?.(report)}
                disabled={isGenerating}
              >
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isGenerating ? "Gerando..." : "Gerar Agora"}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onEdit?.(report)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive border-destructive/30 hover:text-destructive" onClick={() => onDelete?.(report)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
