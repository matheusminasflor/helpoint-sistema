import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, History, RotateCcw, XCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTICategories, formatTICategoryLabel } from '@/hooks/useTICategories';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMStages } from '@/hooks/useCRM';
import { useCancelRun, useRetryRun, useRun, useWorkflow, useWorkflowRuns, type AutomationRun } from '@/hooks/useAutomations';
import { STEP_LABELS, type AutomationModule, type FlowStep, type FlowTrigger, type StepKind } from '@/lib/automation-flow';
import { FlowCanvas } from '@/components/automations/FlowCanvas';

const RUN_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'na fila', variant: 'secondary' },
  running: { label: 'rodando', variant: 'secondary' },
  waiting: { label: 'esperando', variant: 'secondary' },
  completed: { label: 'concluída', variant: 'default' },
  failed: { label: 'falhou', variant: 'destructive' },
  cancelled: { label: 'cancelada', variant: 'outline' },
};
const TRIGGER_KIND_LABEL: Record<string, string> = {
  record_created: 'registro criado', record_updated: 'registro alterado', deadline_expired: 'prazo estourado',
  schedule: 'agenda', webhook: 'webhook', manual: 'manual',
};
const STEP_STATUS_LABEL: Record<string, string> = {
  success: 'ok', failed: 'falhou', failed_safely: 'falhou, seguiu', skipped: 'pulado', stopped: 'parou', pending: 'esperando', running: 'rodando',
};

interface RunContext {
  trigger?: { kind?: string; entity?: string; after?: Record<string, unknown> };
  steps?: Record<string, { status?: string; result?: unknown; error?: string; attempts?: number; started_at?: string; ended_at?: string }>;
}

function subjectPath(run: AutomationRun): string | null {
  if (!run.subject_id) return null;
  if (run.subject_type === 'crm_deal') return `/crm/negocios/${run.subject_id}`;
  if (run.subject_type === 'ticket') return `/helpdesk/${run.subject_id}`;
  return null;
}

/**
 * Execuções de um fluxo (E5-A3): a lista à esquerda, e à direita o
 * diagrama do run pintado por status do passo, o registro por passo
 * (resultado, erro, tentativas) e os botões de reexecutar e cancelar.
 * O diagrama usa o snapshot do run (`flow`), não o fluxo atual — é o que
 * rodou de verdade.
 */
export default function AutomacaoExecucoes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: workflow } = useWorkflow(id);
  const { data: runs = [], isLoading } = useWorkflowRuns(id, 100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const runId = selectedId ?? runs[0]?.id;
  const { data: run } = useRun(runId);
  const retryRun = useRetryRun();
  const cancelRun = useCancelRun();

  const module = (workflow?.module ?? 'tickets') as AutomationModule;
  const { categories } = useTICategories(module);
  const { data: technicians = [] } = useTechnicians();
  const { data: stages = [] } = useCRMStages();
  const ctx = useMemo(() => ({
    people: technicians.map((t) => ({ id: t.id, name: t.full_name || t.email })),
    categories: categories.map((c) => ({ id: c.id, name: formatTICategoryLabel(c, categories) })),
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
  }), [technicians, categories, stages]);

  const flow = run ? (run.flow as unknown as { trigger: FlowTrigger; steps: FlowStep[] }) : null;
  const context = (run?.context ?? {}) as RunContext;
  const stepInfos = context.steps ?? {};
  const path = run ? subjectPath(run) : null;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={workflow ? `Execuções · ${workflow.name}` : 'Execuções'}
        description="Cada execução guarda o fluxo como estava na hora e o que aconteceu em cada passo."
        icon={History}
        actions={
          <Button variant="outline" onClick={() => navigate(tenantPath(`/automacoes/${id}`))}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Editor
          </Button>
        }
      />
      <div className="p-4 lg:p-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle className="text-base">Execuções</CardTitle><CardDescription>{runs.length} mais recentes</CardDescription></CardHeader>
          <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            {isLoading && <div className="p-4"><Skeleton className="h-24 w-full" /></div>}
            {!isLoading && runs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma execução ainda.</p>}
            {runs.map((r) => {
              const st = RUN_STATUS[r.status] ?? RUN_STATUS.queued;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full border-b px-4 py-2.5 text-left text-xs hover:bg-secondary/50 ${r.id === runId ? 'bg-secondary/60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{TRIGGER_KIND_LABEL[r.trigger_kind] ?? r.trigger_kind} · {r.executed_steps} passo(s)</p>
                  {r.error && <p className="mt-0.5 text-destructive truncate">{r.error}</p>}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4 min-w-0">
          {!run ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Escolha uma execução.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant={(RUN_STATUS[run.status] ?? RUN_STATUS.queued).variant}>{(RUN_STATUS[run.status] ?? RUN_STATUS.queued).label}</Badge>
                        {format(new Date(run.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </CardTitle>
                      <CardDescription>
                        Gatilho: {TRIGGER_KIND_LABEL[run.trigger_kind] ?? run.trigger_kind}
                        {typeof context.trigger?.after?.title === 'string' ? ` · "${context.trigger.after.title}"` : typeof context.trigger?.after?.name === 'string' ? ` · "${context.trigger.after.name}"` : ''}
                        {run.ended_at ? ` · terminou ${formatDistanceToNow(new Date(run.ended_at), { addSuffix: true, locale: ptBR })}` : ''}
                        {run.error ? ` · ${run.error}` : ''}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {path && <Button size="sm" variant="outline" onClick={() => navigate(tenantPath(path))}>Abrir registro</Button>}
                      {run.status === 'failed' && (
                        <Button size="sm" onClick={() => retryRun.mutate(run.id)} disabled={retryRun.isPending}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reexecutar
                        </Button>
                      )}
                      {(run.status === 'queued' || run.status === 'waiting') && (
                        <Button size="sm" variant="outline" onClick={() => cancelRun.mutate(run.id)} disabled={cancelRun.isPending}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {flow && <FlowCanvas trigger={flow.trigger} steps={flow.steps} ctx={ctx} stepStatus={stepInfos} />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Passo a passo</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {flow?.steps.map((s) => {
                    const info = stepInfos[s.id];
                    return (
                      <div key={s.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{STEP_LABELS[s.kind as StepKind]}</span>
                          <span className="text-xs text-muted-foreground font-mono">{s.id}</span>
                          <Badge variant={info?.status === 'failed' ? 'destructive' : info?.status === 'success' ? 'default' : 'outline'} className="text-[10px]">
                            {info?.status ? STEP_STATUS_LABEL[info.status] ?? info.status : 'não chegou'}
                          </Badge>
                          {info?.attempts ? <span className="text-xs text-muted-foreground">{info.attempts} tentativa(s)</span> : null}
                        </div>
                        {info?.error && <p className="mt-1 text-xs text-destructive">{info.error}</p>}
                        {info?.result !== undefined && info.result !== null && Object.keys(info.result as object).length > 0 && (
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(info.result, null, 2)}</pre>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
