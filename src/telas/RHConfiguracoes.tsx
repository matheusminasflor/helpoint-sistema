import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Plus, Trash2, Edit3, Building2, Layers, Calculator, Info, RotateCcw } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
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
                  <Trash2 className="w-3.5 h-3.5 text-status-danger" />
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

// Categorias, prazos e automações vêm da aba Chamados do molde de todo setor (LEVA P). As três
// cópias que moravam aqui saíram: a de prazos editava a linha da empresa inteira, e a de
// "Acesso" dizia "próxima fase" com os perfis de acesso já existindo.
export default function RHConfiguracoes() {
  return (
    <TooltipProvider delayDuration={150}>
      <ConfiguracaoDoSetor
        label="RH"
        icon={Users}
        modulo="rh"
        nomeNaFrase="o RH"
        abas={[
          { valor: 'empresas', permissao: 'empresas', rotulo: 'Empresas', icone: Building2, conteudo: <CompaniesTab /> },
          { valor: 'departamentos', permissao: 'departamentos', rotulo: 'Departamentos', icone: Layers, conteudo: <DepartmentsTab /> },
          { valor: 'folha', permissao: 'folha', rotulo: 'Parâmetros da folha', icone: Calculator, conteudo: <PayrollSettingsTab /> },
        ]}
      />
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
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${c.name}?`) && remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5 text-status-danger" /></Button>
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
            <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${d.name}?`) && remove.mutate(d.id)}><Trash2 className="w-3.5 h-3.5 text-status-danger" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============= Parâmetros da Folha =============
function PayrollSettingsTab() {
  const { settings, isLoading, save } = useRHPayrollSettings();
  const [f, setF] = useState<any>(null);
  // `?? {}` — e é a correção de 2026-09-27. Era `f || settings`, e a tela
  // devolvia "Carregando..." enquanto `current` fosse nulo. Só que `settings` é
  // **nulo também quando a empresa não tem linha de parâmetros** — a migration
  // que semeou a linha rodou uma vez, e não há trigger em `tenants` que a crie
  // para empresa nova. Então a aba ficava "Carregando..." PARA SEMPRE, sem erro e
  // sem caminho: ninguém conseguia criar os parâmetros que faltavam.
  // Agora "não existe ainda" é um formulário vazio, e o `save` já sabe inserir
  // quando não há `id`.
  const current = f ?? settings ?? {};
  const set = (k: string, v: any) => setF({ ...current, [k]: v });
  const nuncaConfigurado = !settings && !f;

  if (isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent></Card>;

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
        {/* A empresa pode nunca ter tido parâmetros — e antes disso a aba ficava
            "Carregando..." para sempre nesse caso. Dizer isso é melhor que um
            formulário de zeros sem explicação. */}
        {nuncaConfigurado && (
          <p className="text-sm text-foreground rounded-md border border-border badge-warning p-3">
            Esta empresa ainda <strong>não tem parâmetros de folha</strong>. Preencha os campos abaixo
            e salve — nada é calculado até isso existir.
          </p>
        )}
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

