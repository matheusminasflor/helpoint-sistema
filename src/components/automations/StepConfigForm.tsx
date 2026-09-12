import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';
import { FilterEditor } from './FilterEditor';
import {
  ENTITY_FIELDS, ENTITY_LABELS, MODULE_LABELS, PRIORITY_LABELS, TEAM_LABELS,
  type AutomationModule, type EntityKind, type FlowFilter, type FlowStep, type NamedRef, type PersonRef,
} from '@/lib/automation-flow';

export interface StepFormRefs {
  people: PersonRef[];
  categories: NamedRef[];
  stages: NamedRef[];
  /** Os outros passos do fluxo (id → rótulo), para os destinos dos ramos. */
  steps?: { id: string; label: string }[];
}

interface StepConfigFormProps {
  step: FlowStep;
  entity: EntityKind | undefined;
  module: AutomationModule;
  refs: StepFormRefs;
  onChange: (step: FlowStep) => void;
}

type Cfg = Record<string, unknown>;
const NONE = '__none__';

function TemplateHint({ entity }: { entity: EntityKind | undefined }) {
  if (!entity) return null;
  const sample = ENTITY_FIELDS[entity].slice(0, 3).map((f) => `{{trigger.after.${f.key}}}`).join(', ');
  return <p className="text-[11px] text-muted-foreground">Pode usar campos do registro: {sample}…</p>;
}

