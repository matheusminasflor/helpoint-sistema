import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRightLeftIcon, Banknote, Bot, Check, MessageSquare, Package,
  Phone, Plus, ShoppingCart, Trophy, XCircle, Copy,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTechnicians } from '@/hooks/useTechnicians';
import {
  useDeal, useCRMStages, useCRMPipelines, useSaveDeal, useSetDealStage,
  useDealActivities, useAddNote,
  useDealTasks, useAddDealTask, useCompleteTask,
  useDealOrders,
  type CRMDealActivityWithAuthor,
} from '@/hooks/useCRM';
import { formatBRL, SOURCE_LABELS, ORDER_STATUS_LABELS, ACTIVITY_LABELS } from '@/lib/crm';
import { CustomFieldsForm } from '@/components/crm/CustomFieldsForm';
import { ManualAutomationsMenu } from '@/components/automations/ManualAutomationsMenu';
import { useCustomFields } from '@/hooks/useCustomFields';
import { validateCustomValues, type CustomValues } from '@/lib/custom-fields';

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  stage_change: ArrowRightLeftIcon,
  task: Check,
  order: ShoppingCart,
  payment: Banknote,
  system: Bot,
};

const onlyDigits = (v: string) => v.replace(/\D/g, '');

function ActivityItem({ activity }: { activity: CRMDealActivityWithAuthor }) {
  const Icon = ACTIVITY_ICONS[activity.kind] ?? Bot;
  return (
    <div className="flex gap-3">
      <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{activity.content}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {ACTIVITY_LABELS[activity.kind] ?? activity.kind} · {activity.author?.full_name ?? 'Sistema'} ·{' '}
          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </div>
    </div>
  );
}

