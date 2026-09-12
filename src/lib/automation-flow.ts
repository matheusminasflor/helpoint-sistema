/**
 * Fluxos de automação (E5, ADR-007) — a parte pura: o formato do gatilho e dos
 * passos (o mesmo que `automation_validate_flow` confere no banco, migration
 * 20260912010000), os catálogos que o editor mostra, e as frases "quando … /
 * então …" da lista. Sem React nem Supabase, para o Vitest importar.
 *
 * Referência: os schemas Zod compartilhados do Twenty
 * (`twenty-shared/src/workflow/schemas/`) — uma fonte valida no servidor e
 * tipa o front. Aqui o servidor é o CHECK do banco; o Zod acusa antes.
 */
import { z } from 'zod';
import { ORDER_STATUS_LABELS } from './crm';

export type AutomationModule = 'tickets' | 'marketing' | 'qualidade' | 'rh' | 'financeiro' | 'comercial' | 'educacional';
export type EntityKind = 'ticket' | 'crm_deal' | 'crm_contact' | 'crm_order';

export const MODULE_LABELS: Record<AutomationModule, string> = {
  tickets: 'TI', marketing: 'Marketing', rh: 'RH', qualidade: 'Qualidade', financeiro: 'Financeiro', comercial: 'Comercial', educacional: 'Educacional',
};

export const TEAM_LABELS: Record<string, string> = {
  ti: 'Equipe de TI', marketing: 'Equipe de Marketing', rh: 'Equipe de RH', qualidade: 'Equipe de Qualidade',
  financeiro: 'Equipe do Financeiro', comercial: 'Equipe Comercial', educacional: 'Equipe do Educacional',
};

export const ENTITY_LABELS: Record<EntityKind, string> = {
  ticket: 'chamado', crm_deal: 'negócio', crm_contact: 'contato', crm_order: 'pedido',
};

/** Quais cadastros cada módulo pode observar: chamado em todos; CRM só no Comercial. */
export function entitiesForModule(module: AutomationModule): EntityKind[] {
  return module === 'comercial' ? ['ticket', 'crm_deal', 'crm_contact', 'crm_order'] : ['ticket'];
}

export const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto', in_progress: 'Em andamento', waiting_user: 'Aguardando usuário', waiting_parts: 'Aguardando peça',
  resolved: 'Resolvido', closed: 'Fechado', cancelled: 'Cancelado', rejected: 'Reprovado',
};
export const PRIORITY_LABELS: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
// Uma lista só de status de pedido (a de `lib/crm.ts`): a condição "status" do fluxo enxerga o ciclo inteiro.
export { ORDER_STATUS_LABELS };
export const WEEKDAY_LABELS: Record<number, string> = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 7: 'domingo' };

/** Campos de cada cadastro que o filtro, a condição e os textos ({{trigger.after.x}}) conhecem. */
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'uuid' | 'date';
  options?: Record<string, string>;
}
export const ENTITY_FIELDS: Record<EntityKind, FieldDef[]> = {
  ticket: [
    { key: 'title', label: 'Título', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_LABELS },
    { key: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY_LABELS },
    { key: 'category_id', label: 'Categoria', type: 'uuid' },
    { key: 'assigned_to', label: 'Responsável', type: 'uuid' },
    { key: 'requester_id', label: 'Solicitante', type: 'uuid' },
    { key: 'ticket_number', label: 'Número', type: 'number' },
    { key: 'due_date', label: 'Prazo', type: 'date' },
  ],
  crm_deal: [
    { key: 'title', label: 'Título', type: 'text' },
    { key: 'value', label: 'Valor', type: 'number' },
    { key: 'stage_id', label: 'Etapa', type: 'uuid' },
    { key: 'owner_id', label: 'Dono', type: 'uuid' },
    { key: 'source', label: 'Origem', type: 'text' },
    { key: 'expected_close_date', label: 'Previsão de fechamento', type: 'date' },
    { key: 'won_at', label: 'Ganho em', type: 'date' },
    { key: 'lost_at', label: 'Perdido em', type: 'date' },
  ],
  crm_contact: [
    { key: 'name', label: 'Nome', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'phone', label: 'Telefone', type: 'text' },
    { key: 'company', label: 'Empresa', type: 'text' },
    { key: 'source', label: 'Origem', type: 'text' },
    { key: 'owner_id', label: 'Dono', type: 'uuid' },
  ],
  crm_order: [
    { key: 'status', label: 'Status', type: 'select', options: ORDER_STATUS_LABELS },
    { key: 'total', label: 'Total', type: 'number' },
    { key: 'number', label: 'Número', type: 'number' },
  ],
};

