import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FormBuilderDialog } from '@/components/ti/FormBuilderDialog';
import { useTICategories, type TIModule, type TICategory, type CategoryWithChildren } from '@/hooks/useTICategories';

interface CategoryManagerProps {
  /** Módulo das categorias (ex.: 'tickets', 'financeiro'). */
  module: TIModule;
  /** Habilita o botão "Formulário" (campos personalizados por categoria). */
  allowForms?: boolean;
  /** Somente leitura: esconde ações de criação/edição/exclusão. */
  readOnly?: boolean;
  emptyLabel?: string;
}

/**
 * Gerenciador genérico de categorias → subcategorias por módulo,
 * com formulário personalizado por categoria (mesma UX das Configurações de TI).
 */
export function CategoryManager({ module, allowForms = false, readOnly = false, emptyLabel = 'este módulo' }: CategoryManagerProps) {
  const {
    categoriesWithChildren, isLoading,
    createCategory, updateCategory, deleteCategory, toggleActive,
  } = useTICategories(module);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TICategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<TICategory | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formBuilderCategory, setFormBuilderCategory] = useState<TICategory | null>(null);

  const openDialog = (parent: string | null = null, category?: TICategory) => {
    setParentId(parent);
    setEditingCategory(category || null);
    setCategoryName(category?.name || '');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingCategory(null);
    setParentId(null);
    setCategoryName('');
  };

  const handleSave = async () => {
    if (!categoryName.trim()) return;
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, name: categoryName.trim() });
    } else {
      await createCategory.mutateAsync({ module, name: categoryName.trim(), parent_id: parentId });
    }
    closeDialog();
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    await deleteCategory.mutateAsync(deletingCategory.id);
    setDeleteDialogOpen(false);
    setDeletingCategory(null);
  };

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderCategory = (category: CategoryWithChildren) => {
    const isExpanded = expanded.has(category.id);
    return (
      <Collapsible key={category.id} open={isExpanded} onOpenChange={() => toggleExpanded(category.id)}>
        <div className="border rounded-lg mb-2 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={isExpanded ? 'Recolher' : 'Expandir'}>
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>

            <span className={`flex-1 font-medium ${!category.is_active ? 'text-muted-foreground line-through' : ''}`}>
              {category.name}
            </span>
            <span className="text-xs text-muted-foreground">{category.children.length} sub</span>

            {allowForms && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
                onClick={() => setFormBuilderCategory(category)}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />Formulário
              </Button>
            )}

            {!readOnly && (
              <>
                <Switch
                  checked={category.is_active}
                  onCheckedChange={() => toggleActive.mutate({ id: category.id, is_active: !category.is_active })}
                  aria-label="Ativar ou desativar categoria"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar categoria" onClick={() => openDialog(null, category)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Excluir categoria"
                  onClick={() => { setDeletingCategory(category); setDeleteDialogOpen(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>

          <CollapsibleContent>
            <div className="pl-8 pr-3 py-2 space-y-1 border-t bg-background">
              {category.children.map(child => (
                <div key={child.id} className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/30 transition-colors">
                  <span className={`flex-1 ${!child.is_active ? 'text-muted-foreground line-through' : ''}`}>{child.name}</span>

                  {allowForms && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => setFormBuilderCategory(child)}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />Formulário
                    </Button>
                  )}

                  {!readOnly && (
                    <>
                      <Switch
                        checked={child.is_active}
                        onCheckedChange={() => toggleActive.mutate({ id: child.id, is_active: !child.is_active })}
                        aria-label="Ativar ou desativar subcategoria"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar subcategoria" onClick={() => openDialog(category.id, child)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label="Excluir subcategoria"
                        onClick={() => { setDeletingCategory(child); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}

              {!readOnly && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={() => openDialog(category.id)}
                >
                  <Plus className="h-4 w-4 mr-2" />Adicionar subcategoria
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => openDialog(null)}>
            <Plus className="h-4 w-4 mr-2" />Nova categoria
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : categoriesWithChildren.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhuma categoria cadastrada para {emptyLabel}.</p>
          {!readOnly && <p className="text-sm mt-1">Clique em "Nova categoria" para começar.</p>}
        </div>
      ) : (
        <div className="space-y-2">{categoriesWithChildren.map(renderCategory)}</div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Editar' : 'Nova'} {parentId ? 'subcategoria' : 'categoria'}</DialogTitle>
            <DialogDescription>
              {parentId
                ? 'Adicione uma subcategoria para organizar melhor os pedidos.'
                : 'Categorias principais agrupam subcategorias relacionadas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="category-name">Nome</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Ex.: Reembolso de viagem"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!categoryName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deletingCategory?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              As subcategorias vinculadas também serão excluídas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter categoria</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir categoria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {formBuilderCategory && (
        <FormBuilderDialog
          open={!!formBuilderCategory}
          onOpenChange={(open) => !open && setFormBuilderCategory(null)}
          categoryId={formBuilderCategory.id}
          categoryName={formBuilderCategory.name}
        />
      )}
    </div>
  );
}
