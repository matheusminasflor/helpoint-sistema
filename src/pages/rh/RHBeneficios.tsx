import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trash2, Plus, HeartPulse } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

const BENEFIT_CAT_OPTIONS = [
  { value: 'saude', label: 'Plano de saúde' },
  { value: 'odonto', label: 'Odontológico' },
  { value: 'vale_refeicao', label: 'Vale-refeição' },
  { value: 'vale_alimentacao', label: 'Vale-alimentação' },
  { value: 'vale_transporte', label: 'Vale-transporte' },
  { value: 'seguro_vida', label: 'Seguro de vida' },
  { value: 'gympass', label: 'Gympass / Wellhub' },
  { value: 'educacao', label: 'Educação' },
  { value: 'outros', label: 'Outros' },
];

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeartPulse as _HP, UtensilsCrossed, Bus, Fuel, Wallet as _W } from 'lucide-react';
import RHReembolsos from './RHReembolsos';

export default function RHBeneficiosPage() {
  return (
    <div className="p-6 max-w-[1300px] mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <HeartPulse className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Benefícios</h1>
          <p className="text-sm text-muted-foreground">Planos de benefício, vale-alimentação, vale-transporte, combustível e descontos avulsos.</p>
        </div>
      </div>

      <Tabs defaultValue="planos">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="planos"><HeartPulse className="w-3.5 h-3.5 mr-1.5" />Planos de Benefício</TabsTrigger>
          <TabsTrigger value="lancamentos"><UtensilsCrossed className="w-3.5 h-3.5 mr-1.5" />VT, VA, Combustível e Descontos</TabsTrigger>
        </TabsList>
        <TabsContent value="planos"><BenefitPlansSection /></TabsContent>
        <TabsContent value="lancamentos"><RHReembolsos /></TabsContent>
      </Tabs>
    </div>
  );
}

function BenefitPlansSection() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ['rh-benefit-plans', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from('rh_benefit_plans').select('*').eq('tenant_id', tenantId).order('name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: links = [] } = useQuery({
    queryKey: ['rh-employee-benefits-all', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('rh_employee_benefits')
        .select('*, plan:rh_benefit_plans(name, category), profile:user_id(full_name, email)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: usersList = [] } = useQuery({
    queryKey: ['tenant-users-for-benefits', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('tenant_id', tenantId).order('full_name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_benefit_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Plano removido.'); qc.invalidateQueries({ queryKey: ['rh-benefit-plans'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_employee_benefits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Vínculo removido.'); qc.invalidateQueries({ queryKey: ['rh-employee-benefits-all'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Planos de benefícios</CardTitle>
            <CardDescription>Cadastre os benefícios oferecidos pela empresa.</CardDescription>
          </div>
          <PlanFormDialog onSaved={() => qc.invalidateQueries({ queryKey: ['rh-benefit-plans'] })} />
        </CardHeader>
        <CardContent className="space-y-2">
          {plans.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</div>
          ) : plans.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{p.name} <span className="text-muted-foreground font-normal">· {BENEFIT_CAT_OPTIONS.find(o => o.value === p.category)?.label}</span></div>
                <div className="text-xs text-muted-foreground">
                  {p.provider || 'Sem fornecedor'} {p.monthly_value != null && `· R$ ${Number(p.monthly_value).toFixed(2)}/mês`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!p.is_active && <Badge variant="outline" className="bg-slate-100">Inativo</Badge>}
                <Button size="sm" variant="ghost" onClick={() => confirm(`Remover "${p.name}"?`) && deletePlan.mutate(p.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Colaboradores vinculados</CardTitle>
            <CardDescription>Conceda benefícios aos colaboradores. Eles verão em "Meu RH".</CardDescription>
          </div>
          <LinkBenefitDialog plans={plans} users={usersList} onSaved={() => qc.invalidateQueries({ queryKey: ['rh-employee-benefits-all'] })} />
        </CardHeader>
        <CardContent className="space-y-2">
          {links.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum colaborador com benefício.</div>
          ) : links.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{l.profile?.full_name || l.profile?.email}</div>
                <div className="text-xs text-muted-foreground">
                  {l.plan?.name} · desde {format(new Date(l.start_date), 'dd/MM/yyyy')}
                  {Array.isArray(l.dependents) && l.dependents.length > 0 && ` · ${l.dependents.length} dep.`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={
                  l.status === 'ativo' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : l.status === 'suspenso' ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700'
                }>
                  {l.status === 'ativo' ? 'Ativo' : l.status === 'suspenso' ? 'Suspenso' : 'Encerrado'}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => confirm('Remover este vínculo?') && deleteLink.mutate(l.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanFormDialog({ onSaved }: { onSaved: () => void }) {
  const { tenantId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('saude');
  const [provider, setProvider] = useState('');
  const [monthlyValue, setMonthlyValue] = useState('');
  const [description, setDescription] = useState('');

  const save = async () => {
    if (!tenantId || !name) return;
    const { error } = await supabase.from('rh_benefit_plans').insert({
      tenant_id: tenantId, name, category, provider: provider || null,
      monthly_value: monthlyValue ? Number(monthlyValue) : null,
      description: description || null, created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Plano cadastrado.');
    setOpen(false); setName(''); setProvider(''); setMonthlyValue(''); setDescription(''); setCategory('saude');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-3.5 h-3.5 mr-1" />Novo plano</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo plano de benefício</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Unimed Nacional" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BENEFIT_CAT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fornecedor</Label><Input value={provider} onChange={e => setProvider(e.target.value)} /></div>
          </div>
          <div><Label>Valor mensal (R$)</Label><Input type="number" step="0.01" value={monthlyValue} onChange={e => setMonthlyValue(e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkBenefitDialog({ plans, users, onSaved }: { plans: any[]; users: any[]; onSaved: () => void }) {
  const { tenantId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [deps, setDeps] = useState<Array<{ name: string; relationship: string }>>([]);

  const addDep = () => setDeps([...deps, { name: '', relationship: 'filho(a)' }]);
  const updateDep = (i: number, field: 'name' | 'relationship', v: string) => {
    const copy = [...deps]; copy[i] = { ...copy[i], [field]: v }; setDeps(copy);
  };
  const removeDep = (i: number) => setDeps(deps.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!tenantId || !userId || !planId) return;
    const validDeps = deps.filter(d => d.name.trim());
    const { error } = await supabase.from('rh_employee_benefits').insert({
      tenant_id: tenantId, user_id: userId, plan_id: planId,
      start_date: startDate, dependents: validDeps, created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Benefício vinculado.');
    setOpen(false); setUserId(''); setPlanId(''); setDeps([]);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" />Vincular</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Vincular benefício a colaborador</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Colaborador</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
              <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plano</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
                <SelectContent>{plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Início</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="m-0">Dependentes (opcional)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={addDep}><Plus className="w-3 h-3 mr-1" />Adicionar</Button>
            </div>
            {deps.map((d, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input placeholder="Nome" value={d.name} onChange={e => updateDep(i, 'name', e.target.value)} />
                <Select value={d.relationship} onValueChange={v => updateDep(i, 'relationship', v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conjuge">Cônjuge</SelectItem>
                    <SelectItem value="filho(a)">Filho(a)</SelectItem>
                    <SelectItem value="pai/mae">Pai/Mãe</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeDep(i)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!userId || !planId}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