// ─── Esquemas ────────────────────────────────────────────────────────────────

export const CMP_LABELS = {
  eq: 'é', neq: 'não é', contains: 'contém', is_empty: 'está vazio', not_empty: 'está preenchido',
  gt: 'é maior que', gte: 'é maior ou igual a', lt: 'é menor que', lte: 'é menor ou igual a', in: 'é um de', changed: 'mudou',
} as const;
export type Cmp = keyof typeof CMP_LABELS;

export const filterRuleSchema = z.object({
  path: z.string().min(1),
  cmp: z.enum(['eq', 'neq', 'contains', 'is_empty', 'not_empty', 'gt', 'gte', 'lt', 'lte', 'in', 'changed']),
  value: z.unknown().optional(),
});
export const filterSchema = z.object({
  op: z.enum(['and', 'or']).default('and'),
  rules: z.array(filterRuleSchema).default([]),
});
export type FlowFilter = z.infer<typeof filterSchema>;
export type FilterRule = z.infer<typeof filterRuleSchema>;

const entitySchema = z.enum(['ticket', 'crm_deal', 'crm_contact', 'crm_order']);

export const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('record_created'), entity: entitySchema, filter: filterSchema.optional(), next: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('record_updated'), entity: entitySchema, fields: z.array(z.string()).default([]), filter: filterSchema.optional(), next: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('deadline_expired'), entity: z.literal('ticket'), filter: filterSchema.optional(), next: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('schedule'), every: z.enum(['day', 'week']), weekday: z.number().int().min(1).max(7).optional(), time: z.string().regex(/^\d{2}:\d{2}$/, 'hora no formato HH:MM'), next: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('webhook'), next: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('manual'), entity: entitySchema, next: z.array(z.string()).default([]) }),
]);
export type FlowTrigger = z.infer<typeof triggerSchema>;
export type TriggerKind = FlowTrigger['kind'];

export const STEP_KINDS = [
  'notify', 'create_task', 'create_ticket', 'assign', 'set_priority', 'set_stage', 'update_record',
  'create_deal', 'add_note', 'create_calendar_event', 'condition', 'delay', 'stop',
  'send_email', 'http_request', 'ai_text', 'branch', 'create_receivable',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const stepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(STEP_KINDS),
  name: z.string().max(80).optional(),
  config: z.record(z.unknown()).default({}),
  next: z.array(z.string()).default([]),
  continue_on_failure: z.boolean().optional(),
  retry: z.number().int().min(0).max(3).optional(),
});
export type FlowStep = z.infer<typeof stepSchema>;

export const flowSchema = z.object({ trigger: triggerSchema, steps: z.array(stepSchema) });

/** Catálogo dos passos: rótulo, para quais cadastros vale, e se é externo (worker, leva A2). */
export interface StepDef {
  kind: StepKind;
  label: string;
  hint: string;
  entities?: EntityKind[];
  external?: boolean;
  /** Fica fora do menu do editor (A3 ou exige contexto que o editor em lista não tem). */
  hidden?: boolean;
}
export const STEP_CATALOG: StepDef[] = [
  { kind: 'notify', label: 'Avisar', hint: 'Sino para uma pessoa ou uma equipe' },
  { kind: 'create_task', label: 'Criar tarefa', hint: 'Tarefa para uma pessoa, com prazo em dias' },
  { kind: 'create_ticket', label: 'Abrir chamado', hint: 'Chamado em qualquer módulo' },
  { kind: 'assign', label: 'Atribuir', hint: 'Responsável do chamado, dono do negócio ou do contato', entities: ['ticket', 'crm_deal', 'crm_contact'] },
  { kind: 'set_priority', label: 'Mudar prioridade', hint: 'Do chamado', entities: ['ticket'] },
  { kind: 'set_stage', label: 'Mudar etapa', hint: 'Do negócio no funil', entities: ['crm_deal'] },
  { kind: 'update_record', label: 'Atualizar campos', hint: 'Um ou mais campos do registro, inclusive personalizados', entities: ['ticket', 'crm_deal', 'crm_contact', 'crm_order'] },
  { kind: 'create_deal', label: 'Criar negócio', hint: 'Para o contato do gatilho', entities: ['crm_contact', 'crm_deal'] },
  { kind: 'add_note', label: 'Anotar', hint: 'Nota no negócio ou comentário interno no chamado', entities: ['ticket', 'crm_deal'] },
  { kind: 'create_calendar_event', label: 'Agendar', hint: 'Evento na agenda de uma pessoa, daqui a N dias' },
  { kind: 'condition', label: 'Só continuar se…', hint: 'Se a condição não valer, o fluxo para aqui' },
  { kind: 'delay', label: 'Esperar', hint: 'Minutos, horas ou dias; o fluxo continua depois' },
  { kind: 'stop', label: 'Parar', hint: 'Encerra o fluxo' },
  { kind: 'send_email', label: 'Enviar e-mail', hint: 'Para um endereço ou para o e-mail do registro', external: true },
  { kind: 'http_request', label: 'Chamar outro sistema', hint: 'Requisição HTTP (webhook de saída)', external: true },
  { kind: 'ai_text', label: 'Gerar texto com IA', hint: 'Lyra escreve a partir de um pedido e do registro', external: true },
  { kind: 'branch', label: 'Ramificar', hint: 'Caminhos diferentes conforme condições' },
  { kind: 'create_receivable', label: 'Criar conta a receber', hint: 'No Financeiro, com o valor do pedido', entities: ['crm_order'] },
];

