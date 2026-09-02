import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bus, UtensilsCrossed, Fuel, Wallet, Plus, Trash2, Edit3, Copy } from 'lucide-react';
import { useRHTransport, useRHMeal, useRHFuel, useRHDeductions, useRHEmployees } from '@/hooks/useRH';
import { currentMonth, fmtBRL, MonthPicker, EmployeeSelect } from '@/components/rh/shared';
import { useQueryState } from '@/hooks/useQueryState';

export default function RHReembolsos() {
  const [month, setMonth] = useQueryState('mes', currentMonth());
  const [tab, setTab] = useQueryState('aba', 'va');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <MonthPicker value={month} onChange={setMonth} />
      </div>


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="va"><UtensilsCrossed className="w-3.5 h-3.5 mr-1.5" />Vale-Alimentação</TabsTrigger>
          <TabsTrigger value="vt"><Bus className="w-3.5 h-3.5 mr-1.5" />Vale-Transporte</TabsTrigger>
          <TabsTrigger value="fuel"><Fuel className="w-3.5 h-3.5 mr-1.5" />Combustível</TabsTrigger>
          <TabsTrigger value="ded"><Wallet className="w-3.5 h-3.5 mr-1.5" />Descontos</TabsTrigger>
        </TabsList>

        <TabsContent value="va"><MealTab month={month} /></TabsContent>
        <TabsContent value="vt"><TransportTab month={month} /></TabsContent>
        <TabsContent value="fuel"><FuelTab month={month} /></TabsContent>
        <TabsContent value="ded"><DeductionsTab month={month} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============= Vale Alimentação =============
function MealTab({ month }: { month: string }) {
  const { rows, isLoading, upsert, remove, replicatePrevious } = useRHMeal(month);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const total = rows.reduce((a, r: any) => a + (Number(r.total) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Vale-Alimentação</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Total do mês: <strong>{fmtBRL(total)}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => replicatePrevious.mutate()}><Copy className="w-3.5 h-3.5 mr-1" />Replicar mês anterior</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Lançar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div> :
          rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Sem lançamentos.</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Colaborador</th>
                <th className="text-right py-2 px-2">Valor/dia</th>
                <th className="text-right py-2 px-2">Dias</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-right py-2 px-2">Desc. 20% (colab.)</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium">{r.employee?.full_name || '—'}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.value_per_day)}</td>
                  <td className="py-2 px-2 text-right">{r.days}</td>
                  <td className="py-2 px-2 text-right font-medium">{fmtBRL(r.total)}</td>
                  <td className="py-2 px-2 text-right text-rose-600">{fmtBRL(r.employee_share_20)}</td>
                  <td className="py-2 px-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm('Remover?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {open && <MealDialog month={month} initial={editing} upsert={upsert} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function MealDialog({ month, initial, upsert, onClose }: any) {
  const { employees } = useRHEmployees({ status: 'ativo' });
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || '');
  const [valuePerDay, setValuePerDay] = useState(String(initial?.value_per_day ?? 18.81));
  const [days, setDays] = useState(String(initial?.days ?? 20));
  const total = (Number(valuePerDay) || 0) * (Number(days) || 0);
  const share = total * 0.20;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar' : 'Novo'} Vale-Alimentação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Colaborador</Label><EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor/dia</Label><Input type="number" step="0.01" value={valuePerDay} onChange={e => setValuePerDay(e.target.value)} /></div>
            <div><Label>Dias</Label><Input type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          </div>
          <div className="text-sm bg-muted/30 rounded p-2 flex justify-between"><span>Total:</span><strong>{fmtBRL(total)}</strong></div>
          <div className="text-xs text-muted-foreground flex justify-between"><span>Desc. 20% colaborador:</span><span>{fmtBRL(share)}</span></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!employeeId} onClick={async () => {
            await upsert.mutateAsync({
              id: initial?.id, employee_id: employeeId,
              value_per_day: Number(valuePerDay) || 0, days: Number(days) || 0,
              total, employee_share_20: share,
            });
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Vale Transporte =============
function TransportTab({ month }: { month: string }) {
  const { rows, isLoading, upsert, remove, replicatePrevious } = useRHTransport(month);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const total = rows.reduce((a, r: any) => a + (Number(r.to_deposit) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Vale-Transporte</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Total a depositar no mês: <strong>{fmtBRL(total)}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => replicatePrevious.mutate()}><Copy className="w-3.5 h-3.5 mr-1" />Replicar mês anterior</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Lançar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div> :
          rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Sem lançamentos.</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Colaborador</th>
                <th className="text-right py-2 px-2">Ônibus/dia</th>
                <th className="text-right py-2 px-2">Metrô/dia</th>
                <th className="text-right py-2 px-2">Dias úteis</th>
                <th className="text-right py-2 px-2">Valor/dia</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-right py-2 px-2">Saldo ant.</th>
                <th className="text-right py-2 px-2">A depositar</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium">{r.employee?.full_name || '—'}</td>
                  <td className="py-2 px-2 text-right">{r.bus_trips_per_day}</td>
                  <td className="py-2 px-2 text-right">{r.metro_trips_per_day}</td>
                  <td className="py-2 px-2 text-right">{r.work_days}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.value_per_day)}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.total)}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground">{fmtBRL(r.previous_balance)}</td>
                  <td className="py-2 px-2 text-right font-semibold text-green-700">{fmtBRL(r.to_deposit)}</td>
                  <td className="py-2 px-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm('Remover?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {open && <TransportDialog month={month} initial={editing} upsert={upsert} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function TransportDialog({ month, initial, upsert, onClose }: any) {
  const { employees } = useRHEmployees({ status: 'ativo' });
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || '');
  const [bus, setBus] = useState(String(initial?.bus_trips_per_day ?? 2));
  const [metro, setMetro] = useState(String(initial?.metro_trips_per_day ?? 0));
  const [days, setDays] = useState(String(initial?.work_days ?? 20));
  const [vpd, setVpd] = useState(String(initial?.value_per_day ?? 0));
  const [balance, setBalance] = useState(String(initial?.previous_balance ?? 0));
  const total = ((Number(bus) || 0) + (Number(metro) || 0)) * (Number(vpd) || 0) * (Number(days) || 0) / (((Number(bus) || 0) + (Number(metro) || 0)) || 1);
  const totalCalc = (Number(vpd) || 0) * (Number(days) || 0);
  const toDeposit = Math.max(totalCalc - (Number(balance) || 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar' : 'Novo'} Vale-Transporte</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Colaborador</Label><EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Ônibus/dia</Label><Input type="number" step="0.5" value={bus} onChange={e => setBus(e.target.value)} /></div>
            <div><Label>Metrô/dia</Label><Input type="number" step="0.5" value={metro} onChange={e => setMetro(e.target.value)} /></div>
            <div><Label>Dias úteis</Label><Input type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Valor/dia (R$)</Label><Input type="number" step="0.01" value={vpd} onChange={e => setVpd(e.target.value)} /></div>
            <div><Label>Saldo anterior</Label><Input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} /></div>
          </div>
          <div className="text-sm bg-muted/30 rounded p-2 space-y-1">
            <div className="flex justify-between"><span>Total:</span><strong>{fmtBRL(totalCalc)}</strong></div>
            <div className="flex justify-between text-green-700"><span>A depositar:</span><strong>{fmtBRL(toDeposit)}</strong></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!employeeId} onClick={async () => {
            await upsert.mutateAsync({
              id: initial?.id, employee_id: employeeId,
              bus_trips_per_day: Number(bus) || 0, metro_trips_per_day: Number(metro) || 0,
              work_days: Number(days) || 0, value_per_day: Number(vpd) || 0,
              total: totalCalc, previous_balance: Number(balance) || 0, to_deposit: toDeposit,
            });
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Combustível =============
function FuelTab({ month }: { month: string }) {
  const { rows, isLoading, upsert, remove, replicatePrevious } = useRHFuel(month);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const total = rows.reduce((a, r: any) => a + (Number(r.to_pay) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Reembolso de Combustível</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Total a pagar no mês: <strong>{fmtBRL(total)}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => replicatePrevious.mutate()}><Copy className="w-3.5 h-3.5 mr-1" />Replicar mês anterior</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Lançar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div> :
          rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Sem lançamentos.</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Colaborador</th>
                <th className="text-right py-2 px-2">Km/dia</th>
                <th className="text-right py-2 px-2">R$/km</th>
                <th className="text-right py-2 px-2">Dias</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-right py-2 px-2">Desc. salário (6%)</th>
                <th className="text-right py-2 px-2">A pagar</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium">{r.employee?.full_name || '—'}</td>
                  <td className="py-2 px-2 text-right">{r.km_per_day}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.price_per_km)}</td>
                  <td className="py-2 px-2 text-right">{r.work_days}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.total)}</td>
                  <td className="py-2 px-2 text-right text-rose-600">{fmtBRL(r.salary_discount)}</td>
                  <td className="py-2 px-2 text-right font-semibold text-green-700">{fmtBRL(r.to_pay)}</td>
                  <td className="py-2 px-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm('Remover?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {open && <FuelDialog month={month} initial={editing} upsert={upsert} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function FuelDialog({ month, initial, upsert, onClose }: any) {
  const { employees } = useRHEmployees({ status: 'ativo' });
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || '');
  const [km, setKm] = useState(String(initial?.km_per_day ?? 0));
  const [price, setPrice] = useState(String(initial?.price_per_km ?? 0.70));
  const [days, setDays] = useState(String(initial?.work_days ?? 20));
  const emp: any = employees.find(e => e.id === employeeId);
  const total = (Number(km) || 0) * (Number(price) || 0) * (Number(days) || 0);
  const discount = emp ? Number(emp.base_salary || 0) * 0.06 : 0;
  const toPay = Math.max(total - discount, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar' : 'Novo'} Combustível</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Colaborador</Label><EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Km/dia</Label><Input type="number" step="0.1" value={km} onChange={e => setKm(e.target.value)} /></div>
            <div><Label>R$/km</Label><Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></div>
            <div><Label>Dias</Label><Input type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          </div>
          <div className="text-sm bg-muted/30 rounded p-2 space-y-1">
            <div className="flex justify-between"><span>Total:</span><strong>{fmtBRL(total)}</strong></div>
            <div className="flex justify-between text-rose-600"><span>Desc. salário 6%:</span><span>{fmtBRL(discount)}</span></div>
            <div className="flex justify-between text-green-700 border-t pt-1"><span>A pagar:</span><strong>{fmtBRL(toPay)}</strong></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!employeeId} onClick={async () => {
            await upsert.mutateAsync({
              id: initial?.id, employee_id: employeeId,
              km_per_day: Number(km) || 0, price_per_km: Number(price) || 0, work_days: Number(days) || 0,
              value_per_day: (Number(km) || 0) * (Number(price) || 0),
              total, salary_discount: discount, to_pay: toPay,
            });
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Descontos =============
function DeductionsTab({ month }: { month: string }) {
  const { rows, isLoading, upsert, remove, replicatePrevious } = useRHDeductions(month);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const totals = useMemo(() => ({
    mobility: rows.reduce((a, r: any) => a + (Number(r.mobility) || 0), 0),
    health: rows.reduce((a, r: any) => a + (Number(r.health_plan) || 0) + (Number(r.health_coparticipation) || 0), 0),
    loan: rows.reduce((a, r: any) => a + (Number(r.payroll_loan) || 0), 0),
  }), [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Descontos avulsos do mês</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Mobilidade: <strong>{fmtBRL(totals.mobility)}</strong> · Plano de saúde: <strong>{fmtBRL(totals.health)}</strong> · Empréstimo: <strong>{fmtBRL(totals.loan)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => replicatePrevious.mutate()}><Copy className="w-3.5 h-3.5 mr-1" />Replicar mês anterior</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Lançar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div> :
          rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Sem lançamentos.</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Colaborador</th>
                <th className="text-right py-2 px-2">Mobilidade</th>
                <th className="text-right py-2 px-2">Plano saúde</th>
                <th className="text-right py-2 px-2">Coparticip.</th>
                <th className="text-right py-2 px-2">Empréstimo</th>
                <th className="text-right py-2 px-2">Desc. VA</th>
                <th className="text-right py-2 px-2">Sal. família</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium">{r.employee?.full_name || '—'}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.mobility)}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.health_plan)}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.health_coparticipation)}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.payroll_loan)}</td>
                  <td className="py-2 px-2 text-right">{fmtBRL(r.meal_voucher_discount)}</td>
                  <td className="py-2 px-2 text-right text-green-700">{fmtBRL(r.family_allowance)}</td>
                  <td className="py-2 px-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm('Remover?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {open && <DeductionDialog month={month} initial={editing} upsert={upsert} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function DeductionDialog({ month, initial, upsert, onClose }: any) {
  const { employees } = useRHEmployees({ status: 'ativo' });
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || '');
  const [f, setF] = useState({
    mobility: String(initial?.mobility ?? 0),
    health_plan: String(initial?.health_plan ?? 0),
    health_coparticipation: String(initial?.health_coparticipation ?? 0),
    payroll_loan: String(initial?.payroll_loan ?? 0),
    meal_voucher_discount: String(initial?.meal_voucher_discount ?? 0),
    family_allowance: String(initial?.family_allowance ?? 0),
  });
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar' : 'Novo'} desconto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Colaborador</Label><EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mobilidade" value={f.mobility} onChange={v => set('mobility', v)} />
            <Field label="Plano de saúde" value={f.health_plan} onChange={v => set('health_plan', v)} />
            <Field label="Coparticipação" value={f.health_coparticipation} onChange={v => set('health_coparticipation', v)} />
            <Field label="Empréstimo em folha" value={f.payroll_loan} onChange={v => set('payroll_loan', v)} />
            <Field label="Desc. VA" value={f.meal_voucher_discount} onChange={v => set('meal_voucher_discount', v)} />
            <Field label="Salário-família (+)" value={f.family_allowance} onChange={v => set('family_allowance', v)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!employeeId} onClick={async () => {
            await upsert.mutateAsync({
              id: initial?.id, employee_id: employeeId,
              ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v) || 0])),
            });
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><Label className="text-xs">{label}</Label><Input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)} /></div>;
}
