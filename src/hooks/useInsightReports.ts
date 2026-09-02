import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface InsightReport {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  frequency: string;
  target_metrics: string[];
  notify_email: boolean;
  notify_inapp: boolean;
  is_active: boolean;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsightSnapshot {
  id: string;
  report_id: string;
  tenant_id: string;
  metrics_data: Record<string, any>;
  lyra_analysis: string | null;
  generated_at: string;
}

export function useInsightReports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: ["insight-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ti_insight_reports" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InsightReport[];
    },
    enabled: !!user,
  });

  const createReport = useMutation({
    mutationFn: async (report: {
      name: string;
      frequency: string;
      target_metrics: string[];
      notify_email: boolean;
      notify_inapp: boolean;
    }) => {
      const { data, error } = await supabase
        .from("ti_insight_reports" as any)
        .insert({ ...report, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight-reports"] });
      toast.success("Relatório criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar relatório. Tente novamente ou avise o suporte."),
  });

  const toggleReport = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("ti_insight_reports" as any)
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight-reports"] });
      toast.success("Status atualizado");
    },
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ti_insight_reports" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight-reports"] });
      toast.success("Relatório excluído");
    },
    onError: () => toast.error("Erro ao excluir relatório. Tente novamente ou avise o suporte."),
  });

  const updateReport = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      frequency: string;
      target_metrics: string[];
      notify_email: boolean;
      notify_inapp: boolean;
    }) => {
      const { error } = await supabase
        .from("ti_insight_reports" as any)
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight-reports"] });
      toast.success("Relatório atualizado");
    },
    onError: () => toast.error("Erro ao atualizar relatório. Tente novamente ou avise o suporte."),
  });

  const generateNow = useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-insight-report", {
        body: { report_id: reportId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight-reports"] });
      queryClient.invalidateQueries({ queryKey: ["insight-snapshots"] });
      toast.success("Relatório gerado com sucesso");
    },
    onError: () => toast.error("Erro ao gerar relatório. Tente novamente ou avise o suporte."),
  });

  return { reports, createReport, toggleReport, deleteReport, updateReport, generateNow };
}

export function useInsightSnapshots(reportId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["insight-snapshots", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ti_insight_snapshots" as any)
        .select("*")
        .eq("report_id", reportId!)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InsightSnapshot[];
    },
    enabled: !!user && !!reportId,
  });
}

export const LYRA_SYSTEM_PROMPT = `Você é uma Analista de Dados Sênior de TI. Fria, objetiva e pragmática.

REGRAS ESTRITAS:
- SE as métricas estão dentro da meta ou melhorando: reconheça a estabilidade e recomende "Manter processos atuais". NÃO invente sugestões de mudança.
- Destaque APENAS desvios padrão reais (ex: "Técnico X teve queda de 30% na resolução", "Categoria Rede teve pico de chamados terça-feira").
- Use bullet points curtos.
- Sem introduções longas, sem jargões motivacionais, sem textos poéticos.
- Máximo 8 bullet points por análise.
- Seja realista e direta.`;

export const METRIC_LABELS: Record<string, string> = {
  tickets_open_closed: "Chamados Abertos vs Fechados",
  avg_resolution_time: "Tempo Médio de Resolução",
  sla_violations: "Violamento de SLA",
  critical_assets: "Ativos Críticos",
  technician_performance: "Desempenho por Técnico",
  top_requesters: "Top Solicitantes",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};
