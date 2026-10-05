import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical,
  Type,
  AlignLeft,
  Mail,
  Phone,
  ChevronDown,
  CheckSquare,
  Circle,
  Calendar,
  Paperclip,
  Clock,
  User,
  Copy,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FormFieldEditor } from './FormFieldEditor';
import { useTicketFormFields, useReplicarFormulario, type TicketFormField, type FormFieldType } from '@/hooks/useTicketFormFields';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FormBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  /** As outras categorias do MESMO setor, para onde o formulário pode ser replicado. */
  outrasCategorias?: { id: string; nome: string }[];
}

const FIELD_TYPE_ICONS: Record<FormFieldType, React.ReactNode> = {
  text: <Type className="h-4 w-4" />,
  textarea: <AlignLeft className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  select: <ChevronDown className="h-4 w-4" />,
  checkbox: <CheckSquare className="h-4 w-4" />,
  radio: <Circle className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  file: <Paperclip className="h-4 w-4" />,
  delivery_datetime: <Clock className="h-4 w-4" />,
  assignee_select: <User className="h-4 w-4" />,
};

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texto',
  textarea: 'Texto Longo',
  email: 'E-mail',
  phone: 'Telefone',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  radio: 'Radio',
  date: 'Data',
  file: 'Arquivo',
  delivery_datetime: 'Data/Hora de Entrega',
  assignee_select: 'Seleção de Atendente',
};

export function FormBuilderDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  outrasCategorias = [],
}: FormBuilderDialogProps) {
  const [replicando, setReplicando] = useState(false);
  const [destinos, setDestinos] = useState<string[]>([]);
  const replicar = useReplicarFormulario();
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<TicketFormField | null>(null);
  const [deletingField, setDeletingField] = useState<TicketFormField | null>(null);

  const {
    allFields,
    isLoadingAll,
    createField,
    updateField,
    deleteField,
  } = useTicketFormFields(categoryId);

  const handleOpenFieldEditor = (field?: TicketFormField) => {
    setEditingField(field || null);
    setFieldEditorOpen(true);
  };

  const handleSaveField = async (data: {
    label: string;
    field_type: FormFieldType;
    options: string[];
    is_required: boolean;
    placeholder: string;
  }) => {
    if (editingField) {
      await updateField.mutateAsync({
        id: editingField.id,
        ...data,
      });
    } else {
      await createField.mutateAsync({
        category_id: categoryId,
        ...data,
        sort_order: allFields.length,
      });
    }
    setFieldEditorOpen(false);
    setEditingField(null);
  };

  const handleDeleteField = async () => {
    if (!deletingField) return;
    await deleteField.mutateAsync(deletingField.id);
    setDeletingField(null);
  };

  const handleToggleActive = (field: TicketFormField) => {
    updateField.mutate({
      id: field.id,
      is_active: !field.is_active,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Configurar Formulário: {categoryName}</DialogTitle>
            <DialogDescription>
              Adicione campos personalizados que serão exibidos ao abrir um chamado nesta categoria
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <div className="flex justify-end gap-2 mb-4">
              {outrasCategorias.length > 0 && allFields.some(f => f.is_active) && (
                <Button variant="outline" onClick={() => { setReplicando(r => !r); setDestinos([]); }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Replicar para…
                </Button>
              )}
              <Button onClick={() => handleOpenFieldEditor()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Campo
              </Button>
            </div>

            {replicando && (
              <div className="mb-4 rounded-lg border p-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Os campos ativos deste formulário são copiados para as categorias marcadas, depois dos
                  campos que elas já têm. A cópia é independente: mudar uma não muda a outra.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                  {outrasCategorias.map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={destinos.includes(c.id)}
                        onCheckedChange={(v) => setDestinos(d => v ? [...d, c.id] : d.filter(x => x !== c.id))}
                      />
                      {c.nome}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setReplicando(false)}>Cancelar</Button>
                  <Button
                    size="sm"
                    disabled={destinos.length === 0 || replicar.isPending}
                    onClick={() => replicar.mutate({ campos: allFields, destinos }, {
                      onSuccess: () => { setReplicando(false); setDestinos([]); },
                    })}
                  >
                    {replicar.isPending ? 'Copiando…' : `Copiar para ${destinos.length || ''} ${destinos.length === 1 ? 'categoria' : 'categorias'}`}
                  </Button>
                </div>
              </div>
            )}

            {isLoadingAll ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : allFields.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>Nenhum campo configurado.</p>
                <p className="text-sm mt-1">
                  Clique em "Adicionar Campo" para criar o primeiro campo do formulário.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allFields.map((field, index) => (
                  <div
                    key={field.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors ${
                      !field.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="cursor-grab text-muted-foreground">
                      <GripVertical className="h-5 w-5" />
                    </div>

                    <div className="flex items-center justify-center w-8 h-8 rounded bg-muted">
                      {FIELD_TYPE_ICONS[field.field_type]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{field.label}</span>
                        {field.is_required && (
                          <Badge variant="secondary" className="text-xs">
                            Obrigatório
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{FIELD_TYPE_LABELS[field.field_type]}</span>
                        {field.options && field.options.length > 0 && (
                          <span>• {field.options.length} opções</span>
                        )}
                      </div>
                    </div>

                    <Switch
                      checked={field.is_active}
                      onCheckedChange={() => handleToggleActive(field)}
                      aria-label="Ativar/Desativar"
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenFieldEditor(field)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingField(field)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FormFieldEditor
        open={fieldEditorOpen}
        onOpenChange={setFieldEditorOpen}
        field={editingField}
        onSave={handleSaveField}
        isSaving={createField.isPending || updateField.isPending}
      />

      <AlertDialog open={!!deletingField} onOpenChange={() => setDeletingField(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o campo "{deletingField?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O campo sai do formulário; respostas já enviadas permanecem registradas.
              <span className="block mt-2 text-destructive font-medium">
                As respostas existentes serão mantidas, mas o campo não aparecerá mais em novos chamados.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