export const STEP_LABELS: Record<StepKind, string> = Object.fromEntries(STEP_CATALOG.map((s) => [s.kind, s.label])) as Record<StepKind, string>;

/** Novo id de passo, curto e único dentro do fluxo. */
export function newStepId(existing: FlowStep[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let i = existing.length + 1;
  while (taken.has(`s${i}`)) i++;
  return `s${i}`;
}

/** Passos em lista (editor da A1): cada um aponta para o seguinte, o gatilho para o primeiro. */
export function linkLinear(trigger: FlowTrigger, steps: FlowStep[]): { trigger: FlowTrigger; steps: FlowStep[] } {
  const linked = steps.map((s, i) => ({ ...s, next: i < steps.length - 1 ? [steps[i + 1].id] : [] }));
  return { trigger: { ...trigger, next: linked.length ? [linked[0].id] : [] }, steps: linked };
}

/** A ordem de leitura dos passos a partir do gatilho (para lista e canvas): segue `next` em profundidade. */
export function orderSteps(trigger: FlowTrigger, steps: FlowStep[]): FlowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: FlowStep[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    const s = byId.get(id);
    if (!s) return;
    seen.add(id);
    out.push(s);
    for (const n of s.next) visit(n);
  };
  for (const n of trigger.next) visit(n);
  for (const s of steps) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
  return out;
}

// ─── Frases ──────────────────────────────────────────────────────────────────

export interface PersonRef { id: string; name: string }
export interface NamedRef { id: string; name: string }

export interface DescribeContext {
  people: PersonRef[];
  categories?: NamedRef[];
  stages?: NamedRef[];
}

function fieldLabel(entity: EntityKind | undefined, path: string): string {
  const key = path.replace(/^trigger\.(after|before)\./, '');
  const def = entity ? ENTITY_FIELDS[entity].find((f) => f.key === key) : undefined;
  return def?.label ?? key;
}

function valueLabel(entity: EntityKind | undefined, path: string, value: unknown, ctx: DescribeContext): string {
  const key = path.replace(/^trigger\.(after|before)\./, '');
  const def = entity ? ENTITY_FIELDS[entity].find((f) => f.key === key) : undefined;
  if (Array.isArray(value)) return value.map((v) => valueLabel(entity, path, v, ctx)).join(', ');
  const v = String(value ?? '');
  if (def?.options?.[v]) return def.options[v];
  if (key === 'category_id') return ctx.categories?.find((c) => c.id === v)?.name ?? v;
  if (key === 'stage_id') return ctx.stages?.find((s) => s.id === v)?.name ?? v;
  if (key.endsWith('_id') || key === 'assigned_to') return ctx.people.find((p) => p.id === v)?.name ?? v;
  return v;
}

export function describeFilter(filter: FlowFilter | undefined, entity: EntityKind | undefined, ctx: DescribeContext): string {
  if (!filter || filter.rules.length === 0) return '';
  const parts = filter.rules.map((r) => {
    const f = fieldLabel(entity, r.path);
    if (r.cmp === 'is_empty' || r.cmp === 'not_empty' || r.cmp === 'changed') return `${f} ${CMP_LABELS[r.cmp]}`;
    return `${f} ${CMP_LABELS[r.cmp]} ${valueLabel(entity, r.path, r.value, ctx)}`;
  });
  return parts.join(filter.op === 'or' ? ' ou ' : ' e ');
}

