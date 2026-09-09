import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTICategories, formatTICategoryLabel } from '@/hooks/useTICategories';
import { useTechnicians } from '@/hooks/useTechnicians';
import {
  useAutomationRules,
  useSaveAutomationRule,
  useDeleteAutomationRule,
  useToggleAutomationRule,
  TRIGGER_LABELS,
  ACTION_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TEAM_LABELS,
  WEEKDAY_LABELS,
  MODULE_TARGET_LABELS,
  type AutomationModule,
  type AutomationRule,
  type TriggerKind,
  type ActionKind,
} from '@/hooks/useAutomationRules';
import { describeRule } from '@/lib/automation-rules';

interface AutomationsTabProps {
  module: AutomationModule;
}

interface FormState {
  id?: string;
  name: string;
  trigger_kind: TriggerKind;
  status?: string;
  category_id?: string;
  priority?: string;
  schedule_every: 'day' | 'week';
  schedule_weekday: number;
  schedule_time: string;
  action_kind: ActionKind;
  notify_target: 'person' | 'team';
  notify_user_id?: string;
  notify_team_module?: string;
  notify_title: string;
  notify_message: string;
  ct_module: AutomationModule;
  ct_title: string;
  ct_description: string;
  ct_priority?: string;
  ct_assigned_to?: string;
  task_user_id?: string;
  task_title: string;
  task_description: string;
  task_due_in_days: string;
  assign_user_id?: string;
  set_priority_value?: string;
}

function emptyForm(module: AutomationModule): FormState {
  return {
    name: '',
    trigger_kind: 'ticket_created',
    schedule_every: 'day',
    schedule_weekday: 1,
    schedule_time: '',
    action_kind: 'notify',
    notify_target: 'person',
    notify_title: '',
    notify_message: '',
    ct_module: module,
    ct_title: '',
    ct_description: '',
    task_title: '',
    task_description: '',
    task_due_in_days: '',
  };
}

function formFromRule(rule: AutomationRule, module: AutomationModule): FormState {
  const tc = (rule.trigger_config ?? {}) as Record<string, unknown>;
  const ac = (rule.action_config ?? {}) as Record<string, unknown>;
  const triggerKind = rule.trigger_kind as TriggerKind;
  const actionKind = rule.action_kind as ActionKind;

  return {
    id: rule.id,
    name: rule.name,
    trigger_kind: triggerKind,
    status: typeof tc.status === 'string' ? tc.status : undefined,
    category_id: typeof tc.category_id === 'string' ? tc.category_id : undefined,
    priority: typeof tc.priority === 'string' ? tc.priority : undefined,
    schedule_every: tc.every === 'week' ? 'week' : 'day',
    schedule_weekday: typeof tc.weekday === 'number' ? tc.weekday : 1,
    schedule_time: typeof tc.time === 'string' ? tc.time : '',
    action_kind: actionKind,
    notify_target: actionKind === 'notify' && typeof ac.team_module === 'string' ? 'team' : 'person',
    notify_user_id: actionKind === 'notify' && typeof ac.user_id === 'string' ? ac.user_id : undefined,
    notify_team_module: actionKind === 'notify' && typeof ac.team_module === 'string' ? ac.team_module : undefined,
    notify_title: actionKind === 'notify' && typeof ac.title === 'string' ? ac.title : '',
    notify_message: actionKind === 'notify' && typeof ac.message === 'string' ? ac.message : '',
    ct_module: actionKind === 'create_ticket' && typeof ac.module === 'string' ? (ac.module as AutomationModule) : module,
    ct_title: actionKind === 'create_ticket' && typeof ac.title === 'string' ? ac.title : '',
    ct_description: actionKind === 'create_ticket' && typeof ac.description === 'string' ? ac.description : '',
    ct_priority: actionKind === 'create_ticket' && typeof ac.priority === 'string' ? ac.priority : undefined,
    ct_assigned_to: actionKind === 'create_ticket' && typeof ac.assigned_to === 'string' ? ac.assigned_to : undefined,
    task_user_id: actionKind === 'create_task' && typeof ac.user_id === 'string' ? ac.user_id : undefined,
    task_title: actionKind === 'create_task' && typeof ac.title === 'string' ? ac.title : '',
    task_description: actionKind === 'create_task' && typeof ac.description === 'string' ? ac.description : '',
    task_due_in_days: actionKind === 'create_task' && typeof ac.due_in_days === 'number' ? String(ac.due_in_days) : '',
    assign_user_id: actionKind === 'assign' && typeof ac.user_id === 'string' ? ac.user_id : undefined,
    set_priority_value: actionKind === 'set_priority' && typeof ac.priority === 'string' ? ac.priority : undefined,
  };
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = value;
  }
  return result;
}

function buildTriggerConfig(form: FormState): Record<string, unknown> {
  if (form.trigger_kind === 'schedule') {
    return compact({
      every: form.schedule_every,
      weekday: form.schedule_every === 'week' ? form.schedule_weekday : undefined,
      time: form.schedule_time,
    });
  }
  return compact({
    category_id: form.category_id,
    priority: form.priority,
    status: form.trigger_kind === 'ticket_status_changed' ? form.status : undefined,
  });
}

