import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Settings, Clock, Tag, Plus, Trash2, Edit3, Building2, Layers, Calculator, Info, RotateCcw } from 'lucide-react';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useSLAPolicies } from '@/hooks/useSLAPolicies';
import { useRHCompanies, useRHDepartments, useRHPayrollSettings } from '@/hooks/useRH';

// Tabelas oficiais 2025 — rates armazenados como DECIMAL (0.075 = 7,5%)
const INSS_2025 = [
  { min: 0, max: 1518.00, rate: 0.075, deduct: 0 },
  { min: 1518.01, max: 2793.88, rate: 0.09, deduct: 22.77 },
  { min: 2793.89, max: 4190.83, rate: 0.12, deduct: 106.59 },
  { min: 4190.84, max: 8157.41, rate: 0.14, deduct: 190.40 },
];
const IRPF_2025 = [
  { min: 0, max: 2428.80, rate: 0, deduct: 0 },
  { min: 2428.81, max: 2826.65, rate: 0.075, deduct: 182.16 },
  { min: 2826.66, max: 3751.05, rate: 0.15, deduct: 394.16 },
  { min: 3751.06, max: 4664.68, rate: 0.225, deduct: 675.49 },
  { min: 4664.69, max: 999999, rate: 0.275, deduct: 908.73 },
];

// Helpers de conversão: armazenamos decimal (0.06), exibimos % (6).
const toPct = (v: any) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return 0;
  // Se vier > 1, assumimos que já estava em formato %, normalizamos
  return n > 1 ? n : n * 100;
};
const fromPct = (v: any) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return 0;
  return n / 100;
};

// Normaliza brackets antigos (rate como 9) para decimal (0.09)
const normalizeBrackets = (arr: any[]) => {
  if (!Array.isArray(arr)) return [];
  return arr.map(b => ({
    min: Number(b.min ?? 0),
    max: Number(b.max ?? 0),
    rate: Number(b.rate ?? 0) > 1 ? Number(b.rate) / 100 : Number(b.rate ?? 0),
    deduct: Number(b.deduct ?? 0),
  }));
};