/** Quem: pessoa fixa, equipe, ou um papel do registro do gatilho (dono, responsável, solicitante). */
function PersonPicker({ cfg, set, people, allowTeam, entity }: { cfg: Cfg; set: (patch: Cfg) => void; people: PersonRef[]; allowTeam?: boolean; entity: EntityKind | undefined }) {
  const mode = typeof cfg.user_id === 'string' ? 'person' : typeof cfg.team_module === 'string' ? 'team' : typeof cfg.target === 'string' ? cfg.target : 'person';
  const roles = entity === 'ticket'
    ? [{ value: 'assignee', label: 'o responsável pelo chamado' }, { value: 'requester', label: 'quem abriu o chamado' }]
    : entity ? [{ value: 'owner', label: `o dono do ${entity === 'crm_contact' ? 'contato' : 'negócio'}` }] : [];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        value={mode}
        onValueChange={(v) => {
          if (v === 'person') set({ user_id: cfg.user_id ?? people[0]?.id, team_module: undefined, target: undefined });
          else if (v === 'team') set({ team_module: cfg.team_module ?? 'ti', user_id: undefined, target: undefined });
          else set({ target: v, user_id: undefined, team_module: undefined });
        }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="person">uma pessoa</SelectItem>
          {allowTeam && <SelectItem value="team">uma equipe</SelectItem>}
          {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {mode === 'person' && (
        <Select value={typeof cfg.user_id === 'string' ? cfg.user_id : ''} onValueChange={(v) => set({ user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
          <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {mode === 'team' && (
        <Select value={typeof cfg.team_module === 'string' ? cfg.team_module : ''} onValueChange={(v) => set({ team_module: v })}>
          <SelectTrigger><SelectValue placeholder="Escolha a equipe" /></SelectTrigger>
          <SelectContent>{Object.entries(TEAM_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

/** O formulário de configuração de um passo, por tipo. Grava em `step.config` no formato que `automation_run_step` lê. */
export function StepConfigForm({ step, entity, module, refs, onChange }: StepConfigFormProps) {
  const cfg = step.config as Cfg;
  const set = (patch: Cfg) => {
    const next: Cfg = { ...cfg, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange({ ...step, config: next });
  };
  const text = (k: string) => (typeof cfg[k] === 'string' ? (cfg[k] as string) : '');
  const num = (k: string) => (typeof cfg[k] === 'number' ? String(cfg[k]) : '');

  switch (step.kind) {
    case 'notify':
      return (
        <div className="space-y-3">
          <PersonPicker cfg={cfg} set={set} people={refs.people} allowTeam entity={entity} />
          <div className="space-y-1.5"><Label>Título</Label><Input value={text('title')} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Crítico #{{trigger.after.ticket_number}}" /></div>
          <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={2} value={text('message')} onChange={(e) => set({ message: e.target.value })} /></div>
          <TemplateHint entity={entity} />
        </div>
      );
    case 'create_task':
      return (
        <div className="space-y-3">
          <PersonPicker cfg={cfg} set={set} people={refs.people} entity={entity} />
          <div className="space-y-1.5"><Label>Título</Label><Input value={text('title')} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={text('description')} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Prazo (dias)</Label><Input type="number" min="0" value={num('due_in_days')} onChange={(e) => set({ due_in_days: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Prioridade (1 a 5)</Label><Input type="number" min="1" max="5" value={num('priority')} onChange={(e) => set({ priority: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
          </div>
          <TemplateHint entity={entity} />
        </div>
      );
    case 'create_ticket':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Módulo</Label>
              <Select value={text('module') || module} onValueChange={(v) => set({ module: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MODULE_LABELS) as AutomationModule[]).map((m) => <SelectItem key={m} value={m}>{MODULE_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={text('priority') || 'medium'} onValueChange={(v) => set({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Título</Label><Input value={text('title')} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={text('description')} onChange={(e) => set({ description: e.target.value })} /></div>
          {refs.categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={text('category_id') || NONE} onValueChange={(v) => set({ category_id: v === NONE ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {refs.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {entity && (
            <div className="space-y-1.5">
              <Label>Quem abre o chamado</Label>
              <Select value={text('requester_target') || NONE} onValueChange={(v) => set({ requester_target: v === NONE ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{entity === 'ticket' ? 'quem abriu o chamado do gatilho' : 'quem criou o fluxo'}</SelectItem>
                  <SelectItem value="created_by">quem criou o {ENTITY_LABELS[entity].toLowerCase()}</SelectItem>
                  {entity !== 'ticket' && entity !== 'crm_order' && <SelectItem value="owner">o dono do {ENTITY_LABELS[entity].toLowerCase()}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <TemplateHint entity={entity} />
        </div>
      );
    case 'create_receivable':
      return entity === 'crm_order' ? (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Vence em (dias)</Label><Input type="number" min="0" className="w-32" value={num('due_in_days')} onChange={(e) => set({ due_in_days: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="7" /></div>
          <div className="space-y-1.5"><Label>Descrição (opcional)</Label><Input value={text('description')} onChange={(e) => set({ description: e.target.value })} placeholder="Pedido #{{trigger.after.number}} — {{trigger.contact.name}}" /></div>
          <p className="text-[11px] text-muted-foreground">Entra em Financeiro → Contas a receber com o total do pedido e o nome do cliente. Quem tem ERP fora do Helpoint pode tirar este passo.</p>
        </div>
      ) : <p className="text-sm text-muted-foreground">Conta a receber só nasce de um pedido: use num fluxo cujo gatilho é um pedido.</p>;
    case 'bling_order': {
      const tri = (k: string) => (typeof cfg[k] === 'boolean' ? (cfg[k] ? 'sim' : 'nao') : 'padrao');
      const setTri = (k: string, v: string) => set({ [k]: v === 'padrao' ? undefined : v === 'sim' });
      return entity === 'crm_order' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Gerar a NF-e</Label>
              <Select value={tri('gerar_nfe')} onValueChange={(v) => setTri('gerar_nfe', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="padrao">como está em Nota fiscal</SelectItem><SelectItem value="sim">sim</SelectItem><SelectItem value="nao">não, só o pedido</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Transmitir à SEFAZ</Label>
              <Select value={tri('enviar_nfe')} onValueChange={(v) => setTri('enviar_nfe', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="padrao">como está em Nota fiscal</SelectItem><SelectItem value="sim">sim, na hora</SelectItem><SelectItem value="nao">não, revisar no Bling</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Usa a conta do Bling conectada em Configurações do Comercial → Nota fiscal. O cliente vira contato lá; o pedido leva os itens, o desconto e o frete.</p>
        </div>
      ) : <p className="text-sm text-muted-foreground">O pedido no Bling só nasce de um pedido: use num fluxo cujo gatilho é um pedido.</p>;
    }
    case 'assign':
    case 'create_calendar_event':
      return (
        <div className="space-y-3">
          <PersonPicker cfg={cfg} set={set} people={refs.people} entity={entity} />
          {step.kind === 'create_calendar_event' && (
            <>
              <div className="space-y-1.5"><Label>Título</Label><Input value={text('title')} onChange={(e) => set({ title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Daqui a quantos dias</Label><Input type="number" min="0" value={num('in_days')} onChange={(e) => set({ in_days: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
              <TemplateHint entity={entity} />
            </>
          )}
        </div>
      );
    case 'set_priority':
      return (
        <div className="space-y-1.5">
          <Label>Nova prioridade</Label>
          <Select value={text('priority')} onValueChange={(v) => set({ priority: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{Object.entries(PRIORITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    case 'set_stage':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nova etapa</Label>
            <Select value={text('stage_id')} onValueChange={(v) => set({ stage_id: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{refs.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Motivo (quando for "perdido")</Label><Input value={text('lost_reason')} onChange={(e) => set({ lost_reason: e.target.value })} placeholder="Ex.: Sem resposta" /></div>
        </div>
      );
    case 'update_record': {
      const fields = (cfg.fields as Record<string, unknown>) ?? {};
      const allowed = entity ? ENTITY_FIELDS[entity].filter((f) => !['ticket_number', 'requester_id', 'won_at', 'lost_at', 'number'].includes(f.key)) : [];
      const setField = (k: string, v: unknown) => set({ fields: { ...fields, [k]: v } });
      const removeField = (k: string) => { const next = { ...fields }; delete next[k]; set({ fields: next }); };
      return (
        <div className="space-y-2">
          {Object.entries(fields).map(([k, v]) => {
            const def = allowed.find((f) => f.key === k);
            return (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <span className="w-40 text-sm">{def?.label ?? k}</span>
                {def?.options ? (
                  <Select value={String(v ?? '')} onValueChange={(nv) => setField(k, nv)}>
                    <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(def.options).map(([ov, ol]) => <SelectItem key={ov} value={ov}>{ol}</SelectItem>)}</SelectContent>
                  </Select>
                ) : k === 'stage_id' ? (
                  <Select value={String(v ?? '')} onValueChange={(nv) => setField(k, nv)}>
                    <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{refs.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : def?.type === 'uuid' ? (
                  <Select value={String(v ?? '')} onValueChange={(nv) => setField(k, nv)}>
                    <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{refs.people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input className="h-8 w-48" value={String(v ?? '')} onChange={(e) => setField(k, e.target.value)} />
                )}
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => removeField(k)}>remover</button>
              </div>
            );
          })}
          <Select value="" onValueChange={(k) => setField(k, '')}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="+ campo" /></SelectTrigger>
            <SelectContent>
              {allowed.filter((f) => !(f.key in fields)).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Campo personalizado: digite a chave como <span className="font-mono">custom.chave</span> em "+ campo" não é possível; use Atualizar em contato/negócio pelo cadastro.</p>
        </div>
      );
    }
    case 'create_deal':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Título</Label><Input value={text('title')} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" min="0" step="0.01" value={num('value')} onChange={(e) => set({ value: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={text('stage_id') || NONE} onValueChange={(v) => set({ stage_id: v === NONE ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Primeira etapa do funil padrão</SelectItem>
                  {refs.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    case 'add_note':
      return (
        <div className="space-y-1.5">
          <Label>Texto</Label>
          <Textarea rows={3} value={text('content')} onChange={(e) => set({ content: e.target.value })} />
          <TemplateHint entity={entity} />
        </div>
      );
    case 'condition':
      return entity ? (
        <div className="space-y-3">
          <FilterEditor entity={entity} value={cfg.filter as FlowFilter | undefined} onChange={(filter) => set({ filter })} people={refs.people} categories={refs.categories} stages={refs.stages} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={cfg.refresh === true} onCheckedChange={(c) => set({ refresh: c === true ? true : undefined })} />
            Olhar o registro de novo antes de decidir (para depois de uma espera)
          </label>
        </div>
      ) : <p className="text-sm text-muted-foreground">A condição olha os campos do registro do gatilho; este gatilho não tem registro.</p>;
    case 'delay':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Dias</Label><Input type="number" min="0" value={num('days')} onChange={(e) => set({ days: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Horas</Label><Input type="number" min="0" value={num('hours')} onChange={(e) => set({ hours: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Minutos</Label><Input type="number" min="0" value={num('minutes')} onChange={(e) => set({ minutes: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
        </div>
      );
    case 'send_email':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Para</Label><Input value={text('to')} onChange={(e) => set({ to: e.target.value })} placeholder="email@empresa.com ou {{trigger.after.email}}" /></div>
          <div className="space-y-1.5"><Label>Assunto</Label><Input value={text('subject')} onChange={(e) => set({ subject: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={4} value={text('body')} onChange={(e) => set({ body: e.target.value })} /></div>
          <TemplateHint entity={entity} />
        </div>
      );
    case 'http_request':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={text('method') || 'POST'} onValueChange={(v) => set({ method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>URL</Label><Input value={text('url')} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></div>
          </div>
          <div className="space-y-1.5"><Label>Corpo (JSON, pode usar campos)</Label><Textarea rows={4} className="font-mono text-xs" value={text('body')} onChange={(e) => set({ body: e.target.value })} placeholder='{"titulo": "{{trigger.after.title}}"}' /></div>
          <div className="space-y-1.5"><Label>Cabeçalhos (um por linha: Nome: valor)</Label><Textarea rows={2} className="font-mono text-xs" value={text('headers')} onChange={(e) => set({ headers: e.target.value })} /></div>
        </div>
      );
    case 'ai_text':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Pedido para a IA</Label><Textarea rows={4} value={text('prompt')} onChange={(e) => set({ prompt: e.target.value })} placeholder="Escreva um resumo amigável deste chamado: {{trigger.after.title}}…" /></div>
          <p className="text-[11px] text-muted-foreground">
            O texto fica em <span className="font-mono">{`{{steps.${step.id}.result.text}}`}</span>: use num passo "Anotar", "Avisar" ou "Enviar e-mail" depois deste.
          </p>
          <TemplateHint entity={entity} />
        </div>
      );
    case 'stop':
      return <p className="text-sm text-muted-foreground">O fluxo termina aqui.</p>;
    case 'branch': {
      type Branch = { name?: string; filter?: FlowFilter; next?: string[] };
      const branches = (cfg.branches as Branch[] | undefined) ?? [];
      const elseNext = (cfg.else_next as string[] | undefined) ?? [];
      const targets = (refs.steps ?? []).filter((t) => t.id !== step.id);
      const setBranches = (next: Branch[]) => set({ branches: next });
      const NextSelect = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
        <Select value={value[0] ?? NONE} onValueChange={(v) => onChange(v === NONE ? [] : [v])}>
          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>(termina aqui)</SelectItem>
            {targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
      if (!entity) return <p className="text-sm text-muted-foreground">A ramificação olha os campos do registro do gatilho; este gatilho não tem registro.</p>;
      return (
        <div className="space-y-3">
          {branches.map((b, i) => (
            <div key={i} className="rounded-md border p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Ramo</Label>
                <Input className="h-8 w-40" value={b.name ?? ''} placeholder={`Ramo ${i + 1}`} onChange={(e) => setBranches(branches.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Label className="text-xs">→ vai para</Label>
                <NextSelect value={b.next ?? []} onChange={(next) => setBranches(branches.map((x, j) => (j === i ? { ...x, next } : x)))} />
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto text-muted-foreground" onClick={() => setBranches(branches.filter((_, j) => j !== i))} aria-label="Remover ramo"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Label className="text-xs">Quando</Label>
              <FilterEditor entity={entity} value={b.filter} onChange={(filter) => setBranches(branches.map((x, j) => (j === i ? { ...x, filter } : x)))} people={refs.people} categories={refs.categories} stages={refs.stages} />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setBranches([...branches, { name: '', next: [] }])}><Plus className="h-3.5 w-3.5 mr-1" /> Ramo</Button>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">Senão → vai para</Label>
            <NextSelect value={elseNext} onChange={(else_next) => set({ else_next })} />
          </div>
          <p className="text-[11px] text-muted-foreground">O primeiro ramo cujas condições valem é o escolhido; os outros ficam pulados.</p>
        </div>
      );
    }
  }
}
