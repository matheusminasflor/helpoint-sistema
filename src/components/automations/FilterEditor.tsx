import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CMP_LABELS, ENTITY_FIELDS, type Cmp, type EntityKind, type FlowFilter, type NamedRef, type PersonRef } from '@/lib/automation-flow';

interface FilterEditorProps {
  entity: EntityKind;
  value: FlowFilter | undefined;
  onChange: (filter: FlowFilter | undefined) => void;
  people: PersonRef[];
  categories?: NamedRef[];
  stages?: NamedRef[];
  /** Só no gatilho "alterado": oferece o comparador "mudou". */
  allowChanged?: boolean;
}

const NO_VALUE: Cmp[] = ['is_empty', 'not_empty', 'changed'];

/**
 * Editor do filtro `{op, rules:[{path, cmp, value}]}` (gatilho e passo
 * "condição"). O caminho é sempre `trigger.after.<campo>`; o valor ganha um
 * seletor quando o campo é lista, categoria, etapa ou pessoa.
 */
export function FilterEditor({ entity, value, onChange, people, categories = [], stages = [], allowChanged }: FilterEditorProps) {
  const filter: FlowFilter = value ?? { op: 'and', rules: [] };
  const fields = ENTITY_FIELDS[entity];

  const update = (next: FlowFilter) => onChange(next.rules.length ? next : undefined);
  const setRule = (i: number, patch: Partial<FlowFilter['rules'][number]>) =>
    update({ ...filter, rules: filter.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const valueInput = (i: number, path: string, cmp: Cmp, v: unknown) => {
    if (NO_VALUE.includes(cmp)) return null;
    const key = path.replace(/^trigger\.(after|before)\./, '');
    const def = fields.find((f) => f.key === key);
    const text = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    const options: { value: string; label: string }[] | null =
      def?.options ? Object.entries(def.options).map(([value, label]) => ({ value, label }))
      : key === 'category_id' ? categories.map((c) => ({ value: c.id, label: c.name }))
      : key === 'stage_id' ? stages.map((s) => ({ value: s.id, label: s.name }))
      : def?.type === 'uuid' ? people.map((p) => ({ value: p.id, label: p.name }))
      : null;
    if (options && cmp !== 'contains' && cmp !== 'in') {
      return (
        <Select value={text} onValueChange={(nv) => setRule(i, { value: nv })}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="valor" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    return (
      <Input
        className="h-8 w-48"
        type={def?.type === 'number' && cmp !== 'in' ? 'number' : 'text'}
        value={cmp === 'in' && Array.isArray(v) ? v.join(', ') : text}
        placeholder={cmp === 'in' ? 'a, b, c' : 'valor'}
        onChange={(e) => {
          const raw = e.target.value;
          if (cmp === 'in') setRule(i, { value: raw.split(',').map((x) => x.trim()).filter(Boolean) });
          else if (def?.type === 'number') setRule(i, { value: raw === '' ? '' : Number(raw) });
          else setRule(i, { value: raw });
        }}
      />
    );
  };

  return (
    <div className="space-y-2">
      {filter.rules.length > 1 && (
        <Select value={filter.op} onValueChange={(op) => update({ ...filter, op: op as 'and' | 'or' })}>
          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="and">Todas as condições valem (E)</SelectItem>
            <SelectItem value="or">Qualquer uma vale (OU)</SelectItem>
          </SelectContent>
        </Select>
      )}
      {filter.rules.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select value={r.path} onValueChange={(path) => setRule(i, { path, value: undefined })}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="campo" /></SelectTrigger>
            <SelectContent>{fields.map((f) => <SelectItem key={f.key} value={`trigger.after.${f.key}`}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={r.cmp} onValueChange={(cmp) => setRule(i, { cmp: cmp as Cmp })}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CMP_LABELS) as Cmp[]).filter((c) => c !== 'changed' || allowChanged).map((c) => (
                <SelectItem key={c} value={c}>{CMP_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {valueInput(i, r.path, r.cmp, r.value)}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => update({ ...filter, rules: filter.rules.filter((_, j) => j !== i) })} aria-label="Remover condição">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => update({ ...filter, rules: [...filter.rules, { path: `trigger.after.${fields[0].key}`, cmp: 'eq', value: '' }] })}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Condição
      </Button>
    </div>
  );
}
