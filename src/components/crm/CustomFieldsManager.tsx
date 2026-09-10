import { useEffect, useState } from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCustomFields, useDeleteCustomField, useReorderCustomFields, useSaveCustomField } from '@/hooks/useCustomFields';
import {
  CUSTOM_FIELD_ENTITY_LABELS, CUSTOM_FIELD_TYPE_LABELS, parseOptionsText, slugify,
  type CustomFieldDef, type CustomFieldEntity, type CustomFieldType,
} from '@/lib/custom-fields';

function FieldRow({ field, onEdit, onToggle, onDelete }: {
  field: CustomFieldDef; onEdit: () => void; onToggle: (active: boolean) => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <button type="button" className="cursor-grab text-muted-foreground touch-none" {...attributes} {...listeners} aria-label="Arrastar">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${field.is_active ? '' : 'text-muted-foreground line-through'}`}>{field.label}</p>
        <p className="text-xs text-muted-foreground font-mono">{field.key}</p>
      </div>
      <Badge variant="outline" className="text-[10px]">{CUSTOM_FIELD_TYPE_LABELS[field.type]}</Badge>
      {field.required && <Badge variant="secondary" className="text-[10px]">obrigatório</Badge>}
      <Switch checked={field.is_active} onCheckedChange={onToggle} aria-label="Ativo" />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onDelete} aria-label="Apagar"><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

interface EditorState {
  id?: string;
  label: string;
  type: CustomFieldType;
  optionsText: string;
  required: boolean;
}

/**
 * Configurações do Comercial → aba "Campos" (E2). Define os campos
 * personalizados de contato e de negócio: rótulo, tipo, opções, obrigatório,
 * ordem e ativo. A chave nasce do rótulo e não muda depois (o banco recusa).
 */
export function CustomFieldsManager() {
  const [entity, setEntity] = useState<CustomFieldEntity>('contact');
  const { data: fields = [], isLoading } = useCustomFields(entity, true);
  const saveField = useSaveCustomField();
  const reorder = useReorderCustomFields();
  const deleteField = useDeleteCustomField();

  const [order, setOrder] = useState<CustomFieldDef[]>([]);
  useEffect(() => setOrder(fields), [fields]);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<CustomFieldDef | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((f) => f.id === active.id);
    const to = order.findIndex((f) => f.id === over.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    reorder.mutate(next.map((f) => f.id));
  };

  const openNew = () => setEditor({ label: '', type: 'text', optionsText: '', required: false });
  const openEdit = (f: CustomFieldDef) =>
    setEditor({ id: f.id, label: f.label, type: f.type, optionsText: f.options.map((o) => o.label).join('\n'), required: f.required });

  const key = editor && !editor.id ? slugify(editor.label) : undefined;
  const keyTaken = !!key && fields.some((f) => f.key === key);
  const options = editor?.type === 'select' ? parseOptionsText(editor.optionsText) : [];
  const canSave = !!editor && editor.label.trim().length > 0 && !keyTaken && (editor.type !== 'select' || options.length > 0) && !saveField.isPending;

  const handleSave = () => {
    if (!editor || !canSave) return;
    saveField.mutate(
      { id: editor.id, entity, key, label: editor.label.trim(), type: editor.type, options, required: editor.required },
      { onSuccess: () => setEditor(null) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Campos personalizados</CardTitle>
            <CardDescription>Campos a mais no contato e no negócio: aparecem no cadastro, na importação e nos filtros.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {(Object.keys(CUSTOM_FIELD_ENTITY_LABELS) as CustomFieldEntity[]).map((e) => (
                <Button key={e} size="sm" variant={entity === e ? 'default' : 'ghost'} className="h-7" onClick={() => setEntity(e)}>
                  {CUSTOM_FIELD_ENTITY_LABELS[e]}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Novo campo</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : order.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum campo personalizado em {CUSTOM_FIELD_ENTITY_LABELS[entity].toLowerCase()} ainda.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {order.map((f) => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    onEdit={() => openEdit(f)}
                    onToggle={(active) => saveField.mutate({ id: f.id, entity, label: f.label, type: f.type, options: f.options, required: f.required, is_active: active })}
                    onDelete={() => setDeleting(f)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Editar campo' : `Novo campo em ${CUSTOM_FIELD_ENTITY_LABELS[entity].toLowerCase()}`}</DialogTitle>
            {!editor?.id && <DialogDescription>O tipo e a chave não mudam depois de criado.</DialogDescription>}
          </DialogHeader>
          {editor && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Rótulo *</Label>
                <Input value={editor.label} onChange={(e) => setEditor({ ...editor, label: e.target.value })} maxLength={60} placeholder="Ex.: Segmento" />
                {key && (
                  <p className={`text-xs ${keyTaken ? 'text-destructive' : 'text-muted-foreground'}`}>
                    chave: <span className="font-mono">{key}</span>{keyTaken ? ' — já existe' : ''}
                  </p>
                )}
              </div>
              {!editor.id && (
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={editor.type} onValueChange={(v) => setEditor({ ...editor, type: v as CustomFieldType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                        <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editor.type === 'select' && (
                <div className="space-y-1.5">
                  <Label>Opções (uma por linha) *</Label>
                  <Textarea value={editor.optionsText} onChange={(e) => setEditor({ ...editor, optionsText: e.target.value })} rows={4} placeholder={'Varejo\nAtacado'} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={editor.required} onCheckedChange={(required) => setEditor({ ...editor, required })} id="cf-required" />
                <Label htmlFor="cf-required">Obrigatório no formulário</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!canSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar o campo "{deleting?.label}"?</DialogTitle>
            <DialogDescription>Os valores já gravados somem das telas. Para só esconder o campo, desative-o em vez de apagar.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteField.isPending} onClick={() => deleting && deleteField.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
