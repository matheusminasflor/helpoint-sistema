import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarIcon, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTicketFormFields, type TicketFormField } from '@/hooks/useTicketFormFields';
import { useDepartmentMembers } from '@/hooks/useDepartmentMembers';

interface DynamicFormFieldsProps {
  categoryId: string;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  errors?: Record<string, string>;
  department?: string;
}

export function DynamicFormFields({ categoryId, values, onChange, errors, department }: DynamicFormFieldsProps) {
  const { fields, isLoading } = useTicketFormFields(categoryId);
  const { members, isLoading: isLoadingMembers } = useDepartmentMembers(department);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-surface-1 rounded-xl" />
        <div className="h-10 bg-surface-1 rounded-xl" />
      </div>
    );
  }

  if (fields.length === 0) return null;

  const inputClass = "rounded-xl border-border bg-card placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40";

  const renderField = (field: TicketFormField) => {
    const value = values[field.id] || '';
    const error = errors?.[field.id];

    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <Input
            type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={e => onChange(field.id, e.target.value)}
            placeholder={field.placeholder || undefined}
            className={cn(inputClass, error && 'border-destructive')}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={e => onChange(field.id, e.target.value)}
            placeholder={field.placeholder || undefined}
            className={cn(
              'w-full min-h-[100px] p-3 bg-card border border-border text-sm resize-none rounded-xl placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors',
              error && 'border-destructive'
            )}
          />
        );

      case 'select':
        return (
          <Select value={value} onValueChange={v => onChange(field.id, v)}>
            <SelectTrigger className={cn(inputClass, error && 'border-destructive')}>
              <SelectValue placeholder={field.placeholder || 'Selecione...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        const selectedOptions = value ? value.split(',') : [];
        return (
          <div className="space-y-2">
            {field.options?.map(option => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.id}-${option}`}
                  checked={selectedOptions.includes(option)}
                  onCheckedChange={checked => {
                    const newSelected = checked
                      ? [...selectedOptions, option]
                      : selectedOptions.filter(o => o !== option);
                    onChange(field.id, newSelected.join(','));
                  }}
                />
                <label htmlFor={`${field.id}-${option}`} className="text-sm text-foreground cursor-pointer">
                  {option}
                </label>
              </div>
            ))}
          </div>
        );

      case 'radio':
        return (
          <RadioGroup value={value} onValueChange={v => onChange(field.id, v)}>
            {field.options?.map(option => (
              <div key={option} className="flex items-center gap-2">
                <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                <label htmlFor={`${field.id}-${option}`} className="text-sm text-foreground cursor-pointer">
                  {option}
                </label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'date':
        const dateValue = value ? new Date(value) : undefined;
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal rounded-xl border-border',
                  !dateValue && 'text-muted-foreground',
                  error && 'border-destructive'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateValue ? format(dateValue, 'PPP', { locale: ptBR }) : field.placeholder || 'Selecione uma data'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dateValue}
                onSelect={date => onChange(field.id, date ? date.toISOString() : '')}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      case 'file':
        return (
          <Input
            type="file"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onChange(field.id, file.name);
            }}
            className={cn(inputClass, error && 'border-destructive')}
          />
        );

      case 'delivery_datetime': {
        const dtValue = value ? new Date(value) : undefined;
        return (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start text-left font-normal rounded-xl border-border',
                    !dtValue && 'text-muted-foreground',
                    error && 'border-destructive'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dtValue ? format(dtValue, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione a data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dtValue}
                  onSelect={date => {
                    if (!date) { onChange(field.id, ''); return; }
                    const existing = dtValue || new Date();
                    date.setHours(existing.getHours(), existing.getMinutes());
                    onChange(field.id, date.toISOString());
                  }}
                  locale={ptBR}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="time"
                value={dtValue ? format(dtValue, 'HH:mm') : ''}
                onChange={e => {
                  const [h, m] = (e.target.value || '00:00').split(':').map(Number);
                  const base = dtValue ? new Date(dtValue) : new Date();
                  base.setHours(h, m, 0, 0);
                  onChange(field.id, base.toISOString());
                }}
                className={cn('w-[120px] pl-9 rounded-xl border-border', error && 'border-destructive')}
              />
            </div>
          </div>
        );
      }

      case 'assignee_select':
        return (
          <Select value={value} onValueChange={v => onChange(field.id, v)}>
            <SelectTrigger className={cn(inputClass, error && 'border-destructive')}>
              <SelectValue placeholder="Selecione um atendente..." />
            </SelectTrigger>
            <SelectContent>
              {isLoadingMembers ? (
                <SelectItem value="_loading" disabled>Carregando...</SelectItem>
              ) : members.length === 0 ? (
                <SelectItem value="_empty" disabled>Nenhum membro encontrado</SelectItem>
              ) : (
                members.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    <span className="flex items-center gap-2">
                      <User className="w-3 h-3" />
                      {member.full_name || member.email}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Informações Adicionais
      </div>
      {fields.map(field => (
        <div key={field.id} className="space-y-2">
          <Label className="flex items-center gap-1 text-sm font-medium text-foreground">
            {field.label}
            {field.is_required && <span className="text-destructive">*</span>}
          </Label>
          {renderField(field)}
          {errors?.[field.id] && (
            <p className="text-xs text-destructive">{errors[field.id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function validateDynamicFields(
  fields: TicketFormField[],
  values: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.is_required && !values[field.id]?.trim()) {
      errors[field.id] = 'Este campo é obrigatório';
    }
  }
  return errors;
}
