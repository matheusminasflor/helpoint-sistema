import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarOff, Plus, Trash2, Edit3 } from 'lucide-react';
import { useRHAbsences, useRHEmployees } from '@/hooks/useRH';
import { currentMonth, MonthPicker, EmployeeSelect } from '@/components/rh/shared';
import { useQueryState } from '@/hooks/useQueryState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const KINDS = [
  { value: 'falta', label: 'Falta' },
  { value: 'atestado', label: 'Atestado médico' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'atraso', label: 'Atraso' },
  { value: 'saida_antecipada', label: 'Saída antecipada' },
];

const KIND_COLOR: Record<string, string> = {
  falta: 'bg-rose-50 text-rose-700 border-rose-200',
  atestado: 'bg-blue-50 text-blue-700 border-blue-200',
  consulta: 'bg-amber-50 text-amber-800 border-amber-200',
  atraso: 'bg-orange-50 text-orange-800 border-orange-200',
  saida_antecipada: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function RHFaltas() {
  const [month, setMonth] = useQueryState('mes', currentMonth());
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const { absences, isLoading, remove } = useRHAbsences(month);

  const stats = useMemo(() => {
    const days = absences.reduce((a, r: any) => a + (Number(r.days) || 0), 0);
    const justified = absences.filter((r: any) => r.justified).length;
    const byKind: Record<string, number> = {};
    absences.forEach((r: any) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
    return { total: absences.length, days, justified, byKind };
  }, [absences]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarOff className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Faltas e Atestados</h1>
            <p className="text-sm text-muted-foreground">Justificativas de faltas, atestados, consultas e atrasos do mês.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />Lançar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Lançamentos" value={stats.total} />
        <Stat label="Dias perdidos" value={stats.days.toFixed(1)} />
        <Stat label="Justificadas" value={`${stats.justified} de ${stats.total}`} />
        <Stat label="Tipos" value={Object.keys(stats.byKind).length} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Registros</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : absences.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Data</th>
                    <th className="text-left py-2 px-2">Colaborador</th>
                    <th className="text-left py-2 px-2">Departamento</th>
                    <th className="text-left py-2 px-2">Tipo</th>
                    <th className="text-left py-2 px-2">Justificada</th>
                    <th className="text-right py-2 px-2">Dias</th>
                    <th className="text-right py-2 px-2">Horas</th>
                    <th className="text-left py-2 px-2">Motivo / Obs.</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {absences.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2">{format(new Date(r.date), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="py-2 px-2 font-medium">{r.employee?.full_name || '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground">{r.employee?.department || '—'}</td>
                      <td className="py-2 px-2"><Badge variant="outline" className={`text-[10px] ${KIND_COLOR[r.kind] || ''}`}>{KINDS.find(k => k.value === r.kind)?.label || r.kind}</Badge></td>
                      <td className="py-2 px-2">{r.justified ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Sim</Badge> : <Badge variant="outline" className="text-[10px]">Não</Badge>}</td>
                      <td className="py-2 px-2 text-right">{r.days}</td>
                      <td className="py-2 px-2 text-right">{r.hours || '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground">{r.reason || r.notes || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Edit3 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm('Remover?') && remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && <AbsenceDialog month={month} initial={editing} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AbsenceDialog({ month, initial, onClose }: { month: string; initial: any; onClose: () => void }) {
  const { employees } = useRHEmployees({ status: 'ativo' });
  const { upsert } = useRHAbsences(month);
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || '');
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState(initial?.kind || 'falta');
  const [justified, setJustified] = useState(initial?.justified ?? false);
  const [reason, setReason] = useState(initial?.reason || '');
  const [days, setDays] = useState(String(initial?.days ?? 1));
  const [hours, setHours] = useState(String(initial?.hours ?? 0));
  const [notes, setNotes] = useState(initial?.notes || '');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? 'Editar' : 'Novo'} lançamento</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Colaborador</Label>
            <EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} />
          </div>
          <div><Label>Data</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Dias</Label><Input type="number" step="0.5" value={days} onChange={e => setDays(e.target.value)} /></div>
          <div><Label>Horas</Label><Input type="number" step="0.5" value={hours} onChange={e => setHours(e.target.value)} /></div>
          <div className="col-span-2 flex items-center gap-2"><Switch checked={justified} onCheckedChange={setJustified} /><Label>Justificada</Label></div>
          <div className="col-span-2"><Label>Motivo</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: Consulta médica, atestado, problema familiar..." /></div>
          <div className="col-span-2"><Label>Observação</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!employeeId || !date} onClick={async () => {
            await upsert.mutateAsync({
              id: initial?.id, employee_id: employeeId, date, kind, justified,
              reason: reason || null, days: Number(days) || 0, hours: Number(hours) || 0, notes: notes || null,
            });
            onClose();
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}
