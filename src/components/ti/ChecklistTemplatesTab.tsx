import { useMemo, useState } from 'react';
import { CheckSquare, Plus, Pencil, Trash2, Link2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { useChecklistTemplates, type ChecklistTemplate, type ChecklistTemplateBindingInput, type ChecklistTemplateItemInput } from '@/hooks/useComplianceChecklists';
import { formatTICategoryLabel, useTICategories } from '@/hooks/useTICategories';

interface TemplateFormState {
  name: string;
  description: string;
  is_active: boolean;
  items: ChecklistTemplateItemInput[];
  bindings: ChecklistTemplateBindingInput[];
}

const createEmptyItem = (sort_order: number): ChecklistTemplateItemInput => ({
  description: '',
  is_required: true,
  responsible_sector: null,
  sort_order,
  is_active: true,
});

const createEmptyBinding = (): ChecklistTemplateBindingInput => ({
  target_type: 'category',
  target_id: '',
  priority: 0,
});

export function ChecklistTemplatesTab() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useChecklistTemplates('tickets');
  const { categories } = useTICategories('tickets');

  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ChecklistTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    name: '',
    description: '',
    is_active: true,
    items: [createEmptyItem(0)],
    bindings: [createEmptyBinding()],
  });

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, formatTICategoryLabel(category, categories)])),
    [categories]
  );

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({
      name: '',
      description: '',
      is_active: true,
      items: [createEmptyItem(0)],
      bindings: [createEmptyBinding()],
    });
    setEditorOpen(true);
  };

  const openEdit = (template: ChecklistTemplate) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      description: template.description || '',
      is_active: template.is_active,
      items: (template.items || []).map((item, index) => ({
        id: item.id,
        description: item.description,
        is_required: item.is_required,
        responsible_sector: null,
        sort_order: item.sort_order ?? index,
        is_active: item.is_active,
      })),
      bindings: (template.bindings || []).map((binding) => ({
        id: binding.id,
        target_type: binding.target_type,
        target_id: binding.target_id,
        priority: 0,
      })),
    });
    setEditorOpen(true);
  };

  const updateItem = (index: number, patch: Partial<ChecklistTemplateItemInput>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const updateBinding = (index: number, patch: Partial<ChecklistTemplateBindingInput>) => {
    setForm((prev) => ({
      ...prev,
      bindings: prev.bindings.map((binding, currentIndex) =>
        currentIndex === index ? { ...binding, ...patch } : binding
      ),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem(prev.items.length)],
    }));
  };

  const addBinding = () => {
    setForm((prev) => ({
      ...prev,
      bindings: [...prev.bindings, createEmptyBinding()],
    }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, currentIndex) => currentIndex !== index).map((item, currentIndex) => ({
        ...item,
        sort_order: currentIndex,
      })),
    }));
  };

  const removeBinding = (index: number) => {
    setForm((prev) => ({
      ...prev,
      bindings: prev.bindings.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      items: form.items
        .map((item, index) => ({
          ...item,
          description: item.description.trim(),
          responsible_sector: null,
          sort_order: index,
        }))
        .filter((item) => item.description),
      bindings: form.bindings
        .filter((binding) => binding.target_id)
        .map((binding) => ({
          ...binding,
          priority: 0,
        })),
    };

    if (!payload.name || payload.items.length === 0 || payload.bindings.length === 0) return;

    if (editingTemplate) {
      await updateTemplate.mutateAsync({ id: editingTemplate.id, ...payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }

    setEditorOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Checklists de Conformidade
              </CardTitle>
              <CardDescription>
                Vincule SOPs obrigatórios a categorias de chamados para bloquear encerramentos incompletos.
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Checklist
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nenhum checklist configurado para chamados.
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{template.name}</h3>
                      <Badge variant={template.is_active ? 'secondary' : 'outline'}>
                        {template.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">{template.items?.length || 0} itens</Badge>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(template.bindings || []).map((binding) => (
                        <Badge key={binding.id} variant="outline" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          {categoryMap.get(binding.target_id) || 'Categoria'}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(template)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTemplateToDelete(template);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Editar Checklist' : 'Novo Checklist'}</DialogTitle>
            <DialogDescription>
              Configure itens obrigatórios e vincule o checklist a categorias de chamados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="checklist-name">Nome</Label>
                <Input
                  id="checklist-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex: Admissão de colaborador"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-4">
                <div>
                  <Label>Checklist ativo</Label>
                  <p className="text-xs text-muted-foreground">Templates inativos não são instanciados em novos tickets.</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="checklist-description">Descrição</Label>
                  <p className="text-xs text-muted-foreground">
                    Campo informativo para explicar finalidade e momento de uso do checklist. Não altera regras, vínculos nem bloqueios.
                  </p>
                </div>
                <AIRefineButton
                  text={form.description}
                  context="checklist_description"
                  onRefine={(refined) => setForm((prev) => ({ ...prev, description: refined }))}
                  className="shrink-0"
                />
              </div>
              <textarea
                id="checklist-description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Explique quando esse checklist deve ser aplicado"
                className="min-h-[96px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Itens do checklist</h3>
                  <p className="text-xs text-muted-foreground">
                    Descreva cada tarefa e marque se ela é obrigatória para liberar o encerramento.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                Use uma frase objetiva por item, como “Validar acesso do usuário” ou “Confirmar entrega do equipamento”.
              </div>
              <div className="space-y-3">
                {form.items.map((item, index) => (
                  <div key={`${item.id || 'new'}-${index}`} className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                    <Input
                      value={item.description}
                      onChange={(event) => updateItem(index, { description: event.target.value })}
                      placeholder={`Tarefa ${index + 1}`}
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_required}
                        onCheckedChange={(checked) => updateItem(index, { is_required: checked })}
                      />
                      <span className="text-sm text-muted-foreground">Obrigatória</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(index)}
                      disabled={form.items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Vínculos por categoria</h3>
                  <p className="text-xs text-muted-foreground">
                    Escolha a categoria exata que deve disparar este checklist automaticamente.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addBinding}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Vínculo
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
                <p>• <strong>Categoria</strong>: aplica o checklist à categoria principal.</p>
                <p>• <strong>Subcategoria</strong>: aplica o checklist apenas à opção específica.</p>
                <p>• Exemplo: <strong>Hardware (categoria)</strong> afeta toda a categoria; <strong>Hardware &gt; Notebook (subcategoria)</strong> afeta só Notebook.</p>
              </div>
              <div className="space-y-3">
                {form.bindings.map((binding, index) => (
                  <div key={`${binding.id || 'new'}-${index}`} className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <select
                      value={binding.target_id}
                      onChange={(event) => updateBinding(index, { target_id: event.target.value })}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Selecione a categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {formatTICategoryLabel(category, categories)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeBinding(index)}
                      disabled={form.bindings.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name.trim() ||
                form.items.every((item) => !item.description.trim()) ||
                form.bindings.every((binding) => !binding.target_id) ||
                createTemplate.isPending ||
                updateTemplate.isPending
              }
            >
              {createTemplate.isPending || updateTemplate.isPending ? 'Salvando...' : 'Salvar Checklist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o checklist "{templateToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O histórico já instanciado nos chamados será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => templateToDelete && deleteTemplate.mutate(templateToDelete.id)}
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