export function describeTrigger(trigger: FlowTrigger, ctx: DescribeContext): string {
  switch (trigger.kind) {
    case 'record_created': {
      const f = describeFilter(trigger.filter, trigger.entity, ctx);
      return `um ${ENTITY_LABELS[trigger.entity]} é criado${f ? ` (${f})` : ''}`;
    }
    case 'record_updated': {
      const f = describeFilter(trigger.filter, trigger.entity, ctx);
      const fields = trigger.fields.map((k) => fieldLabel(trigger.entity, k).toLowerCase());
      const what = fields.length ? `muda ${fields.join(' ou ')}` : 'é alterado';
      return `um ${ENTITY_LABELS[trigger.entity]} ${what}${f ? ` (${f})` : ''}`;
    }
    case 'deadline_expired': {
      const f = describeFilter(trigger.filter, 'ticket', ctx);
      return `o prazo de um chamado estoura${f ? ` (${f})` : ''}`;
    }
    case 'schedule':
      return `${trigger.every === 'week' ? `toda ${WEEKDAY_LABELS[trigger.weekday ?? 1]}` : 'todo dia'} às ${trigger.time}`;
    case 'webhook':
      return 'outro sistema chama o endereço do fluxo';
    case 'manual':
      return `alguém aciona pelo botão em um ${ENTITY_LABELS[trigger.entity]}`;
  }
}

function personFromConfig(config: Record<string, unknown>, ctx: DescribeContext): string {
  if (typeof config.user_id === 'string') return ctx.people.find((p) => p.id === config.user_id)?.name ?? 'a pessoa escolhida';
  if (typeof config.team_module === 'string') return TEAM_LABELS[config.team_module] ?? config.team_module;
  const target = config.target;
  if (target === 'owner') return 'o dono';
  if (target === 'assignee') return 'o responsável';
  if (target === 'requester') return 'o solicitante';
  if (target === 'created_by') return 'quem criou';
  return 'alguém';
}

export function describeStep(step: FlowStep, entity: EntityKind | undefined, ctx: DescribeContext): string {
  const c = step.config as Record<string, unknown>;
  switch (step.kind) {
    case 'notify': return `avisar ${personFromConfig(c, ctx)}`;
    case 'create_task': return `criar tarefa para ${personFromConfig(c, ctx)}`;
    case 'create_ticket': return `abrir chamado${typeof c.module === 'string' ? ` em ${MODULE_LABELS[c.module as AutomationModule] ?? c.module}` : ''}`;
    case 'assign': return `atribuir a ${personFromConfig(c, ctx)}`;
    case 'set_priority': return `mudar a prioridade para ${PRIORITY_LABELS[String(c.priority)] ?? '?'}`;
    case 'set_stage': return `mover para a etapa ${ctx.stages?.find((s) => s.id === c.stage_id)?.name ?? '?'}${typeof c.lost_reason === 'string' && c.lost_reason ? ` (motivo: ${c.lost_reason})` : ''}`;
    case 'create_receivable': return `criar conta a receber${c.due_in_days ? ` para ${c.due_in_days} dia(s)` : ''}`;
    case 'update_record': return `atualizar ${Object.keys((c.fields as Record<string, unknown>) ?? {}).map((k) => fieldLabel(entity, k).toLowerCase()).join(', ') || 'campos'}`;
    case 'create_deal': return 'criar negócio';
    case 'add_note': return 'anotar';
    case 'create_calendar_event': return `agendar para ${personFromConfig(c, ctx)}`;
    case 'condition': return `só continuar se ${describeFilter(c.filter as FlowFilter | undefined, entity, ctx) || '…'}${c.refresh ? ' (olhando o registro de novo)' : ''}`;
    case 'delay': {
      const parts = [c.days ? `${c.days} dia(s)` : '', c.hours ? `${c.hours} hora(s)` : '', c.minutes ? `${c.minutes} minuto(s)` : ''].filter(Boolean);
      return c.until_path ? `esperar até ${fieldLabel(entity, String(c.until_path)).toLowerCase()}` : `esperar ${parts.join(' e ') || '…'}`;
    }
    case 'stop': return 'parar';
    case 'send_email': return `enviar e-mail${typeof c.to === 'string' ? ` para ${c.to}` : ''}`;
    case 'http_request': return `chamar ${typeof c.url === 'string' ? c.url : 'outro sistema'}`;
    case 'ai_text': return 'gerar texto com IA';
    case 'branch': return 'ramificar';
  }
}

/** "Quando … → então …" da lista de fluxos. */
export function describeFlow(trigger: FlowTrigger, steps: FlowStep[], ctx: DescribeContext): { quando: string; entao: string } {
  const entity = 'entity' in trigger ? trigger.entity : undefined;
  const ordered = orderSteps(trigger, steps);
  return {
    quando: describeTrigger(trigger, ctx),
    entao: ordered.length ? ordered.map((s) => describeStep(s, entity, ctx)).join(', depois ') : 'nada ainda',
  };
}

