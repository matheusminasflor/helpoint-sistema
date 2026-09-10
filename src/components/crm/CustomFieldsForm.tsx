import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomFields } from '@/hooks/useCustomFields';
import { parseCustomInput, type CustomFieldDef, type CustomFieldEntity, type CustomValues } from '@/lib/custom-fields';

interface CustomFieldsFormProps {
  entity: CustomFieldEntity;
  values: CustomValues;
  onChange: (values: CustomValues) => void;
  /** Erros por chave, vindos de `validateCustomValues` — mostrados sob o campo. */
  errors?: Record<string, string>;
  /** Rótulos menores, como no cartão do negócio. */
  compact?: boolean;
}

const NONE = '__none__';

function FieldInput({ field, value, onChange }: { field: CustomFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case 'boolean':
      return (
        <div className="flex h-10 items-center">
          <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} aria-label={field.label} />
        </div>
      );
    case 'select':
      return (
        <Select value={typeof value === 'string' && value ? value : NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'date':
      return <Input type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(parseCustomInput('date', e.target.value))} />;
    case 'number':
      return (
        <Input
          type="number"
          step="any"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(parseCustomInput('number', e.target.value))}
        />
      );
    default:
      return <Input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(parseCustomInput('text', e.target.value))} maxLength={500} />;
  }
}

/**
 * Os campos personalizados ativos de um cadastro, como inputs (E2). Recebe e
 * devolve o objeto `{chave: valor}` inteiro — quem grava é o hook do contato
 * ou do negócio, na coluna `custom`. Sem campos definidos, não renderiza nada.
 */
export function CustomFieldsForm({ entity, values, onChange, errors, compact }: CustomFieldsFormProps) {
  const { data: fields = [] } = useCustomFields(entity);
  if (fields.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label className={compact ? 'text-xs' : undefined}>
            {field.label}{field.required ? ' *' : ''}
          </Label>
          <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange({ ...values, [field.key]: v })} />
          {errors?.[field.key] && <p className="text-xs text-destructive">{errors[field.key]}</p>}
        </div>
      ))}
    </div>
  );
}
