import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, History, Plus, Trash2, Workflow, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTICategories, formatTICategoryLabel } from '@/hooks/useTICategories';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMStages } from '@/hooks/useCRM';
import { flowOf, useCancelRun, useSaveWorkflow, useSetWorkflowStatus, useWebhookSecret, useWorkflow, useWorkflowRuns } from '@/hooks/useAutomations';
import {
  ENTITY_FIELDS, ENTITY_LABELS, STEP_CATALOG, STEP_LABELS, WEEKDAY_LABELS, describeStep, describeTrigger, dropStep, entitiesForModule,
  hasBranch, linkLinear, newStepId, orderSteps, orphanSteps, validateFlow,
  type AutomationModule, type EntityKind, type FlowStep, type FlowTrigger, type StepKind,
} from '@/lib/automation-flow';
import { FilterEditor } from '@/components/automations/FilterEditor';
import { StepConfigForm } from '@/components/automations/StepConfigForm';
import { FlowCanvas } from '@/components/automations/FlowCanvas';

const CONFIG_ROUTE: Record<AutomationModule, string> = {
  tickets: '/ti/configuracoes', marketing: '/mkt/configuracoes', qualidade: '/qualidade/configuracoes', rh: '/rh/configuracoes',
  financeiro: '/financeiro/configuracoes', comercial: '/comercial/configuracoes', educacional: '/educacional/configuracoes',
  crm: '/crm/configuracoes',
};

const TRIGGER_KINDS: { value: FlowTrigger['kind']; label: string }[] = [
  { value: 'record_created', label: 'um registro é criado' },
  { value: 'record_updated', label: 'um registro é alterado' },
  { value: 'deadline_expired', label: 'o prazo de um chamado estoura' },
  { value: 'schedule', label: 'chega o dia e a hora' },
  { value: 'manual', label: 'alguém aciona pelo botão' },
  { value: 'webhook', label: 'outro sistema chama um endereço' },
];

const RUN_STATUS: Record<string, string> = {
  queued: 'na fila', running: 'rodando', waiting: 'esperando', completed: 'concluída', failed: 'falhou', cancelled: 'cancelada',
};

const END = '__end__';

function entityOf(trigger: FlowTrigger): EntityKind | undefined {
  return 'entity' in trigger ? trigger.entity : undefined;
}

function defaultTrigger(kind: FlowTrigger['kind'], entity: EntityKind): FlowTrigger {
  switch (kind) {
    case 'record_created': return { kind, entity, next: [] };
    case 'record_updated': return { kind, entity, fields: [], next: [] };
    case 'deadline_expired': return { kind, entity: 'ticket', next: [] };
    case 'schedule': return { kind, every: 'day', time: '08:00', next: [] };
    case 'webhook': return { kind, next: [] };
    case 'manual': return { kind, entity, next: [] };
  }
}

/**
 * Editor de um fluxo: gatilho + passos. Sem passo "Ramificar" a lista é uma
 * cadeia (cada passo leva ao seguinte, `linkLinear`); com ele, cada passo diz
 * para onde vai (`next`) e os ramos apontam para onde quiserem — o grafo que o
 * banco já guardava desde a A1. A aba "Diagrama" desenha o mesmo fluxo
 * (`FlowCanvas`) e clicar num nó abre o passo.
 */
