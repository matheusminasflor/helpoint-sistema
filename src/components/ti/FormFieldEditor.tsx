import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import type { FormFieldType, TicketFormField } from '@/hooks/useTicketFormFields';

interface FormFieldEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: TicketFormField | null;
  onSave: (data: {
    label: string;
    field_type: FormFieldType;
    options: string[];
    is_required: boolean;
    placeholder: string;
  }) => void;
  isSaving?: boolean;
}

const FIELD_TYPES: { value: FormFieldType; label: string; hasOptions: boolean; description?: string }[] = [
  { value: 'text', label: 'Texto Curto', hasOptions: false },
  { value: 'textarea', label: 'Texto Longo', hasOptions: false },
  { value: 'email', label: 'E-mail', hasOptions: false },
  { value: 'phone', label: 'Telefone', hasOptions: false },
  { value: 'select', label: 'Dropdown (seleção única)', hasOptions: true },
  { value: 'checkbox', label: 'Checkbox (múltipla seleção)', hasOptions: true },
  { value: 'radio', label: 'Radio (seleção única)', hasOptions: true },
  { value: 'date', label: 'Data', hasOptions: false },
  { value: 'file', label: 'Arquivo', hasOptions: false },
  { value: 'delivery_datetime', label: 'Data/Hora de Entrega', hasOptions: false, description: 'Define o prazo de conclusão do chamado e do card no Kanban' },
  { value: 'assignee_select', label: 'Seleção de Atendente', hasOptions: false, description: 'Lista membros do departamento para atribuição direta' },
];

export function FormFieldEditor({
  open,
  onOpenChange,
  field,
  onSave,
  isSaving,
}: FormFieldEditorProps) {
  const [label, setLabel] = useState(field?.label || '');
  const [fieldType, setFieldType] = useState<FormFieldType>(field?.field_type || 'text');
  const [options, setOptions] = useState<string[]>(field?.options || []);
  const [isRequired, setIsRequired] = useState(field?.is_required || false);
  const [placeholder, setPlaceholder] = useState(field?.placeholder || '');
  const [newOption, setNewOption] = useState('');

  const selectedType = FIELD_TYPES.find(t => t.value === fieldType);
  const showOptions = selectedType?.hasOptions;

  const handleAddOption = () => {
    if (newOption.trim() && !options.includes(newOption.trim())) {
      setOptions([...options, newOption.trim()]);
      setNewOption('');
    }
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!label.trim()) return;

    onSave({
      label: label.trim(),
      field_type: fieldType,
      options: showOptions ? options : [],
      is_required: isRequired,
      placeholder: placeholder.trim(),
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form when closing
      setLabel(field?.label || '');
      setFieldType(field?.field_type || 'text');
      setOptions(field?.options || []);
      setIsRequired(field?.is_required || false);
      setPlaceholder(field?.placeholder || '');
      setNewOption('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{field ? 'Editar Campo' : 'Novo Campo'}</DialogTitle>
          <DialogDescription>
            Configure as propriedades do campo do formulário
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Rótulo do Campo *</Label>
            <Input
              id="label"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ex: Nome completo, CPF, Data de início..."
            />
          </div>

          {/* Tipo do Campo */}
          <div className="space-y-2">
            <Label>Tipo de Campo *</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FormFieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {FIELD_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      {type.description && (
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opções (para select, checkbox, radio) */}
          {showOptions && (
            <div className="space-y-2">
              <Label>Opções</Label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 bg-muted text-sm rounded-md">
                      {option}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemoveOption(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    placeholder="Adicionar opção..."
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddOption}
                    disabled={!newOption.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Placeholder */}
          <div className="space-y-2">
            <Label htmlFor="placeholder">Placeholder (opcional)</Label>
            <Input
              id="placeholder"
              value={placeholder}
              onChange={e => setPlaceholder(e.target.value)}
              placeholder="Texto de ajuda exibido no campo"
            />
          </div>

          {/* Obrigatório */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Campo Obrigatório</Label>
              <p className="text-xs text-muted-foreground">
                Usuário deve preencher para abrir o chamado
              </p>
            </div>
            <Switch
              checked={isRequired}
              onCheckedChange={setIsRequired}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim() || isSaving || (showOptions && options.length === 0)}
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