function buildActionConfig(form: FormState): Record<string, unknown> {
  switch (form.action_kind) {
    case 'notify':
      return compact({
        user_id: form.notify_target === 'person' ? form.notify_user_id : undefined,
        team_module: form.notify_target === 'team' ? form.notify_team_module : undefined,
        title: form.notify_title,
        message: form.notify_message,
      });
    case 'create_ticket':
      return compact({
        module: form.ct_module,
        title: form.ct_title,
        description: form.ct_description,
        priority: form.ct_priority,
        assigned_to: form.ct_assigned_to,
      });
    case 'create_task':
      return compact({
        user_id: form.task_user_id,
        title: form.task_title,
        description: form.task_description,
        due_in_days: form.task_due_in_days ? Number(form.task_due_in_days) : undefined,
      });
    case 'assign':
      return compact({ user_id: form.assign_user_id });
    case 'set_priority':
      return compact({ priority: form.set_priority_value });
    default:
      return {};
  }
}

function validateForm(form: FormState): string | null {
  if (!form.name.trim()) return 'Dê um nome para a regra.';
  if (form.trigger_kind === 'ticket_status_changed' && !form.status) return 'Escolha o status do chamado.';
  if (form.trigger_kind === 'schedule' && !form.schedule_time) return 'Escolha o horário.';
  if (form.action_kind === 'notify' && form.notify_target === 'person' && !form.notify_user_id) {
    return 'Escolha a pessoa a avisar.';
  }
  if (form.action_kind === 'notify' && form.notify_target === 'team' && !form.notify_team_module) {
    return 'Escolha a equipe a avisar.';
  }
  if (form.action_kind === 'assign' && !form.assign_user_id) return 'Escolha quem vai receber o chamado.';
  if (form.action_kind === 'set_priority' && !form.set_priority_value) return 'Escolha a prioridade.';
  return null;
}

const HINT = 'Pode usar {numero}, {titulo} e {status} do chamado.';

