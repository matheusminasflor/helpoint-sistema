import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRHCompanies } from '@/hooks/useRH';

export function currentMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export const fmtBRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ym = value?.slice(0, 7) || '';
  return (
    <Input
      type="month"
      value={ym}
      onChange={(e) => onChange(e.target.value ? `${e.target.value}-01` : currentMonth())}
      className="w-[160px] h-9"
    />
  );
}

export function CompanyPicker({ value, onChange, allowAll = true }: { value: string | null; onChange: (v: string | null) => void; allowAll?: boolean }) {
  const { companies } = useRHCompanies();
  return (
    <Select value={value ?? '__all__'} onValueChange={(v) => onChange(v === '__all__' ? null : v)}>
      <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="__all__">Todas as empresas</SelectItem>}
        {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function EmployeeSelect({ value, onChange, employees }: { value: string; onChange: (v: string) => void; employees: { id: string; full_name: string | null }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
      <SelectContent>
        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name || '—'}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
