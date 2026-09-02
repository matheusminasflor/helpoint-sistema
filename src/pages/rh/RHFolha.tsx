import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Banknote, RefreshCw, Trash2, Search } from 'lucide-react';
import { useRHPayroll } from '@/hooks/useRH';
import { currentMonth, fmtBRL, MonthPicker, CompanyPicker } from '@/components/rh/shared';
import { useQueryState } from '@/hooks/useQueryState';

const EDITABLE: { key: string; label: string }[] = [
  { key: 'gross_salary', label: 'Bruto' },
  { key: 'family_allowance', label: 'Sal. Família' },
  { key: 'advance', label: 'Adiantamento' },
  { key: 'meal_voucher', label: 'VA' },
  { key: 'transport_voucher', label: 'VT' },
  { key: 'health_plan', label: 'Plano Saúde' },
  { key: 'health_coparticipation', label: 'Coparticip.' },
  { key: 'payroll_loan', label: 'Empréstimo' },
  { key: 'mobility', label: 'Combustível' },
  { key: 'inss', label: 'INSS' },
  { key: 'irpf', label: 'IRPF' },
  { key: 'other_deductions', label: 'Outros desc.' },
  { key: 'thirteenth_vacation', label: '13º + Férias' },
  { key: 'irpf_thirteenth', label: 'IRPF 13/Fér.' },
];

export default function RHFolha() {
  const [month, setMonth] = useQueryState<string>('mes', currentMonth());
  const [companyParam, setCompanyParam] = useQueryState<string>('empresa', '');
  const companyId = companyParam || null;
  const setCompanyId = (v: string | null) => setCompanyParam(v || '');
  const [search, setSearch] = useQueryState<string>('busca', '');
  const { entries, isLoading, update, generate, remove } = useRHPayroll(month);

  const filtered = useMemo(() => {
    let rows = entries as any[];
    if (companyId) rows = rows.filter(r => r.company_id === companyId);
    const q = search.toLowerCase().trim();
    if (q) rows = rows.filter(r => (r.employee?.full_name || '').toLowerCase().includes(q));
    return rows;
  }, [entries, companyId, search]);

  const totals = useMemo(() => {
    const sum = (k: string) => filtered.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
    return {
      count: filtered.length,
      gross: sum('gross_salary'),
      net: sum('net_salary'),
      inss: sum('inss'),
      irpf: sum('irpf'),
      meal: sum('meal_voucher'),
      transport: sum('transport_voucher'),
      health: sum('health_plan') + sum('health_coparticipation'),
      advance: sum('advance'),
      thirteenth: sum('thirteenth_vacation'),
    };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ['Empresa', 'Colaborador', 'Departamento', ...EDITABLE.map(e => e.label), 'Total descontos', 'Líquido'];
    const lines = filtered.map((r: any) => [
      r.company?.code || '', r.employee?.full_name || '', r.employee?.department || '',
      ...EDITABLE.map(e => Number(r[e.key]) || 0), r.total_deductions, r.net_salary,
    ].join(';'));
    const blob = new Blob([[headers.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `folha-${month}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Folha de Pagamento</h1>
            <p className="text-sm text-muted-foreground">Lançamentos mensais por colaborador, com cálculo automático de INSS e IRPF.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <CompanyPicker value={companyId} onChange={setCompanyId} />
          <Button variant="outline" size="sm" onClick={() => generate.mutate(companyId)} disabled={generate.isPending}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {generate.isPending ? 'Gerando...' : 'Gerar folha do mês'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>Exportar CSV</Button>
        </div>
      </div>

      {/* Resumo */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3 text-sm">
            <Stat label="Colaboradores" value={totals.count} />
            <Stat label="Bruto" value={fmtBRL(totals.gross)} />
            <Stat label="Líquido" value={fmtBRL(totals.net)} highlight />
            <Stat label="INSS" value={fmtBRL(totals.inss)} />
            <Stat label="IRPF" value={fmtBRL(totals.irpf)} />
            <Stat label="VA" value={fmtBRL(totals.meal)} />
            <Stat label="VT" value={fmtBRL(totals.transport)} />
            <Stat label="Plano saúde" value={fmtBRL(totals.health)} />
            <Stat label="Adiantamentos" value={fmtBRL(totals.advance)} />
            <Stat label="13º + Férias (prov.)" value={fmtBRL(totals.thirteenth)} />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Folha — {new Date(month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 w-64" placeholder="Buscar colaborador" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum lançamento neste mês. Clique em <strong>"Gerar folha do mês"</strong> para criar lançamentos pré-preenchidos para todos os colaboradores ativos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b sticky top-0 bg-white">
                  <tr>
                    <th className="text-left px-2 py-2 sticky left-0 bg-white z-10">Colaborador</th>
                    <th className="text-left px-2 py-2">Empresa</th>
                    {EDITABLE.map(c => <th key={c.key} className="text-right px-2 py-2">{c.label}</th>)}
                    <th className="text-right px-2 py-2 font-semibold">Total Desc.</th>
                    <th className="text-right px-2 py-2 font-semibold">Líquido</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-1.5 sticky left-0 bg-white">
                        <div className="font-medium">{r.employee?.full_name || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{r.employee?.department || '—'} · {r.employee?.job_title || '—'}</div>
                      </td>
                      <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{r.company?.code || '—'}</Badge></td>
                      {EDITABLE.map(c => (
                        <td key={c.key} className="px-1 py-1">
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={r[c.key]}
                            className="h-7 w-24 text-right text-xs"
                            onBlur={e => {
                              const v = Number(e.target.value) || 0;
                              if (v !== Number(r[c.key])) update.mutate({ id: r.id, patch: { [c.key]: v } });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-medium">{fmtBRL(r.total_deductions)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-green-700">{fmtBRL(r.net_salary)}</td>
                      <td className="px-1 py-1">
                        <Button size="sm" variant="ghost" onClick={() => confirm('Remover lançamento?') && remove.mutate(r.id)}>
                          <Trash2 className="w-3 h-3 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground pt-2">
            Os valores são pré-preenchidos com base no salário base, benefícios e descontos do mês.
            Edite qualquer célula para ajustar; o líquido e os totais são recalculados ao usar <strong>"Gerar folha do mês"</strong> novamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-md bg-green-50 border border-green-200 px-3 py-2' : 'rounded-md border px-3 py-2'}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? 'text-green-700' : ''}`}>{value}</div>
    </div>
  );
}