export function AutomationsTab({ module }: AutomationsTabProps) {
  const { role } = useAuth();
  const canEdit = ['owner', 'admin', 'manager'].includes(role ?? '');

  const { data: rules = [], isLoading } = useAutomationRules(module);
  const { categories } = useTICategories(module);
  const { data: technicians = [] } = useTechnicians();
  const saveRule = useSaveAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const toggleRule = useToggleAutomationRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(module));
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);

  const people = useMemo(
    () => technicians.map((t) => ({ id: t.id, name: t.full_name || t.email })),
    [technicians],
  );
  const categoryRefs = useMemo(
    () => categories.map((c) => ({ id: c.id, name: formatTICategoryLabel(c, categories) })),
    [categories],
  );

  const availableActions = (Object.keys(ACTION_LABELS) as ActionKind[]).filter(
    (a) => form.trigger_kind !== 'schedule' || (a !== 'assign' && a !== 'set_priority'),
  );

  const openCreate = () => {
    setForm(emptyForm(module));
    setDialogOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setForm(formFromRule(rule, module));
    setDialogOpen(true);
  };

  const handleTriggerChange = (kind: TriggerKind) => {
    setForm((f) => {
      const next = { ...f, trigger_kind: kind };
      if (kind === 'schedule' && (f.action_kind === 'assign' || f.action_kind === 'set_priority')) {
        next.action_kind = 'notify';
      }
      return next;
    });
  };

  const handleSave = () => {
    const error = validateForm(form);
    if (error) {
      toast.error(error);
      return;
    }

    saveRule.mutate(
      {
        id: form.id,
        name: form.name.trim(),
        module,
        trigger_kind: form.trigger_kind,
        trigger_config: buildTriggerConfig(form),
        action_kind: form.action_kind,
        action_config: buildActionConfig(form),
      },
      { onSuccess: () => setDialogOpen(false) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Automações</CardTitle>
          <CardDescription>
            Regras do tipo «quando … → então …», executadas pelo próprio sistema.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nova regra
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : rules.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma regra ainda. Crie a primeira: quando algo acontece, o sistema faz algo por você.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => {
              const { quando, entao } = describeRule(rule, people, categoryRefs);
              return (
                <div key={rule.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{rule.name}</span>
                        {!rule.is_active && <Badge variant="outline">Inativa</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quando {quando} → {entao}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rule.last_run_at
                          ? `Última execução: ${formatDistanceToNow(new Date(rule.last_run_at), { addSuffix: true, locale: ptBR })}`
                          : 'Nunca rodou'}
                      </p>
                      {rule.last_error && (
                        <Badge variant="destructive" className="mt-1.5">
                          {rule.last_error}
                        </Badge>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, is_active: checked })}
                        />
                        <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}>
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(rule)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar regra' : 'Nova regra'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Avisar TI quando abrir chamado urgente"
              />
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label className="text-xs uppercase text-muted-foreground">Quando</Label>
              <Select value={form.trigger_kind} onValueChange={(v) => handleTriggerChange(v as TriggerKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TRIGGER_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {form.trigger_kind === 'ticket_status_changed' && (
                <div>
                  <Label className="text-xs">Status *</Label>
                  <Select value={form.status ?? ''} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.trigger_kind !== 'schedule' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <Select
                      value={form.category_id ?? '__any__'}
                      onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === '__any__' ? undefined : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Qualquer</SelectItem>
                        {categoryRefs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <Select
                      value={form.priority ?? '__any__'}
                      onValueChange={(v) => setForm((f) => ({ ...f, priority: v === '__any__' ? undefined : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Qualquer</SelectItem>
                        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {form.trigger_kind === 'schedule' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Frequência</Label>
                    <Select
                      value={form.schedule_every}
                      onValueChange={(v) => setForm((f) => ({ ...f, schedule_every: v as 'day' | 'week' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Todo dia</SelectItem>
                        <SelectItem value="week">Toda semana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.schedule_every === 'week' && (
                    <div>
                      <Label className="text-xs">Dia</Label>
                      <Select
                        value={String(form.schedule_weekday)}
                        onValueChange={(v) => setForm((f) => ({ ...f, schedule_weekday: Number(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Hora *</Label>
                    <Input
                      type="time"
                      value={form.schedule_time}
                      onChange={(e) => setForm((f) => ({ ...f, schedule_time: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label className="text-xs uppercase text-muted-foreground">Então</Label>
              <Select value={form.action_kind} onValueChange={(v) => setForm((f) => ({ ...f, action_kind: v as ActionKind }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ACTION_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {form.action_kind === 'notify' && (
                <div className="space-y-2">
                  <RadioGroup
                    value={form.notify_target}
                    onValueChange={(v) => setForm((f) => ({ ...f, notify_target: v as 'person' | 'team' }))}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="person" id="notify-person" />
                      <label htmlFor="notify-person" className="text-sm cursor-pointer">
                        Uma pessoa
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="team" id="notify-team" />
                      <label htmlFor="notify-team" className="text-sm cursor-pointer">
                        Uma equipe
                      </label>
                    </div>
                  </RadioGroup>
                  {form.notify_target === 'person' ? (
                    <Select
                      value={form.notify_user_id ?? ''}
                      onValueChange={(v) => setForm((f) => ({ ...f, notify_user_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha a pessoa" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={form.notify_team_module ?? ''}
                      onValueChange={(v) => setForm((f) => ({ ...f, notify_team_module: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha a equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TEAM_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    placeholder="Título (opcional)"
                    value={form.notify_title}
                    onChange={(e) => setForm((f) => ({ ...f, notify_title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Mensagem (opcional)"
                    value={form.notify_message}
                    onChange={(e) => setForm((f) => ({ ...f, notify_message: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">{HINT}</p>
                </div>
              )}

              {form.action_kind === 'create_ticket' && (
                <div className="space-y-2">
                  <Select
                    value={form.ct_module}
                    onValueChange={(v) => setForm((f) => ({ ...f, ct_module: v as AutomationModule }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODULE_TARGET_LABELS) as AutomationModule[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {MODULE_TARGET_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Título (opcional)"
                    value={form.ct_title}
                    onChange={(e) => setForm((f) => ({ ...f, ct_title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Descrição (opcional)"
                    value={form.ct_description}
                    onChange={(e) => setForm((f) => ({ ...f, ct_description: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={form.ct_priority ?? '__any__'}
                      onValueChange={(v) => setForm((f) => ({ ...f, ct_priority: v === '__any__' ? undefined : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Prioridade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Qualquer</SelectItem>
                        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={form.ct_assigned_to ?? '__none__'}
                      onValueChange={(v) => setForm((f) => ({ ...f, ct_assigned_to: v === '__none__' ? undefined : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {people.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">{HINT}</p>
                </div>
              )}

              {form.action_kind === 'create_task' && (
                <div className="space-y-2">
                  <Select
                    value={form.task_user_id ?? '__none__'}
                    onValueChange={(v) => setForm((f) => ({ ...f, task_user_id: v === '__none__' ? undefined : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {form.trigger_kind === 'schedule' ? 'Quem criou a regra' : 'Quem estiver atendendo o chamado'}
                      </SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Título (opcional)"
                    value={form.task_title}
                    onChange={(e) => setForm((f) => ({ ...f, task_title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Descrição (opcional)"
                    value={form.task_description}
                    onChange={(e) => setForm((f) => ({ ...f, task_description: e.target.value }))}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Vence em N dias (opcional)"
                    value={form.task_due_in_days}
                    onChange={(e) => setForm((f) => ({ ...f, task_due_in_days: e.target.value }))}
                  />
                </div>
              )}

              {form.action_kind === 'assign' && (
                <Select value={form.assign_user_id ?? ''} onValueChange={(v) => setForm((f) => ({ ...f, assign_user_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a pessoa *" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {form.action_kind === 'set_priority' && (
                <Select
                  value={form.set_priority_value ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, set_priority_value: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a prioridade *" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveRule.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a regra «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteRule.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
