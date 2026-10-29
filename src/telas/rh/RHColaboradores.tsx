import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { todayISO } from '@/lib/dates';
import { Users, Edit3, Plus, Search, UserMinus, Link as LinkIcon, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { ImportarColaboradoresDialog } from '@/components/rh/ImportarColaboradoresDialog';
import { LoginsForaDaLista } from '@/components/rh/LoginsForaDaLista';
import { useRHEmployees, useRHCompanies, useRHDepartments, type RHEmployee } from '@/hooks/useRH';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { fmtBRL, CompanyPicker } from '@/components/rh/shared';
import { useQueryState } from '@/hooks/useQueryState';
import { RH_STATUS_OPCOES } from '@/lib/rh-status';
import { usePodeNoRH } from '@/hooks/useAccessProfiles';

const CONTRACT_TYPES = ['CLT', 'PJ', 'Estágio', 'Temporário', 'Aprendiz'];
// A lista saiu daqui para `@/lib/rh-status` em 2026-09-27: ela morava só nesta
// tela, sem ser exportada, e outra tela redigitou a situação — em inglês
// (`'active'`), que nada grava. O cartão "Ativos" do relatório dava zero.
const STATUS_OPTIONS = RH_STATUS_OPCOES;

export default function RHColaboradores() {
  const [search, setSearch] = useQueryState<string>('busca', '');
  const [companyParam, setCompanyParam] = useQueryState<string>('empresa', '');
  const companyId = companyParam || null;
  const setCompanyId = (v: string | null) => setCompanyParam(v || '');
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'ativo');
  const [editing, setEditing] = useState<RHEmployee | null>(null);
  const [open, setOpen] = useState(false);
  const [desligando, setDesligando] = useState<RHEmployee | null>(null);
  const [importando, setImportando] = useState(false);
  const { employees, isLoading, desligar } = useRHEmployees({ companyId, status: statusFilter || undefined });
  const { companies } = useRHCompanies();
  // Perfil do RH (decisão do dono, 2026-10-01): criar e editar, e ver salário, são caixinhas.
  const { pode } = usePodeNoRH();
  const edita = pode('employees', 'edit');
  const verSalario = pode('employees', 'view_salary');

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
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Colaboradores"
        description="A lista do RH: todo colaborador, com ou sem login no Helpoint. Holerite, documento, benefício e férias são de quem está aqui."
        icon={Users}
        actions={(
          <>
            <CompanyPicker value={companyId} onChange={setCompanyId} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="afastado">Afastados</SelectItem>
                <SelectItem value="desligado">Desligados</SelectItem>
              </SelectContent>
            </Select>
            {edita && <Button variant="outline" className="max-[860px]:hidden" onClick={() => setImportando(true)}><FileSpreadsheet className="w-3.5 h-3.5 mr-1" aria-hidden="true" />Importar planilha</Button>}
            {edita && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Novo</Button>}
          </>
        )}
      />

      <div className="px-4 lg:px-8 pb-6 w-full space-y-4">

      <LoginsForaDaLista podeIncluir={edita} />
      {importando && <ImportarColaboradoresDialog open={importando} onOpenChange={setImportando} />}

      {(() => {
        // Fim de experiência nos próximos 7 dias (etapa 4 · RH, 2026-10-24): o RH decide antes do prazo, não depois.
        const hoje = new Date();
        const perto = filtered.flatMap((r) => (['probation_45', 'probation_90'] as const)
          .map((k) => ({ r, k, d: r[k] ? differenceInCalendarDays(parseISO(r[k] as string), hoje) : null }))
          .filter((x) => x.d !== null && x.d >= 0 && x.d <= 7));
        if (perto.length === 0) return null;
        return (
          <div className="rounded-lg border border-border bg-card p-3 text-[14px]">
            <p className="font-semibold mb-1">Experiência terminando nos próximos 7 dias</p>
            <ul className="space-y-0.5">
              {perto.map(({ r, k, d }) => (
                <li key={r.id + k}>
                  {r.full_name} · {k === 'probation_45' ? '45 dias' : '90 dias'} em {format(parseISO(r[k] as string), 'dd/MM')}
                  <span className="text-muted-foreground">{d === 0 ? ' (hoje)' : d === 1 ? ' (amanhã)' : ` (em ${d} dias)`}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock label="Total" value={stats.total} />
        {verSalario && <StatBlock label="Folha base estimada" value={fmtBRL(stats.totalSalary)} />}
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
          {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div> :
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
                    {verSalario && <th className="text-right py-2 px-2">Salário</th>}
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
                          <div className="text-[12px] text-muted-foreground">{r.cpf || '—'}</div>
                        </td>
                        <td className="py-2 px-2"><Badge variant="outline" className="text-[12px]">{r.company_id ? companyMap[r.company_id]?.code : '—'}</Badge></td>
                        <td className="py-2 px-2">
                          <div>{r.job_title || r.position || '—'}</div>
                          <div className="text-[12px] text-muted-foreground">{r.department || '—'}</div>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{r.manager_name || '—'}</td>
                        <td className="py-2 px-2"><Badge variant="outline" className="text-[12px]">{r.contract_type || 'CLT'}</Badge></td>
                        <td className="py-2 px-2 text-muted-foreground">{r.admission_date ? format(parseISO(r.admission_date), 'dd/MM/yyyy') : '—'}</td>
                        <td className="py-2 px-2 text-[12px] text-muted-foreground">
                          {r.probation_45 ? format(parseISO(r.probation_45), 'dd/MM') : '—'} / {r.probation_90 ? format(parseISO(r.probation_90), 'dd/MM/yyyy') : '—'}
                        </td>
                        {verSalario && <td className="py-2 px-2 text-right font-medium">{fmtBRL(r.base_salary)}</td>}
                        <td className="py-2 px-2"><Badge className={`text-[12px] border-0 ${status?.class || ''}`}>{status?.label || r.status}</Badge></td>
                        <td className="py-2 px-2">
                          {r.user_id ? (
                            <Badge className="text-[12px] badge-success text-status-success border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Vinculado</Badge>
                          ) : r.access_email ? (
                            <Badge className="text-[12px] badge-warning text-status-warning border-0">Aguardando aceite</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[12px]">Sem conta</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">{edita && (<>
                          <Button aria-label="Editar colaborador" size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 aria-hidden="true" className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Desligar" aria-label={`Desligar ${r.full_name}`} onClick={() => setDesligando(r)}><UserMinus className="w-3.5 h-3.5 text-muted-foreground" /></Button></>)}
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
      {desligando && (
        <DesligarDialog colaborador={desligando} enviando={desligar.isPending} onFechar={() => setDesligando(null)}
          onConfirmar={(data, motivo) => desligar.mutate({ id: desligando.id, data, motivo }, { onSuccess: () => setDesligando(null) })} />
      )}
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function EmployeeDialog({ initial, onClose }: { initial: RHEmployee | null; onClose: () => void }) {
  const { upsert, linkAccount } = useRHEmployees();
  const { companies } = useRHCompanies();
  // Sem "ver salário" o campo some do formulário; o valor gravado continua o que estava.
  const { pode } = usePodeNoRH();
  const verSalario = pode('employees', 'view_salary');
  const { departments } = useRHDepartments();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [f, setF] = useState({
    id: initial?.id,
    full_name: initial?.full_name || '',
    cpf: initial?.cpf || '',
    birth_date: initial?.birth_date || '',
    company_id: initial?.company_id || (companies[0]?.id ?? ''),
    department: initial?.department || '',
    job_title: initial?.job_title || initial?.position || '',
    manager_name: initial?.manager_name || '',
    manager_user_id: initial?.manager_user_id || '',
    contract_type: initial?.contract_type || 'CLT',
    admission_date: initial?.admission_date || '',
    // Vazio = o RH não informou, e o Meu RH mostra "----" (dono, 2026-10-03; 20261129010000).
    vacation_balance_days: initial?.vacation_balance_days == null ? '' : String(initial.vacation_balance_days),
    base_salary: String(initial?.base_salary ?? 0),
    status: initial?.status || 'ativo',
    termination_date: initial?.termination_date || '',
    matricula: initial?.matricula || '',
    access_email: initial?.access_email || '',
    // Almoço opcional (dono, 2026-10-04): o prazo dos chamados que a pessoa atende para nele.
    inicio_almoco: initial?.inicio_almoco?.slice(0, 5) || '',
    fim_almoco: initial?.fim_almoco?.slice(0, 5) || '',
  });
  // Os dois juntos, ou nenhum; e o fim depois do início (o banco confere o mesmo).
  const almocoValido = (!f.inicio_almoco && !f.fim_almoco) || (!!f.inicio_almoco && !!f.fim_almoco && f.fim_almoco > f.inicio_almoco);
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? 'Editar colaborador' : 'Novo colaborador'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <p className="col-span-2 text-[13px] font-semibold text-muted-foreground">Pessoal</p>
          <div className="col-span-2"><Label>Nome completo *</Label><Input value={f.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><Label>CPF</Label><Input value={f.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" /></div>
          <div><Label>Data de nascimento</Label><Input type="date" value={f.birth_date} onChange={e => set('birth_date', e.target.value)} /></div>
          <p className="col-span-2 text-[13px] font-semibold text-muted-foreground mt-2">Contrato</p>
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
          <div>
            <Label>Gestor</Label>
            {/* Da lista de pessoas (etapa 4 · RH, 2026-10-24): era texto livre, e o mesmo gestor aparecia com três grafias. */}
            <Select value={f.manager_user_id || 'nenhum'} onValueChange={(v) => {
              const p = pessoas.find((x) => x.id === v);
              setF((s) => ({ ...s, manager_user_id: v === 'nenhum' ? '' : v, manager_name: v === 'nenhum' ? '' : (p?.nome ?? s.manager_name) }));
            }}>
              <SelectTrigger><SelectValue placeholder={f.manager_name || 'Escolha'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem gestor</SelectItem>
                {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de contrato</Label>
            <Select value={f.contract_type} onValueChange={v => set('contract_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Matrícula</Label><Input value={f.matricula} onChange={e => set('matricula', e.target.value)} /></div>
          <div><Label>Admissão</Label><Input type="date" value={f.admission_date} onChange={e => set('admission_date', e.target.value)} /></div>
          <div>
            <Label>Saldo de férias (dias)</Label>
            <Input type="number" min={0} step={1} placeholder="Não informado"
              value={f.vacation_balance_days} onChange={e => set('vacation_balance_days', e.target.value)} />
          </div>
          <div>
            <Label>Almoço (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input type="time" aria-label="Início do almoço" value={f.inicio_almoco} onChange={e => set('inicio_almoco', e.target.value)} />
              <span className="text-xs text-muted-foreground">às</span>
              <Input type="time" aria-label="Fim do almoço" value={f.fim_almoco} onChange={e => set('fim_almoco', e.target.value)} />
            </div>
            <p className={`text-[12px] mt-1 ${almocoValido ? 'text-muted-foreground' : 'text-destructive'}`}>
              {almocoValido
                ? 'O prazo dos chamados que a pessoa atende para nesse horário.'
                : 'Preencha início e fim, com o fim depois do início — ou deixe os dois em branco.'}
            </p>
          </div>
          <p className="col-span-2 text-[13px] font-semibold text-muted-foreground mt-2">Pagamento e situação</p>
          {verSalario && <div><Label>Salário base (R$)</Label><Input type="number" step="0.01" value={f.base_salary} onChange={e => set('base_salary', e.target.value)} /></div>}
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
            <p className="text-[12px] text-muted-foreground">
              Vincula este cadastro à conta de acesso para que o colaborador veja seus dados em <b>Meu RH</b>.
              Se o usuário ainda não tem conta, envie um convite em <b>Configurações → Pessoas e acessos</b> — o vínculo será feito automaticamente quando ele aceitar.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!f.full_name || !almocoValido} onClick={async () => {
            const saved: any = await upsert.mutateAsync({
              ...f,
              // Sem "Ver salário" o campo não vai: o banco recusaria, e o valor gravado fica.
              ...(verSalario ? { base_salary: Number(f.base_salary) || 0 } : {}),
              cpf: f.cpf || null,
              birth_date: f.birth_date || null,
              admission_date: f.admission_date || null,
              vacation_balance_days: f.vacation_balance_days === '' ? null : Math.max(0, Math.trunc(Number(f.vacation_balance_days))),
              termination_date: f.termination_date || null,
              company_id: f.company_id || null,
              manager_user_id: f.manager_user_id || null,
              access_email: f.access_email ? f.access_email.toLowerCase().trim() : null,
              inicio_almoco: f.inicio_almoco || null,
              fim_almoco: f.fim_almoco || null,
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

/**
 * O assistente de desligamento (etapa 4 · RH, 2026-10-25): data e motivo, e o que vai acontecer dito antes de
 * confirmar — o chamado da TI na hora e o login parando no dia (decisão do dono). Antes era um "tem certeza?" que
 * gravava a data de hoje e mais nada.
 */
function DesligarDialog({ colaborador, enviando, onFechar, onConfirmar }: {
  colaborador: RHEmployee; enviando: boolean; onFechar: () => void; onConfirmar: (data: string, motivo: string) => void;
}) {
  const hoje = todayISO();
  const [data, setData] = useState(hoje);
  const [motivo, setMotivo] = useState('');
  const dia = data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : '';
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desligar {colaborador.full_name}</DialogTitle>
          <DialogDescription>O cadastro e o histórico (férias, atestados, holerites) continuam guardados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deslig-data">Último dia</Label>
            <Input id="deslig-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deslig-motivo">Motivo</Label>
            <Textarea id="deslig-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Pedido de demissão, fim de contrato…" />
          </div>
          <div className="rounded-md border border-border p-3 text-[13px] space-y-1">
            <p className="font-medium">O que acontece ao confirmar</p>
            {colaborador.user_id ? (
              <>
                <p>A TI recebe agora o chamado para recolher os equipamentos e tirar os acessos.</p>
                <p>{!data ? 'Escolha o dia.' : data <= hoje ? 'O login no Helpoint é bloqueado agora.' : `O login no Helpoint continua até ${dia} e para sozinho nesse dia.`}</p>
              </>
            ) : (
              <p>Esta pessoa não tem login no Helpoint: nenhum chamado é aberto na TI.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button variant="destructive" disabled={!data || enviando} onClick={() => onConfirmar(data, motivo.trim())}>
            {enviando ? 'Desligando…' : 'Desligar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
