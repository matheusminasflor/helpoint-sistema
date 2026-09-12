import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTICategories, formatTICategoryLabel, type TIModule } from '@/hooks/useTICategories';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMPipelines, useCRMStages } from '@/hooks/useCRM';
import { useSaveWorkflow } from '@/hooks/useAutomations';
import { MODULE_LABELS, type AutomationModule } from '@/lib/automation-flow';
import { COMERCIAL_TEMPLATES, erpHandoffFlows, noReplyFlow, blingNfeFlow, shippingTaskFlow, type TemplateDef, type TemplateFlow } from '@/lib/automation-templates';
import { useBlingStatus } from '@/hooks/useBling';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: AutomationModule;
}

/**
 * "Usar um modelo" na aba Automações (CRM-1d): escolhe o modelo, responde as
 * perguntas dele e os fluxos nascem prontos e ativos — editáveis depois como
 * qualquer outro. As perguntas são as da seção 7 da proposta do fluxo comercial.
 */
export function AutomationTemplatesDialog({ open, onOpenChange, module }: Props) {
  const [picked, setPicked] = useState<TemplateDef['id'] | null>(null);
  const templates = COMERCIAL_TEMPLATES; // o botão só existe na aba do Comercial (AutomationsTab)

  const close = () => { setPicked(null); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{picked ? templates.find((t) => t.id === picked)?.title : 'Usar um modelo'}</DialogTitle>
          <DialogDescription>
            {picked ? 'Responda e o fluxo nasce pronto. Tudo pode ser mudado depois no editor.' : 'Fluxos prontos para as passagens de bastão mais comuns. Você escolhe as pessoas e os prazos.'}
          </DialogDescription>
        </DialogHeader>

        {!picked && (
          <div className="space-y-2">
            {templates.map((t) => (
              <button key={t.id} type="button" onClick={() => setPicked(t.id)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/50">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.summary}</p>
              </button>
            ))}
          </div>
        )}

        {picked === 'erp_handoff' && <ErpHandoffForm module={module} onDone={close} onBack={() => setPicked(null)} />}
        {picked === 'no_reply' && <NoReplyForm module={module} onDone={close} onBack={() => setPicked(null)} />}
        {picked === 'bling_nfe' && <BlingNfeForm module={module} onDone={close} onBack={() => setPicked(null)} />}
        {picked === 'shipping_task' && <ShippingTaskForm module={module} onDone={close} onBack={() => setPicked(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function useCreateFlows(module: AutomationModule) {
  const save = useSaveWorkflow();
  const create = async (flows: TemplateFlow[]) => {
    for (const f of flows) {
      await save.mutateAsync({ module, name: f.name, description: f.description, trigger: f.trigger, steps: f.steps, status: 'active' });
    }
  };
  return { create, pending: save.isPending };
}

function ErpHandoffForm({ module, onDone, onBack }: { module: AutomationModule; onDone: () => void; onBack: () => void }) {
  const [ticketModule, setTicketModule] = useState<AutomationModule>('tickets');
  const [categoryId, setCategoryId] = useState('');
  const [financeUserId, setFinanceUserId] = useState('');
  const [createReceivable, setCreateReceivable] = useState(true);
  const [dueDays, setDueDays] = useState('7');
  const { categories } = useTICategories(ticketModule as TIModule);
  const { data: people = [] } = useTechnicians();
  const { create, pending } = useCreateFlows(module);

  const canSave = !!categoryId && !!financeUserId && !pending;
  const submit = async () => {
    if (!canSave) return;
    try {
      await create(erpHandoffFlows({ ticketModule, categoryId, financeUserId, createReceivable, receivableDueDays: Number(dueDays) || 7 }));
      onDone();
    } catch {
      /* o toast do hook já explicou */
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Quem cadastra o cliente no ERP? (módulo do chamado)</Label>
          <Select value={ticketModule} onValueChange={(v) => { setTicketModule(v as AutomationModule); setCategoryId(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(MODULE_LABELS) as AutomationModule[]).map((m) => <SelectItem key={m} value={m}>{MODULE_LABELS[m]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoria do chamado de cadastro</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{formatTICategoryLabel(c, categories)}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">É por ela que o sistema reconhece o chamado quando for resolvido.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Quem cobra o cliente? (recebe a tarefa quando o cadastro terminar)</Label>
        <Select value={financeUserId} onValueChange={setFinanceUserId}>
          <SelectTrigger><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
          <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <Switch checked={createReceivable} onCheckedChange={setCreateReceivable} id="tpl-receivable" />
        <Label htmlFor="tpl-receivable" className="font-normal">Lançar a conta a receber no Financeiro do Helpoint</Label>
        {createReceivable && (
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs">vence em</Label>
            <Input type="number" min="0" value={dueDays} onChange={(e) => setDueDays(e.target.value)} className="h-8 w-20" />
            <span className="text-xs text-muted-foreground">dias</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Empresa com ERP fora do Helpoint costuma desligar a conta a receber (a cobrança vive no ERP); quem usa só o Helpoint cobra por aqui.</p>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button onClick={submit} disabled={!canSave}>Criar os dois fluxos</Button>
      </DialogFooter>
    </div>
  );
}

function NoReplyForm({ module, onDone, onBack }: { module: AutomationModule; onDone: () => void; onBack: () => void }) {
  const { data: pipelines = [] } = useCRMPipelines();
  const { data: stages = [] } = useCRMStages();
  const [pipelineId, setPipelineId] = useState('');
  const [hoursToFollowUp, setHoursToFollowUp] = useState('24');
  const [hoursToLose, setHoursToLose] = useState('48');
  const { create, pending } = useCreateFlows(module);

  const chosen = pipelineId || pipelines.find((p) => p.is_default)?.id || pipelines[0]?.id || '';
  const { firstStage, lostStage } = useMemo(() => {
    const own = stages.filter((s) => s.pipeline_id === chosen);
    return {
      firstStage: own.filter((s) => s.kind === 'open').sort((a, b) => a.position - b.position)[0],
      lostStage: own.find((s) => s.kind === 'lost'),
    };
  }, [stages, chosen]);

  const canSave = !!firstStage && !!lostStage && Number(hoursToFollowUp) > 0 && Number(hoursToLose) > 0 && !pending;
  const submit = async () => {
    if (!canSave || !firstStage || !lostStage) return;
    try {
      await create([noReplyFlow({ firstStageId: firstStage.id, lostStageId: lostStage.id, hoursToFollowUp: Number(hoursToFollowUp), hoursToLose: Number(hoursToLose) })]);
      onDone();
    } catch {
      /* o toast do hook já explicou */
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Em qual funil?</Label>
        <Select value={chosen} onValueChange={setPipelineId}>
          <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
          <SelectContent>{pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        {firstStage && lostStage && <p className="text-[11px] text-muted-foreground">Vale para negócio parado em "{firstStage.name}"; perdido vai para "{lostStage.name}".</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Follow-up depois de (horas)</Label><Input type="number" min="1" value={hoursToFollowUp} onChange={(e) => setHoursToFollowUp(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Perdido depois de mais (horas)</Label><Input type="number" min="1" value={hoursToLose} onChange={(e) => setHoursToLose(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button onClick={submit} disabled={!canSave}>Criar o fluxo</Button>
      </DialogFooter>
    </div>
  );
}

function BlingNfeForm({ module, onDone, onBack }: { module: AutomationModule; onDone: () => void; onBack: () => void }) {
  const { data: bling, isLoading } = useBlingStatus();
  const defaults = (bling?.settings ?? {}) as { gerar_nfe?: boolean; enviar_nfe?: boolean; forma_pagamento_id?: number };
  const [gerarNfe, setGerarNfe] = useState<boolean | null>(null);
  const [enviarNfe, setEnviarNfe] = useState<boolean | null>(null);
  const gerar = gerarNfe ?? !!defaults.gerar_nfe;
  const enviar = gerar && (enviarNfe ?? !!defaults.enviar_nfe);
  const { create, pending } = useCreateFlows(module);

  const canSave = !!bling && !!defaults.forma_pagamento_id && !pending;
  const submit = async () => {
    if (!canSave) return;
    try {
      await create([blingNfeFlow({ gerarNfe: gerar, enviarNfe: enviar })]);
      onDone();
    } catch {
      /* o toast do hook já explicou */
    }
  };

  return (
    <div className="space-y-4">
      {!isLoading && !bling && <p className="text-sm text-destructive">Conecte a conta do Bling primeiro: Configurações do Comercial → Nota fiscal.</p>}
      {bling && !defaults.forma_pagamento_id && <p className="text-sm text-destructive">Escolha a forma de pagamento do Bling em Configurações do Comercial → Nota fiscal.</p>}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Switch id="tpl-gerar" checked={gerar} onCheckedChange={(v) => { setGerarNfe(v); if (!v) setEnviarNfe(false); }} />
        <Label htmlFor="tpl-gerar" className="font-normal">Gerar a NF-e a partir do pedido</Label>
      </div>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Switch id="tpl-enviar" checked={enviar} disabled={!gerar} onCheckedChange={(v) => setEnviarNfe(v)} />
        <Label htmlFor="tpl-enviar" className="font-normal">Transmitir à SEFAZ na hora</Label>
      </div>
      <p className="text-xs text-muted-foreground">Sem transmitir, a nota fica no Bling para você revisar e enviar por lá. O passo pode ser mudado depois no editor.</p>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button onClick={submit} disabled={!canSave}>Criar o fluxo</Button>
      </DialogFooter>
    </div>
  );
}

function ShippingTaskForm({ module, onDone, onBack }: { module: AutomationModule; onDone: () => void; onBack: () => void }) {
  const [shippingUserId, setShippingUserId] = useState('');
  const [dueDays, setDueDays] = useState('2');
  const { data: people = [] } = useTechnicians();
  const { create, pending } = useCreateFlows(module);

  const canSave = !!shippingUserId && Number(dueDays) >= 0 && !pending;
  const submit = async () => {
    if (!canSave) return;
    try {
      await create([shippingTaskFlow({ shippingUserId, dueDays: Number(dueDays) || 0 })]);
      onDone();
    } catch {
      /* o toast do hook já explicou */
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Quem separa e despacha? (recebe a tarefa)</Label>
        <Select value={shippingUserId} onValueChange={setShippingUserId}>
          <SelectTrigger><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
          <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Prazo da tarefa (dias)</Label><Input type="number" min="0" value={dueDays} onChange={(e) => setDueDays(e.target.value)} className="w-32" /></div>
      <p className="text-xs text-muted-foreground">A tarefa leva os itens, o destino e a transportadora cadastrada no contato (campo "Transportadora"). Quem despacha pela Yampi/Correios não precisa deste fluxo.</p>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button onClick={submit} disabled={!canSave}>Criar o fluxo</Button>
      </DialogFooter>
    </div>
  );
}