/** Confere o fluxo antes de mandar ao banco; devolve a primeira mensagem, ou null. */
export function validateFlow(trigger: unknown, steps: unknown): string | null {
  const parsed = flowSchema.safeParse({ trigger, steps });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `${issue.path.join('.') || 'fluxo'}: ${issue.message}`;
  }
  const ids = new Set<string>();
  for (const s of parsed.data.steps) {
    if (ids.has(s.id)) return `id de passo repetido: ${s.id}`;
    ids.add(s.id);
  }
  for (const n of parsed.data.trigger.next) if (!ids.has(n)) return `o gatilho aponta para passo inexistente: ${n}`;
  for (const s of parsed.data.steps) for (const n of s.next) if (!ids.has(n)) return `o passo ${s.id} aponta para passo inexistente: ${n}`;
  return null;
}

// ─── Diagrama (A3): o fluxo como nós e arestas; a posição é do dagre, no componente ─

export interface DiagramNode {
  id: string;
  kind: 'trigger' | StepKind;
  label: string;
  /** Status do passo num run, quando o diagrama mostra uma execução. */
  status?: string;
}
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export const TRIGGER_NODE_ID = '__trigger__';

/** Nós e arestas de um fluxo: o gatilho, cada passo, e as setas de `next` e dos ramos. */
export function flowToDiagram(
  trigger: FlowTrigger,
  steps: FlowStep[],
  ctx: DescribeContext,
  stepStatus?: Record<string, { status?: string } | undefined>,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const entity = 'entity' in trigger ? trigger.entity : undefined;
  const nodes: DiagramNode[] = [{ id: TRIGGER_NODE_ID, kind: 'trigger', label: describeTrigger(trigger, ctx) }];
  const edges: DiagramEdge[] = [];
  const known = new Set(steps.map((s) => s.id));
  const push = (source: string, target: string, label?: string) => {
    if (!known.has(target)) return;
    edges.push({ id: `${source}->${target}${label ? `:${label}` : ''}`, source, target, label });
  };
  for (const n of trigger.next) push(TRIGGER_NODE_ID, n);
  for (const s of steps) {
    nodes.push({ id: s.id, kind: s.kind, label: describeStep(s, entity, ctx), status: stepStatus?.[s.id]?.status });
    if (s.kind === 'branch') {
      const cfg = s.config as { branches?: { name?: string; next?: string[] }[]; else_next?: string[] };
      for (const b of cfg.branches ?? []) for (const n of b.next ?? []) push(s.id, n, b.name || 'se');
      for (const n of cfg.else_next ?? []) push(s.id, n, 'senão');
    }
    for (const n of s.next) push(s.id, n);
  }
  return { nodes, edges };
}

/** Fluxo com ramificação: o editor deixa de ligar em cadeia e cada passo diz para onde vai. */
export function hasBranch(steps: FlowStep[]): boolean {
  return steps.some((s) => s.kind === 'branch');
}

/** Tira um passo do fluxo e apaga toda referência a ele (gatilho, `next`, ramos e "senão"). */
export function dropStep(trigger: FlowTrigger, steps: FlowStep[], id: string): { trigger: FlowTrigger; steps: FlowStep[] } {
  const without = (ids: string[] | undefined) => (ids ?? []).filter((n) => n !== id);
  return {
    trigger: { ...trigger, next: without(trigger.next) },
    steps: steps.filter((s) => s.id !== id).map((s) => {
      const base = { ...s, next: without(s.next) };
      if (s.kind !== 'branch') return base;
      const cfg = s.config as { branches?: { next?: string[] }[]; else_next?: string[] };
      return {
        ...base,
        config: {
          ...s.config,
          branches: (cfg.branches ?? []).map((b) => ({ ...b, next: without(b.next) })),
          else_next: without(cfg.else_next),
        },
      };
    }),
  };
}

/** Passos que ninguém aponta (nem o gatilho, nem outro passo, nem um ramo): o editor avisa que ficaram soltos. */
export function orphanSteps(trigger: FlowTrigger, steps: FlowStep[]): string[] {
  const pointed = new Set<string>(trigger.next);
  for (const s of steps) {
    for (const n of s.next) pointed.add(n);
    if (s.kind === 'branch') {
      const cfg = s.config as { branches?: { next?: string[] }[]; else_next?: string[] };
      for (const b of cfg.branches ?? []) for (const n of b.next ?? []) pointed.add(n);
      for (const n of cfg.else_next ?? []) pointed.add(n);
    }
  }
  return steps.filter((s) => !pointed.has(s.id)).map((s) => s.id);
}