export default function ComercialNegocio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();

  const { data: deal, isLoading: dealLoading } = useDeal(id);
  const { data: stages = [] } = useCRMStages();
  const { data: pipelines = [] } = useCRMPipelines();
  const { data: technicians = [] } = useTechnicians();
  const saveDeal = useSaveDeal();
  const setDealStage = useSetDealStage();

  const { data: activities = [] } = useDealActivities(id);
  const addNote = useAddNote(id ?? '');
  const [note, setNote] = useState('');

  const { data: tasks = [] } = useDealTasks(id);
  const addTask = useAddDealTask();
  const completeTask = useCompleteTask();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskUserId, setTaskUserId] = useState<string | undefined>();
  const [taskDueDate, setTaskDueDate] = useState('');

  const { data: orders = [] } = useDealOrders(id);

  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const [form, setForm] = useState<{
    title: string; value: string; stage_id: string; owner_id?: string; source: string; expected_close_date: string; custom: CustomValues;
  } | null>(null);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const { data: dealCustomFields = [] } = useCustomFields('deal');

  useEffect(() => {
    if (deal) {
      setForm({
        title: deal.title,
        value: String(deal.value),
        stage_id: deal.stage_id,
        owner_id: deal.owner_id ?? undefined,
        source: deal.source,
        expected_close_date: deal.expected_close_date ?? '',
        custom: (deal.custom as CustomValues) ?? {},
      });
    }
  }, [deal]);

  // "Ganho"/"Perdido" são os do funil em que o negócio está (E1: vários funis por empresa).
  const currentPipelineId = stages.find((s) => s.id === deal?.stage_id)?.pipeline_id;
  const wonStage = stages.find((s) => s.kind === 'won' && s.pipeline_id === currentPipelineId);
  const lostStage = stages.find((s) => s.kind === 'lost' && s.pipeline_id === currentPipelineId);

  const hasChanges = useMemo(() => {
    if (!deal || !form) return false;
    return (
      form.title !== deal.title ||
      Number(form.value) !== deal.value ||
      form.stage_id !== deal.stage_id ||
      (form.owner_id ?? '') !== (deal.owner_id ?? '') ||
      form.source !== deal.source ||
      form.expected_close_date !== (deal.expected_close_date ?? '') ||
      JSON.stringify(form.custom) !== JSON.stringify(deal.custom ?? {})
    );
  }, [deal, form]);

  const handleSaveDeal = () => {
    if (!deal || !form) return;
    const errors = validateCustomValues(dealCustomFields, form.custom);
    setCustomErrors(errors);
    if (Object.keys(errors).length > 0) return;
    saveDeal.mutate({
      id: deal.id,
      contact_id: deal.contact_id,
      title: form.title.trim(),
      value: Number(form.value) || 0,
      stage_id: form.stage_id,
      owner_id: form.owner_id ?? null,
      source: form.source,
      expected_close_date: form.expected_close_date || null,
      custom: form.custom,
    });
  };

  const handleMarkWon = () => {
    if (!deal || !wonStage) return;
    setDealStage.mutate({ id: deal.id, stage_id: wonStage.id });
  };

  const handleMarkLost = () => {
    if (!deal || !lostStage || !lostReason.trim()) {
      toast.error('Diga o motivo da perda.');
      return;
    }
    setDealStage.mutate(
      { id: deal.id, stage_id: lostStage.id, lost_reason: lostReason.trim() },
      { onSuccess: () => { setLostDialogOpen(false); setLostReason(''); } },
    );
  };

  const handleAddNote = () => {
    if (!note.trim()) return;
    addNote.mutate(note.trim(), { onSuccess: () => setNote('') });
  };

  const handleAddTask = () => {
    if (!deal || !taskTitle.trim() || !taskUserId) {
      toast.error('Escolha o título e para quem é a tarefa.');
      return;
    }
    const person = technicians.find((t) => t.id === taskUserId);
    addTask.mutate(
      {
        deal_id: deal.id,
        user_id: taskUserId,
        user_name: person?.full_name || person?.email || 'alguém',
        title: taskTitle.trim(),
        due_date: taskDueDate || null,
      },
      {
        onSuccess: () => {
          setTaskDialogOpen(false);
          setTaskTitle('');
          setTaskUserId(undefined);
          setTaskDueDate('');
        },
      },
    );
  };

  const copyOrderLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copiado.');
  };

  if (dealLoading || !deal || !form) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const whatsappDigits = onlyDigits(deal.contact.whatsapp ?? '');
  const isClosed = !!deal.won_at || !!deal.lost_at;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={deal.title}
        description={deal.contact.company ? `${deal.contact.name} — ${deal.contact.company}` : deal.contact.name}
        onBack={() => navigate(tenantPath('/comercial/funil'))}
        actions={
          <div className="flex gap-2">
            <ManualAutomationsMenu entity="crm_deal" subjectId={deal.id} />
            {!isClosed && (
              <>
              <Button variant="outline" onClick={() => setLostDialogOpen(true)}>
                <XCircle className="w-4 h-4 mr-1.5 text-destructive" /> Marcar como perdido
              </Button>
              <Button onClick={handleMarkWon} disabled={setDealStage.isPending}>
                <Trophy className="w-4 h-4 mr-1.5" /> Marcar como ganho
              </Button>
              </>
            )}
          </div>
        }
      />

      <div className="p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Esquerda: dados do negócio e do contato */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Negócio</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm((f) => f && { ...f, value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Etapa</Label>
                <Select value={form.stage_id} onValueChange={(v) => setForm((f) => f && { ...f, stage_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectGroup key={p.id}>
                        {pipelines.length > 1 && <SelectLabel>{p.name}</SelectLabel>}
                        {stages.filter((s) => s.pipeline_id === p.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dono</Label>
                <Select value={form.owner_id ?? '__none__'} onValueChange={(v) => setForm((f) => f && { ...f, owner_id: v === '__none__' ? undefined : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem dono" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem dono</SelectItem>
                    {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Origem</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => f && { ...f, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Previsão de fechamento</Label>
                <Input type="date" value={form.expected_close_date} onChange={(e) => setForm((f) => f && { ...f, expected_close_date: e.target.value })} />
              </div>
              <CustomFieldsForm entity="deal" compact values={form.custom} onChange={(custom) => setForm((f) => f && { ...f, custom })} errors={customErrors} />
              {hasChanges && (
                <Button size="sm" className="w-full" onClick={handleSaveDeal} disabled={saveDeal.isPending}>
                  Salvar alterações
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Contato</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="font-medium">{deal.contact.name}</p>
              {deal.contact.company && <p className="text-muted-foreground">{deal.contact.company}</p>}
              {deal.contact.email && <p className="text-muted-foreground">{deal.contact.email}</p>}
              {deal.contact.phone && <p className="text-muted-foreground">{deal.contact.phone}</p>}
              {whatsappDigits && (
                <a
                  href={`https://wa.me/55${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Centro: linha do tempo */}
        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-base">Linha do tempo</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="space-y-4 flex-1 overflow-y-auto max-h-[480px]">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade ainda.</p>
              ) : (
                activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)
              )}
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adicionar nota..." rows={2} />
              <Button size="sm" onClick={handleAddNote} disabled={!note.trim() || addNote.isPending}>Adicionar nota</Button>
            </div>
          </CardContent>
        </Card>

        {/* Direita: tarefas e pedidos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tarefas</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setTaskDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2">
                    <Checkbox
                      checked={task.status === 'completed'}
                      onCheckedChange={() => task.status !== 'completed' && completeTask.mutate(task.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </p>
                      {task.due_date && <p className="text-[11px] text-muted-foreground">Prazo: {task.due_date}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pedidos</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => navigate(tenantPath(`/comercial/pedidos/novo?negocio=${deal.id}&contato=${deal.contact_id}`))}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Novo
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido.</p>
              ) : (
                orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => navigate(tenantPath(`/comercial/pedidos/${order.id}`))}
                    className="w-full flex items-center justify-between rounded-lg border p-2 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm">#{order.number}</span>
                      <Badge variant="outline" className="text-[10px]">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">{formatBRL(order.total)}</span>
                      {order.link_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); copyOrderLink(order.link_url!); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Diálogo: motivo da perda */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar negócio como perdido</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo *</Label>
            <Textarea value={lostReason} onChange={(e) => setLostReason(e.target.value)} rows={3} placeholder="Por que este negócio foi perdido?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleMarkLost} disabled={setDealStage.isPending}>Marcar como perdido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: nova tarefa */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Para quem *</Label>
              <Select value={taskUserId} onValueChange={setTaskUserId}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo</Label>
              <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddTask} disabled={addTask.isPending}>Criar tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