export default function AutomacaoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: workflow, isLoading } = useWorkflow(id);
  const module = (workflow?.module ?? 'tickets') as AutomationModule;
  const { categories } = useTICategories(module);
  const { data: technicians = [] } = useTechnicians();
  const { data: stages = [] } = useCRMStages();
  const { data: runs = [] } = useWorkflowRuns(id, 10);
  const saveWorkflow = useSaveWorkflow();
  const setStatus = useSetWorkflowStatus();
  const cancelRun = useCancelRun();
  const webhookSecret = useWebhookSecret();
  const [secretShown, setSecretShown] = useState<string | null>(null);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-webhook/${id}`;

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<FlowTrigger>({ kind: 'record_created', entity: 'ticket', next: [] });
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [view, setView] = useState<'lista' | 'diagrama'>('lista');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (workflow && workflow.id !== loadedId) {
      const flow = flowOf(workflow);
      setName(workflow.name);
      setTrigger(flow.trigger);
      setSteps(orderSteps(flow.trigger, flow.steps));
      setDirty(false);
      setLoadedId(workflow.id);
    }
  }, [workflow, loadedId]);

  const branching = hasBranch(steps);
  const stepRefs = useMemo(() => steps.map((s, i) => ({ id: s.id, label: `${i + 1}. ${STEP_LABELS[s.kind]}` })), [steps]);
  const refs = useMemo(() => ({
    people: technicians.map((t) => ({ id: t.id, name: t.full_name || t.email })),
    categories: categories.map((c) => ({ id: c.id, name: formatTICategoryLabel(c, categories) })),
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    steps: stepRefs,
  }), [technicians, categories, stages, stepRefs]);

  const entity = entityOf(trigger);
  const entities = entitiesForModule(module);
  const catalog = STEP_CATALOG.filter((s) => !s.hidden && (!s.entities || (entity && s.entities.includes(entity))));

  // O que vai para o banco (e para o diagrama): a cadeia, ou o grafo como está.
  const effective = useMemo(() => (branching ? { trigger, steps } : linkLinear(trigger, steps)), [branching, trigger, steps]);
  const orphans = branching ? orphanSteps(trigger, steps) : [];

  const touch = () => setDirty(true);
  const updateTrigger = (t: FlowTrigger) => { setTrigger(t); touch(); };
  const updateStep = (i: number, s: FlowStep) => { setSteps((prev) => prev.map((x, j) => (j === i ? s : x))); touch(); };
  const removeStep = (i: number) => {
    const r = dropStep(trigger, steps, steps[i].id);
    setTrigger(r.trigger);
    setSteps(r.steps);
    if (selectedId === steps[i].id) setSelectedId(null);
    touch();
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    touch();
  };
  const addStep = (kind: StepKind) => {
    const step: FlowStep = { id: newStepId(steps), kind, config: kind === 'create_ticket' ? { module } : {}, next: [] };
    if (branching) {
      // Já é grafo: o passo entra solto e a pessoa liga de onde quiser.
      setSteps((prev) => [...prev, step]);
    } else {
      // Ainda é cadeia (ou vira agora, com o primeiro "Ramificar"): fixa a cadeia atual e pendura o novo no fim.
      const linked = linkLinear(trigger, [...steps, step]);
      setTrigger(linked.trigger);
      setSteps(linked.steps);
    }
    setSelectedId(step.id);
    touch();
  };

  const handleSave = (thenStatus?: 'active' | 'paused') => {
    if (!workflow) return;
    const error = validateFlow(effective.trigger, effective.steps);
    if (error) { toast.error(error); return; }
    if (!name.trim()) { toast.error('Dê um nome ao fluxo.'); return; }
    if (orphans.length > 0) { toast.error(`Passo(s) sem ligação: ${orphans.join(', ')}. Ligue-os ou remova-os.`); return; }
    // O hash do segredo do webhook vive no gatilho e não passa pelo editor: preserva o que está no banco.
    const storedHash = (workflow.trigger as { secret_hash?: string }).secret_hash;
    const triggerToSave = effective.trigger.kind === 'webhook' && storedHash ? { ...effective.trigger, secret_hash: storedHash } : effective.trigger;
    saveWorkflow.mutate(
      { id: workflow.id, module, name: name.trim(), trigger: triggerToSave, steps: effective.steps, status: thenStatus },
      { onSuccess: () => setDirty(false) },
    );
  };

  if (isLoading || !workflow) {
    return <div className="p-6 space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full" /></div>;
  }

  const nextSelect = ({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude?: string }) => (
    <Select value={value[0] ?? END} onValueChange={(v) => onChange(v === END ? [] : [v])}>
      <SelectTrigger className="h-7 w-56 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={END}>(termina aqui)</SelectItem>
        {stepRefs.filter((t) => t.id !== exclude).map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const renderStep = (step: FlowStep, i: number) => {
    const def = STEP_CATALOG.find((s) => s.kind === step.kind);
    const orphan = orphans.includes(step.id);
    return (
      <div key={step.id} className={`rounded-lg border p-3 space-y-3 ${orphan ? 'border-destructive' : ''} ${selectedId === step.id ? 'ring-2 ring-ring' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{i + 1}</span>
          <span className="font-medium text-sm">{STEP_LABELS[step.kind]}</span>
          {def?.external && <Badge variant="outline" className="text-[10px]">via worker</Badge>}
          {orphan && <Badge variant="destructive" className="text-[10px]">ninguém leva até aqui</Badge>}
          <span className="text-xs text-muted-foreground truncate">{describeStep(step, entity, refs)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeStep(i)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <StepConfigForm step={step} entity={entity} module={module} refs={refs} onChange={(s) => updateStep(i, s)} />
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {branching && step.kind !== 'branch' && step.kind !== 'stop' && (
            <label className="flex items-center gap-2">
              Depois → vai para
              {nextSelect({ value: step.next, exclude: step.id, onChange: (next) => updateStep(i, { ...step, next }) })}
            </label>
          )}
          <label className="flex items-center gap-2">
            <Switch checked={step.continue_on_failure === true} onCheckedChange={(v) => updateStep(i, { ...step, continue_on_failure: v || undefined })} />
            Se falhar, seguir mesmo assim
          </label>
          <label className="flex items-center gap-2">
            Tentativas extras
            <Select value={String(step.retry ?? 0)} onValueChange={(v) => updateStep(i, { ...step, retry: Number(v) || undefined })}>
              <SelectTrigger className="h-7 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>{[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        </div>
      </div>
    );
  };

  const selectedIndex = steps.findIndex((s) => s.id === selectedId);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={name || 'Fluxo'}
        description={`Automação do módulo ${module === 'tickets' ? 'TI' : module}. Quando ${describeTrigger(trigger, refs)}.`}
        icon={Workflow}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate(tenantPath(CONFIG_ROUTE[module]))}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Configurações
            </Button>
            <Button variant="outline" onClick={() => navigate(tenantPath(`/automacoes/${workflow.id}/execucoes`))}>
              <History className="w-4 h-4 mr-1.5" /> Execuções
            </Button>
            {workflow.status === 'active' ? (
              <Button variant="secondary" onClick={() => setStatus.mutate({ id: workflow.id, status: 'paused' })}>Pausar</Button>
            ) : (
              <Button variant="secondary" onClick={() => (dirty ? handleSave('active') : setStatus.mutate({ id: workflow.id, status: 'active' }))} disabled={steps.length === 0}>
                <Zap className="w-4 h-4 mr-1.5" /> Ativar
              </Button>
            )}
            <Button onClick={() => handleSave()} disabled={!dirty || saveWorkflow.isPending}>Salvar</Button>
          </div>
        }
      />

      <div className="p-4 lg:p-6 grid gap-4 lg:grid-cols-[1fr_20rem] max-w-7xl">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nome</CardTitle>
            </CardHeader>
            <CardContent>
              <Input value={name} onChange={(e) => { setName(e.target.value); touch(); }} maxLength={120} className="max-w-md" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quando</CardTitle>
              <CardDescription>O gatilho: o que precisa acontecer para o fluxo rodar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Acontece</Label>
                  <Select value={trigger.kind} onValueChange={(k) => updateTrigger({ ...defaultTrigger(k as FlowTrigger['kind'], entity ?? 'ticket'), next: trigger.next })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRIGGER_KINDS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {(trigger.kind === 'record_created' || trigger.kind === 'record_updated' || trigger.kind === 'manual') && (
                  <div className="space-y-1.5">
                    <Label>Cadastro</Label>
                    <Select value={trigger.entity} onValueChange={(e) => updateTrigger({ ...defaultTrigger(trigger.kind, e as EntityKind), next: trigger.next })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{entities.map((e) => <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {trigger.kind === 'record_updated' && (
                <div className="space-y-1.5">
                  <Label>Só quando mudar</Label>
                  <div className="flex flex-wrap gap-2">
                    {ENTITY_FIELDS[trigger.entity].map((f) => {
                      const on = trigger.fields.includes(f.key);
                      return (
                        <Button key={f.key} type="button" size="sm" variant={on ? 'default' : 'outline'} className="h-7"
                          onClick={() => updateTrigger({ ...trigger, fields: on ? trigger.fields.filter((k) => k !== f.key) : [...trigger.fields, f.key] })}>
                          {f.label}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Nenhum marcado = qualquer alteração.</p>
                </div>
              )}

              {trigger.kind === 'schedule' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Repete</Label>
                    <Select value={trigger.every} onValueChange={(v) => updateTrigger({ ...trigger, every: v as 'day' | 'week', weekday: v === 'week' ? trigger.weekday ?? 1 : undefined })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="day">todo dia</SelectItem><SelectItem value="week">toda semana</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {trigger.every === 'week' && (
                    <div className="space-y-1.5">
                      <Label>Dia</Label>
                      <Select value={String(trigger.weekday ?? 1)} onValueChange={(v) => updateTrigger({ ...trigger, weekday: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(WEEKDAY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Hora</Label>
                    <Input type="time" value={trigger.time} onChange={(e) => updateTrigger({ ...trigger, time: e.target.value })} />
                  </div>
                </div>
              )}

              {trigger.kind === 'webhook' && (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <p>Outro sistema dispara este fluxo com <span className="font-mono">POST</span> em:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs break-all">{webhookUrl}</code>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Endereço copiado.'); }}>copiar</Button>
                  </div>
                  <p className="text-muted-foreground">Cabeçalho <span className="font-mono">X-Helpoint-Secret</span> com o segredo; o corpo JSON vira <span className="font-mono">{'{{trigger.body.campo}}'}</span> nos passos. Limite: 60 disparos por minuto.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={dirty || webhookSecret.isPending} onClick={() => workflow && webhookSecret.mutate(workflow.id, { onSuccess: (sec) => setSecretShown(sec) })}>
                      {(workflow.trigger as { secret_hash?: string }).secret_hash ? 'Trocar segredo' : 'Gerar segredo'}
                    </Button>
                    {dirty && <span className="text-xs text-muted-foreground">salve o fluxo antes de gerar o segredo</span>}
                  </div>
                  {secretShown && (
                    <div className="rounded-md bg-muted p-2 text-xs">
                      <p className="font-semibold">Copie agora — não aparece de novo:</p>
                      <code className="break-all">{secretShown}</code>
                    </div>
                  )}
                </div>
              )}

              {(trigger.kind === 'record_created' || trigger.kind === 'record_updated' || trigger.kind === 'deadline_expired') && (
                <div className="space-y-1.5">
                  <Label>Só se</Label>
                  <FilterEditor
                    entity={trigger.kind === 'deadline_expired' ? 'ticket' : trigger.entity}
                    value={trigger.filter}
                    onChange={(filter) => updateTrigger({ ...trigger, filter })}
                    people={refs.people} categories={refs.categories} stages={refs.stages}
                    allowChanged={trigger.kind === 'record_updated'}
                  />
                </div>
              )}

              {branching && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Começa por
                  {nextSelect({ value: trigger.next, onChange: (next) => updateTrigger({ ...trigger, next }) })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Então</CardTitle>
                  <CardDescription>
                    {branching
                      ? 'Com "Ramificar" no fluxo, cada passo diz para onde vai; os ramos apontam para o passo que quiserem.'
                      : 'Os passos, um depois do outro. "Só continuar se…", "Esperar" e "Ramificar" também são passos.'}
                  </CardDescription>
                </div>
                <Tabs value={view} onValueChange={(v) => setView(v as 'lista' | 'diagrama')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="lista" className="text-xs">Lista</TabsTrigger>
                    <TabsTrigger value="diagrama" className="text-xs">Diagrama</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {orphans.length > 0 && (
                <p className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  Ninguém leva até {orphans.length === 1 ? 'o passo' : 'os passos'} {orphans.join(', ')}: ligue-os por "vai para" ou remova-os. Não dá para salvar assim.
                </p>
              )}
              <Tabs value={view}>
                <TabsContent value="lista" className="mt-0 space-y-3">
                  {steps.map(renderStep)}
                </TabsContent>
                <TabsContent value="diagrama" className="mt-0 space-y-3">
                  <FlowCanvas trigger={effective.trigger} steps={effective.steps} ctx={refs} selectedId={selectedId} onSelect={setSelectedId} />
                  {selectedIndex >= 0
                    ? renderStep(steps[selectedIndex], selectedIndex)
                    : <p className="text-xs text-muted-foreground">Clique num passo do diagrama para editar aqui.</p>}
                </TabsContent>
              </Tabs>
              <Select value="" onValueChange={(k) => addStep(k as StepKind)}>
                <SelectTrigger className="w-64"><Plus className="h-3.5 w-3.5 mr-1.5" /><SelectValue placeholder="Adicionar passo" /></SelectTrigger>
                <SelectContent>
                  {catalog.map((s) => (
                    <SelectItem key={s.kind} value={s.kind}>
                      <span>{s.label}</span><span className="ml-2 text-xs text-muted-foreground">{s.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execuções recentes</CardTitle>
              <CardDescription>{workflow.run_count} concluída(s) no total.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>}
              {runs.map((r) => (
                <div key={r.id} className="rounded-lg border p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={r.status === 'failed' ? 'destructive' : r.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">{RUN_STATUS[r.status] ?? r.status}</Badge>
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</span>
                  </div>
                  {r.error && <p className="text-destructive">{r.error}</p>}
                  {(r.status === 'waiting' || r.status === 'queued') && (
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => cancelRun.mutate(r.id)}>cancelar</button>
                  )}
                </div>
              ))}
              {runs.length > 0 && (
                <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => navigate(tenantPath(`/automacoes/${workflow.id}/execucoes`))}>
                  Ver todas, com o diagrama e o passo a passo
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
