import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Edit3, Plus, Search, Trash2, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import { useRHEmployees, useRHCompanies, useRHDepartments, type RHEmployee } from '@/hooks/useRH';
import { format } from 'date-fns';
import { fmtBRL, CompanyPicker } from '@/components/rh/shared';
import { useQueryState } from '@/hooks/useQueryState';

const CONTRACT_TYPES = ['CLT', 'PJ', 'Estágio', 'Temporário', 'Aprendiz'];
const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo', class: 'bg-green-100 text-green-700' },
  { value: 'afastado', label: 'Afastado', class: 'bg-amber-100 text-amber-800' },
  { value: 'desligado', label: 'Desligado', class: 'bg-rose-100 text-rose-700' },
];

export default function RHColaboradores() {
  const [search, setSearch] = useQueryState<string>('busca', '');
  const [companyParam, setCompanyParam] = useQueryState<string>('empresa', '');
  const companyId = companyParam || null;
  const setCompanyId = (v: string | null) => setCompanyParam(v || '');
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'ativo');
  const [editing, setEditing] = useState<RHEmployee | null>(null);
  const [open, setOpen] = useState(false);
  const { employees, isLoading, remove } = useRHEmployees({ companyId, status: statusFilter || undefined });
  const { companies } = useRHCompanies();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(r =>
      (r.full_name || '').toLowerCase().includes(q) ||
      (r.cpf || '').toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q) ||
      (r.job_title || '').toLowerCase().includes(q)
    );
  }, [employees, search]);

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);

  const stats = useMemo(() => {
    const byDept: Record<string, number> = {};
    employees.forEach(e => { const d = e.department || '—'; byDept[d] = (byDept[d] || 0) + 1; });
    const totalSalary = employees.reduce((a, e) => a + (Number(e.base_salary) || 0), 0);
    return { total: employees.length, byDept, totalSalary };
  }, [employees]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Colaboradores</h1>
            <p className="text-sm text-muted-foreground">Cadastro completo: empresa, cargo, gestor, contrato, salário e datas de experiência.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CompanyPicker value={companyId} onChange={setCompanyId} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="afastado">Afastados</SelectItem>
              <SelectItem value="desligado">Desligados</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Novo</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock label="Total" value={stats.total} />
        <StatBlock label="Folha base estimada" value={fmtBRL(stats.totalSalary)} />
        <StatBlock label="Departamentos" value={Object.keys(stats.byDept).length} />
        <StatBlock label="Empresas" value={companies.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>{filtered.length} resultado(s).</CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome, CPF, departamento ou cargo" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div> :
            filtered.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Nenhum colaborador.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Colaborador</th>
                    <th className="text-left py-2 px-2">Empresa</th>
                    <th className="text-left py-2 px-2">Cargo / Setor</th>
                    <th className="text-left py-2 px-2">Gestor</th>
                    <th className="text-left py-2 px-2">Contrato</th>
                    <th className="text-left py-2 px-2">Admissão</th>
                    <th className="text-left py-2 px-2">Exp. 45 / 90</th>
                    <th className="text-right py-2 px-2">Salário</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Acesso</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const status = STATUS_OPTIONS.find(s => s.value === r.status);
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-2">
                          <div className="font-medium">{r.full_name || '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{r.cpf || '—'}</div>
                        </td>
                        <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{r.company_id ? companyMap[r.company_id]?.code : '—'}</Badge></td>
                        <td className="py-2 px-2">
                          <div>{r.job_title || r.position || '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{r.department || '—'}</div>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{r.manager_name || '—'}</td>
                        <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{r.contract_type || 'CLT'}</Badge></td>
                        <td className="py-2 px-2 text-muted-foreground">{r.admission_date ? format(new Date(r.admission_date), 'dd/MM/yyyy') : '—'}</td>
                        <td className="py-2 px-2 text-[10px] text-muted-foreground">
                          {r.probation_45 ? format(new Date(r.probation_45), 'dd/MM') : '—'} / {r.probation_90 ? format(new Date(r.probation_90), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-medium">{fmtBRL(r.base_salary)}</td>
                        <td className="py-2 px-2"><Badge className={`text-[10px] border-0 ${status?.class || ''}`}>{status?.label || r.status}</Badge></td>
                        <td className="py-2 px-2">
                          {r.user_id ? (
                            <Badge className="text-[10px] bg-green-100 text-green-700 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Vinculado</Badge>
                          ) : r.access_email ? (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 border-0">Aguardando aceite</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Sem conta</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${r.full_name}?`) && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && <EmployeeDialog initial={editing} onClose={() => setOpen(false)} />}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function EmployeeDialog({ initial, onClose }: { initial: RHEmployee | null; onClose: () => void }) {
  const { upsert, linkAccount } = useRHEmployees();
  const { companies } = useRHCompanies();
  const { departments } = useRHDepartments();
  const [f, setF] = useState({
    id: initial?.id,
    full_name: initial?.full_name || '',
    cpf: initial?.cpf || '',
    birth_date: initial?.birth_date || '',
    company_id: initial?.company_id || (companies[0]?.id ?? ''),
    department: initial?.department || '',
    job_title: initial?.job_title || initial?.position || '',
    manager_name: initial?.manager_name || '',
    contract_type: initial?.contract_type || 'CLT',
    admission_date: initial?.admission_date || '',
    base_salary: String(initial?.base_salary ?? 0),
    status: initial?.status || 'ativo',
    termination_date: initial?.termination_date || '',
    matricula: initial?.matricula || '',
    access_email: initial?.access_email || '',
  });
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? 'Editar colaborador' : 'Novo colaborador'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Nome completo *</Label><Input value={f.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><Label>CPF</Label><Input value={f.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" /></div>
          <div><Label>Data de nascimento</Label><Input type="date" value={f.birth_date} onChange={e => set('birth_date', e.target.value)} /></div>
          <div>
            <Label>Empresa</Label>
            <Select value={f.company_id} onValueChange={v => set('company_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Departamento</Label>
            <Select value={f.department} onValueChange={v => set('department', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Cargo</Label><Input value={f.job_title} onChange={e => set('job_title', e.target.value)} /></div>
          <div><Label>Gestor</Label><Input value={f.manager_name} onChange={e => set('manager_name', e.target.value)} /></div>
          <div>
            <Label>Tipo de contrato</Label>
            <Select value={f.contract_type} onValueChange={v => set('contract_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Matrícula</Label><Input value={f.matricula} onChange={e => set('matricula', e.target.value)} /></div>
          <div><Label>Admissão</Label><Input type="date" value={f.admission_date} onChange={e => set('admission_date', e.target.value)} /></div>
          <div><Label>Salário base (R$)</Label><Input type="number" step="0.01" value={f.base_salary} onChange={e => set('base_salary', e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.status === 'desligado' && (
            <div><Label>Data de desligamento</Label><Input type="date" value={f.termination_date} onChange={e => set('termination_date', e.target.value)} /></div>
          )}
          <div className="col-span-2 mt-2 p-3 rounded-md border bg-muted/30 space-y-2">
            <Label className="flex items-center gap-2"><LinkIcon className="w-3.5 h-3.5" />E-mail de acesso ao sistema</Label>
            <Input
              type="email"
              placeholder="email@empresa.com"
              value={f.access_email}
              onChange={e => set('access_email', e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Vincula este cadastro à conta de acesso para que o colaborador veja seus dados em <b>Meu RH</b>.
              Se o usuário ainda não tem conta, envie um convite em <b>Configurações → Usuários</b> — o vínculo será feito automaticamente quando ele aceitar.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!f.full_name} onClick={async () => {
            const saved: any = await upsert.mutateAsync({
              ...f,
              base_salary: Number(f.base_salary) || 0,
              cpf: f.cpf || null,
              birth_date: f.birth_date || null,
              admission_date: f.admission_date || null,
              termination_date: f.termination_date || null,
              company_id: f.company_id || null,
              access_email: f.access_email ? f.access_email.toLowerCase().trim() : null,
            } as any);
            // Atrelar conta se houver e-mail informado
            const empId = f.id || saved?.id;
            if (f.access_email && empId) {
              try { await linkAccount.mutateAsync({ employee_id: empId, email: f.access_email }); } catch {}
            }
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
