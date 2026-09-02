import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACCESS_TYPE_LABEL, type AccessType, type NewAccessGrant } from '@/hooks/useEmployeeAccessGrants';

interface Props {
  value: NewAccessGrant[];
  onChange: (next: NewAccessGrant[]) => void;
}

export function AdmissionAccessEditor({ value, onChange }: Props) {
  const add = () => onChange([...value, { access_type: 'sistema', name: '', note: '' }]);
  const update = (i: number, patch: Partial<NewAccessGrant>) =>
    onChange(value.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Acessos a liberar</h3>
          <p className="text-xs text-muted-foreground">Sistemas, e-mails, pastas e equipamentos que serão entregues ao colaborador.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum acesso adicionado. No desligamento, esta lista é usada para gerar o chamado de revogação.</p>
      ) : (
        <div className="space-y-2">
          {value.map((g, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-2 items-center">
              <select
                value={g.access_type}
                onChange={(e) => update(i, { access_type: e.target.value as AccessType })}
                className="h-9 px-2 rounded-md border border-border bg-background text-sm"
              >
                {Object.entries(ACCESS_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <Input
                placeholder="Nome (ex.: ERP, Office 365)"
                value={g.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Observação (opcional)"
                value={g.note || ''}
                onChange={(e) => update(i, { note: e.target.value })}
                className="h-9"
              />
              <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} className="h-9 w-9 text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