function FieldHint({ text, example }: { text: string; example?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex ml-1 text-muted-foreground hover:text-primary align-middle" tabIndex={-1}>
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs">{text}</p>
        {example && <p className="text-[11px] mt-1 opacity-80"><strong>Ex.:</strong> {example}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function BracketEditor({ brackets, onChange }: { brackets: any[]; onChange: (b: any[]) => void }) {
  const list = Array.isArray(brackets) ? brackets : [];
  const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const update = (i: number, field: 'min' | 'max' | 'rate' | 'deduct', val: string) => {
    const copy = [...list];
    const num = Number(val);
    copy[i] = { ...copy[i], [field]: field === 'rate' ? num / 100 : num };
    onChange(copy);
  };
  const add = () => onChange([...list, { min: 0, max: 0, rate: 0, deduct: 0 }]);
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <div className="mt-2 rounded border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1">De (R$)</th>
            <th className="text-left px-2 py-1">Até (R$)</th>
            <th className="text-left px-2 py-1">Alíquota (%)</th>
            <th className="text-left px-2 py-1">Dedução (R$)</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {list.map((b, i) => (
            <tr key={i} className="border-t">
              <td className="px-1 py-1"><Input className="h-7 text-xs" type="number" step="0.01" value={b.min} onChange={e => update(i, 'min', e.target.value)} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" type="number" step="0.01" value={b.max} onChange={e => update(i, 'max', e.target.value)} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" type="number" step="0.01" value={toPct(b.rate)} onChange={e => update(i, 'rate', e.target.value)} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" type="number" step="0.01" value={b.deduct} onChange={e => update(i, 'deduct', e.target.value)} /></td>
              <td className="px-1 py-1 text-right">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t bg-muted/20 px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={add} className="h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" />Adicionar faixa
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground px-2 py-1 border-t bg-muted/10">
        Exemplo: salário {fmt(2000)} na 2ª faixa do INSS (9%) → {fmt(2000 * 0.09 - 22.77)} de INSS.
      </div>
    </div>
  );
}

export default function RHConfiguracoes() {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <PageHeader
            className="bg-transparent border-0 px-0 py-0"
            icon={Settings}
            title="Configurações de RH"
            description="Empresas, departamentos, parâmetros da folha, categorias e prazos."
          />
        </div>

        <Tabs defaultValue="empresas">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="empresas"><Building2 className="w-3.5 h-3.5 mr-1.5" />Empresas</TabsTrigger>
            <TabsTrigger value="departamentos"><Layers className="w-3.5 h-3.5 mr-1.5" />Departamentos</TabsTrigger>
            <TabsTrigger value="folha"><Calculator className="w-3.5 h-3.5 mr-1.5" />Parâmetros da Folha</TabsTrigger>
            <TabsTrigger value="categorias"><Tag className="w-3.5 h-3.5 mr-1.5" />Categorias</TabsTrigger>
            <TabsTrigger value="sla"><Clock className="w-3.5 h-3.5 mr-1.5" />Prazos (SLA)</TabsTrigger>
            <TabsTrigger value="acesso"><Users className="w-3.5 h-3.5 mr-1.5" />Acesso</TabsTrigger>
          </TabsList>

          <TabsContent value="empresas"><CompaniesTab /></TabsContent>
          <TabsContent value="departamentos"><DepartmentsTab /></TabsContent>
          <TabsContent value="folha"><PayrollSettingsTab /></TabsContent>
          <TabsContent value="categorias"><RHCategoriesTab /></TabsContent>
          <TabsContent value="sla"><RHSLATab /></TabsContent>
          <TabsContent value="acesso"><RHAccessTab /></TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ============= Empresas =============
function CompaniesTab() {
  const { companies, upsert, remove } = useRHCompanies();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ code: '', name: '', cnpj: '' });

  const start = (c: any) => { setEditing(c); setF({ code: c?.code || '', name: c?.name || '', cnpj: c?.cnpj || '' }); setOpen(true); };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle className="text-base">Empresas do tenant</CardTitle><CardDescription>Cadastre as razões sociais (ex.: MF, INBRAS) para agrupar a folha.</CardDescription></div>
        <Button size="sm" onClick={() => start(null)}><Plus className="w-3.5 h-3.5 mr-1" />Nova</Button>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada.</div> : (
          <div className="space-y-2">
            {companies.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{c.code}</Badge>
                  <div>
                    <div className="font-medium text-sm">{c.name}</div>
                    {c.cnpj && <div className="text-xs text-muted-foreground">{c.cnpj}</div>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => start(c)}><Edit3 className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${c.name}?`) && remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} empresa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código *</Label><Input value={f.code} onChange={e => setF(s => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="Ex.: MF" /></div>
            <div><Label>Nome *</Label><Input value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>CNPJ</Label><Input value={f.cnpj} onChange={e => setF(s => ({ ...s, cnpj: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!f.code || !f.name} onClick={async () => { await upsert.mutateAsync({ id: editing?.id, ...f } as any); setOpen(false); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============= Departamentos =============
function DepartmentsTab() {
  const { departments, upsert, remove } = useRHDepartments();
  const [newName, setNewName] = useState('');
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Departamentos</CardTitle><CardDescription>Lista usada nos cadastros e nas análises.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2 mb-3">
          <Input placeholder="Novo departamento" value={newName} onChange={e => setNewName(e.target.value)} />
          <Button onClick={async () => { if (!newName.trim()) return; await upsert.mutateAsync({ name: newName.trim() }); setNewName(''); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
          </Button>
        </div>
        {departments.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{d.name}</span>
            <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${d.name}?`) && remove.mutate(d.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============= Parâmetros da Folha =============
function PayrollSettingsTab() {
  const { settings, save } = useRHPayrollSettings();
  const [f, setF] = useState<any>(null);
  const current = f || settings;
  const set = (k: string, v: any) => setF({ ...(current || {}), [k]: v });

  if (!current) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent></Card>;

  // Wrappers para campos em %: armazenam decimal, exibem porcentagem
  const pctValue = (k: string) => toPct(current[k]);
  const setPct = (k: string, v: string) => set(k, fromPct(v));

  const handleSave = () => {
    // Normaliza brackets antes de salvar (garante decimal)
    const payload = {
      ...current,
      inss_brackets: normalizeBrackets(current.inss_brackets || []),
      irpf_brackets: normalizeBrackets(current.irpf_brackets || []),
    };
    save.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parâmetros para cálculo da folha</CardTitle>
        <CardDescription>
          Todos os campos com "%" são preenchidos em <strong>porcentagem</strong> (ex.: digite <code>6</code> para 6%). Passe o mouse no <Info className="w-3 h-3 inline mb-0.5" /> para ver como cada campo é usado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="flex items-center">VT (%) do salário <FieldHint text="Percentual máximo do salário bruto descontado para Vale Transporte (Lei 7.418/85, até 6%)." example="6% sobre R$ 2.000 = R$ 120 descontados do colaborador." /></Label>
            <Input type="number" step="0.1" value={pctValue('transport_voucher_pct')} onChange={e => setPct('transport_voucher_pct', e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center">VT teto (R$) <FieldHint text="Valor máximo descontado de VT, independente do percentual." example="Teto R$ 200 ⇒ mesmo com 6% sobre R$ 5.000 (=R$ 300), o desconto fica em R$ 200." /></Label>
            <Input type="number" step="0.01" value={current.transport_voucher_cap ?? 0} onChange={e => set('transport_voucher_cap', Number(e.target.value))} />
          </div>
          <div>
            <Label className="flex items-center">VA (%) <FieldHint text="Coparticipação do colaborador no Vale Alimentação, calculada sobre o salário bruto." example="1% sobre R$ 2.000 = R$ 20 descontados." /></Label>
            <Input type="number" step="0.1" value={pctValue('meal_voucher_pct')} onChange={e => setPct('meal_voucher_pct', e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center">VA valor/dia default (R$) <FieldHint text="Valor diário do VA aplicado quando o colaborador não tem valor próprio cadastrado." example="R$ 30/dia × 22 dias úteis = R$ 660 de VA no mês." /></Label>
            <Input type="number" step="0.01" value={current.meal_voucher_default_value ?? 0} onChange={e => set('meal_voucher_default_value', Number(e.target.value))} />
          </div>
          <div>
            <Label className="flex items-center">Adiantamento (%) <FieldHint text="Percentual do salário bruto pago como adiantamento no meio do mês (vale)." example="40% sobre R$ 2.000 = R$ 800 adiantados." /></Label>
            <Input type="number" step="0.1" value={pctValue('advance_pct')} onChange={e => setPct('advance_pct', e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center">Combustível (%) <FieldHint text="Percentual de coparticipação do colaborador descontado do reembolso de combustível." example="6% sobre R$ 500 = R$ 30 descontados do reembolso." /></Label>
            <Input type="number" step="0.1" value={pctValue('fuel_pct')} onChange={e => setPct('fuel_pct', e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center">R$ / km <FieldHint text="Valor pago por quilômetro rodado no reembolso de combustível." example="R$ 0,80/km × 300 km = R$ 240 brutos a reembolsar." /></Label>
            <Input type="number" step="0.01" value={current.fuel_price_per_km ?? 0} onChange={e => set('fuel_price_per_km', Number(e.target.value))} />
          </div>
        </div>

        {/* INSS */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold flex items-center">
              Tabela INSS
              <FieldHint
                text="Faixas progressivas do INSS. Edite cada linha: salário entre 'De' e 'Até' aplica a alíquota e subtrai a dedução."
                example='Salário R$ 2.000, alíquota 9%, dedução R$ 22,77 ⇒ INSS = R$ 157,23.'
              />
            </Label>
            <Button size="sm" variant="outline" onClick={() => { set('inss_brackets', INSS_2025); }}>
              <RotateCcw className="w-3 h-3 mr-1" />Restaurar tabela 2025
            </Button>
          </div>
          <BracketEditor brackets={normalizeBrackets(current.inss_brackets || [])} onChange={b => set('inss_brackets', b)} />
        </div>

        {/* IRPF */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold flex items-center">
              Tabela IRPF
              <FieldHint
                text="Faixas progressivas do IRPF. Aplicada sobre a base (bruto − INSS − dependentes)."
                example='Base R$ 3.000 → 15% − R$ 394,16 = R$ 55,84 de IRPF.'
              />
            </Label>
            <Button size="sm" variant="outline" onClick={() => { set('irpf_brackets', IRPF_2025); }}>
              <RotateCcw className="w-3 h-3 mr-1" />Restaurar tabela 2025
            </Button>
          </div>
          <BracketEditor brackets={normalizeBrackets(current.irpf_brackets || [])} onChange={b => set('irpf_brackets', b)} />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!f || save.isPending}>Salvar parâmetros</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Categorias do RH =============
function RHCategoriesTab() {
  const { can } = useDepartmentPermissions('rh');
  const canEdit = can('categories', 'edit') || can('categories', 'create');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categorias dos chamados de RH</CardTitle>
        <CardDescription>Organize os tipos de solicitação que o colaborador pode abrir (férias, atestados, reembolso, etc.) e personalize o formulário de cada categoria.</CardDescription>
      </CardHeader>
      <CardContent>
        <CategoryManager module="rh" allowForms readOnly={!canEdit} emptyLabel="o RH" />
      </CardContent>
    </Card>
  );
}

// ============= SLA do RH =============
function RHSLATab() {
  const { policies, isLoading, updatePolicy } = useSLAPolicies();
  const [edits, setEdits] = useState<Record<string, { first_response_time: number; resolution_time: number }>>({});

  const priorityLabel: Record<string, string> = {
    critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prazos de atendimento</CardTitle>
        <CardDescription>Tempo máximo, em minutos, para primeira resposta e resolução dos chamados de RH por prioridade.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-2">
            {policies.map(p => {
              const edit = edits[p.id];
              return (
                <div key={p.id} className="grid grid-cols-12 items-center gap-3 rounded-lg border p-3">
                  <div className="col-span-3">
                    <div className="font-medium text-sm">{p.name}</div>
                    <Badge variant="outline" className="text-[10px] mt-1">{priorityLabel[p.priority] || p.priority}</Badge>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Primeira resposta (min)</Label>
                    <Input type="number" value={edit?.first_response_time ?? p.first_response_time}
                      onChange={e => setEdits(s => ({ ...s, [p.id]: { first_response_time: Number(e.target.value), resolution_time: edit?.resolution_time ?? p.resolution_time } }))} />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Resolução (min)</Label>
                    <Input type="number" value={edit?.resolution_time ?? p.resolution_time}
                      onChange={e => setEdits(s => ({ ...s, [p.id]: { first_response_time: edit?.first_response_time ?? p.first_response_time, resolution_time: Number(e.target.value) } }))} />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    {edit && (
                      <Button size="sm" onClick={async () => {
                        await updatePolicy.mutateAsync({ id: p.id, ...edit });
                        setEdits(s => { const c = { ...s }; delete c[p.id]; return c; });
                      }}>Salvar</Button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2">
              Estes prazos são compartilhados com chamados de outros módulos que usem a mesma prioridade.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============= Acesso ao RH (placeholder) =============
function RHAccessTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem pode operar o RH</CardTitle>
        <CardDescription>
          Conceda acesso ao módulo RH em <strong>Configurações → Usuários</strong>, marcando o módulo "RH" no perfil do colaborador.
          Gestores e administradores têm acesso automático.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground text-center">
          Perfis granulares de RH (ex.: somente folha, somente atestados) entram em uma próxima fase.
        </div>
      </CardContent>
    </Card>
  );
}
