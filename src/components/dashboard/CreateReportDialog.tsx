import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useInsightReports, InsightReport, METRIC_LABELS } from "@/hooks/useInsightReports";
import { useAssistantName } from '@/hooks/useAssistantName';

const METRICS = Object.entries(METRIC_LABELS);

interface CreateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editReport?: InsightReport | null;
}

export function CreateReportDialog({ open, onOpenChange, editReport }: CreateReportDialogProps) {
  const assistantName = useAssistantName();
  const { createReport, updateReport } = useInsightReports();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);

  const isEditMode = !!editReport;

  useEffect(() => {
    if (editReport) {
      setName(editReport.name);
      setFrequency(editReport.frequency);
      setSelectedMetrics(editReport.target_metrics);
      setNotifyEmail(editReport.notify_email);
      setNotifyInApp(editReport.notify_inapp);
    } else {
      setName("");
      setFrequency("weekly");
      setSelectedMetrics([]);
      setNotifyEmail(false);
      setNotifyInApp(true);
    }
  }, [editReport, open]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  };

  const handleSubmit = () => {
    if (!name.trim() || selectedMetrics.length === 0) return;

    const payload = {
      name: name.trim(),
      frequency,
      target_metrics: selectedMetrics,
      notify_email: notifyEmail,
      notify_inapp: notifyInApp,
    };

    const onSuccess = () => {
      onOpenChange(false);
    };

    if (isEditMode) {
      updateReport.mutate({ id: editReport.id, ...payload }, { onSuccess });
    } else {
      createReport.mutate(payload, { onSuccess });
    }
  };

  const isPending = createReport.isPending || updateReport.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Editar Relatório" : "Novo Relatório Automatizado"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Altere as configurações do relatório gerencial."
              : `Configure um relatório gerencial que será gerado automaticamente pela ${assistantName}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="report-name">Nome do Relatório</Label>
            <Input
              id="report-name"
              placeholder="Ex: Fechamento Semanal de SLA"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Frequência</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Métricas Alvo</Label>
            <div className="grid grid-cols-1 gap-2">
              {METRICS.map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer rounded-md border border-border/50 px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={selectedMetrics.includes(key)}
                    onCheckedChange={() => toggleMetric(key)}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notificar via</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={notifyEmail} onCheckedChange={(v) => setNotifyEmail(!!v)} />
                <span className="text-sm">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={notifyInApp} onCheckedChange={(v) => setNotifyInApp(!!v)} />
                <span className="text-sm">Notificação In-App</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || selectedMetrics.length === 0 || isPending}
          >
            {isPending
              ? (isEditMode ? "Salvando..." : "Criando...")
              : (isEditMode ? "Salvar Alterações" : "Criar Relatório")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
