import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import { concessaoDoModulo, useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';
import { useSalvarResponsaveis, useVinculosDeResponsaveis } from '@/hooks/useResponsaveisDaCategoria';

interface CategoryManagerProps {
  /** Módulo das categorias (ex.: 'tickets', 'financeiro'). */
  module: TIModule;
  /** Habilita o botão "Formulário" (campos personalizados por categoria). */
  allowForms?: boolean;
  /** Somente leitura: esconde ações de criação/edição/exclusão. */
  readOnly?: boolean;
  emptyLabel?: string;
  /**
   * Categorias de chamado: cada uma pode ter quem sempre atende (decisão do dono, 2026-10-03). A
   * subcategoria sem ninguém marcado herda da categoria de cima.
   */
  comResponsaveis?: boolean;
}

/**
 * Gerenciador genérico de categorias → subcategorias por módulo,
 * com formulário personalizado por categoria (mesma UX das Configurações de TI).
 */
export function CategoryManager({ module, allowForms = false, readOnly = false, emptyLabel = 'este módulo', comResponsaveis = false }: CategoryManagerProps) {
  const {
    categories, categoriesWithChildren, isLoading,
    createCategory, updateCategory, deleteCategory, toggleActive,
  } = useTICategories(module);

  // Quem pode ser responsável: quem tem o acesso ao setor (o mesmo critério do banco).
  const { data: membros = [] } = useMembrosDoSetor(comResponsaveis ? concessaoDoModulo(module) : undefined);
  const { data: vinculos = [] } = useVinculosDeResponsaveis();
  const salvarResponsaveis = useSalvarResponsaveis();
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const idsDe = (categoryId: string) => vinculos.filter(v => v.category_id === categoryId).map(v => v.user_id);
  const nomeDe = (userId: string) => {
    const m = membros.find(x => x.id === userId);
    return m ? (m.full_name || m.email) : 'sem acesso ao setor';
  };
  const nomesDe = (categoryId: string) => idsDe(categoryId).map(nomeDe).join(', ');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TICategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<TICategory | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [isPurchase, setIsPurchase] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formBuilderCategory, setFormBuilderCategory] = useState<TICategory | null>(null);

  /**
   * "É compra" só faz sentido em Compras: é lá que o chamado abre o formulário
   * de produto, orçamentos e aprovação (`isPurchase` em `CreateTicketForm` exige
   * `module === 'compras'` desde a leva N). Até a LEVA P isto dizia 'financeiro' —
   * a marcação era oferecida onde não ligava nada, e escondida onde ligava.
   */
  const ofereceCompra = module === 'compras';

  const [tipoNoDialogo, setTipoNoDialogo] = useState<'categoria' | 'subcategoria' | 'item'>('categoria');
  const openDialog = (parent: string | null = null, category?: TICategory, tipo?: 'subcategoria' | 'item') => {
    setTipoNoDialogo(tipo ?? (parent ? 'subcategoria' : 'categoria'));
    setParentId(parent);
    setEditingCategory(category || null);
    setCategoryName(category?.name || '');
    setIsPurchase(category?.is_purchase ?? false);
    setResponsaveis(category ? idsDe(category.id) : []);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingCategory(null);
    setParentId(null);
    setCategoryName('');
    setIsPurchase(false);
  };

  const handleSave = async () => {
    if (!categoryName.trim()) return;
    let categoryId = editingCategory?.id;
    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        name: categoryName.trim(),
        ...(ofereceCompra ? { is_purchase: isPurchase } : {}),
      });
    } else {
      const criada = await createCategory.mutateAsync({
        module, name: categoryName.trim(), parent_id: parentId,
        is_purchase: ofereceCompra && isPurchase,
      });
      categoryId = criada?.id;
    }
    if (comResponsaveis && categoryId) {
      await salvarResponsaveis.mutateAsync({
        categoryId, antes: editingCategory ? idsDe(editingCategory.id) : [], depois: responsaveis,
      });
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

  // Os itens (terceiro nível) de uma subcategoria — inclusive os desativados, para reativar.
  const itensDe = (subId: string) => categories.filter(c => c.parent_id === subId);

  /** A linha de uma subcategoria ou de um item: nome, "compra", quem atende (ou de quem herda) e as ações. */
  const linha = (c: TICategory, paiId: string, herdado: string | null, tipo: 'subcategoria' | 'item') => (
    <div className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/30 transition-colors">
      <span className={`flex-1 ${!c.is_active ? 'text-muted-foreground line-through' : ''}`}>{c.name}</span>
      {c.is_purchase && <Badge variant="secondary" className="text-xs">compra</Badge>}
      {comResponsaveis && (nomesDe(c.id) ? (
        <Badge variant="outline" className="text-xs" title={`Quem sempre atende este ${tipo === 'item' ? 'item' : 'subcategoria'}`}>→ {nomesDe(c.id)}</Badge>
      ) : herdado ? (
        <span className="text-xs text-muted-foreground" title="Sem responsável próprio: vale o de cima">→ {herdado}</span>
      ) : null)}
      {tipo === 'subcategoria' && itensDe(c.id).length > 0 && (
        <span className="text-xs text-muted-foreground">{itensDe(c.id).length} {itensDe(c.id).length === 1 ? 'item' : 'itens'}</span>
      )}

      {allowForms && !readOnly && (
        <Button
          variant="outline" size="sm"
          className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
          onClick={() => setFormBuilderCategory(c)}
        >
          <FileText className="h-3.5 w-3.5 mr-1" />Formulário
        </Button>
      )}

      {!readOnly && (
        <>
          <Switch
            checked={c.is_active}
            onCheckedChange={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })}
            aria-label={`Ativar ou desativar ${tipo}`}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Editar ${tipo}`} onClick={() => openDialog(paiId, c, tipo)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
            aria-label={`Excluir ${tipo}`}
            onClick={() => { setDeletingCategory(c); setDeleteDialogOpen(true); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );

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
            {category.is_purchase && <Badge variant="secondary" className="text-xs">compra</Badge>}
            {comResponsaveis && nomesDe(category.id) && (
              <Badge variant="outline" className="text-xs" title="Quem sempre atende esta categoria">→ {nomesDe(category.id)}</Badge>
            )}
            <span className="text-xs text-muted-foreground">{category.children.length} sub</span>

            {/* Formulário é configuração: some com `readOnly`. Antes aparecia para quem só lia, e o
                banco recusava ao salvar (`ticket_form_fields_quem_configura`, LEVA P). */}
            {allowForms && !readOnly && (
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
                <div key={child.id}>
                  {linha(child, category.id, nomesDe(category.id) ? `${nomesDe(category.id)} (da categoria)` : null, 'subcategoria')}
                  {/* O terceiro nível (dono, 2026-10-13: "Software › Forteplus › Correções e Ajustes"). Só até aqui:
                      o banco recusa um quarto nível (`categoria_no_maximo_tres_niveis`). */}
                  {(itensDe(child.id).length > 0 || !readOnly) && (
                    <div className="ml-6 border-l pl-3 space-y-1">
                      {itensDe(child.id).map(item => (
                        <div key={item.id}>
                          {linha(item, child.id,
                            nomesDe(child.id) ? `${nomesDe(child.id)} (da subcategoria)` : nomesDe(category.id) ? `${nomesDe(category.id)} (da categoria)` : null,
                            'item')}
                        </div>
                      ))}
                      {!readOnly && (
                        <Button variant="ghost" size="sm" className="h-7 justify-start text-[13px] text-muted-foreground hover:text-foreground"
                          onClick={() => openDialog(child.id, undefined, 'item')}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar item em {child.name}
                        </Button>
                      )}
                    </div>
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
            <DialogTitle>{tipoNoDialogo === 'item' ? (editingCategory ? 'Editar item' : 'Novo item') : `${editingCategory ? 'Editar' : 'Nova'} ${tipoNoDialogo}`}</DialogTitle>
            <DialogDescription>
              {tipoNoDialogo === 'item'
                ? 'O item é o terceiro nível (ex.: Software › Forteplus › Correções e Ajustes). Quando uma subcategoria tem itens, quem abre o chamado escolhe um deles.'
                : parentId
                  ? 'Adicione uma subcategoria para organizar melhor os pedidos. Dentro dela dá para criar itens.'
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

          {comResponsaveis && (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Quem sempre atende <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <p className="text-xs text-muted-foreground">
                Com uma pessoa, o chamado vai direto para ela e quem abre não consegue trocar. Com duas
                ou mais, quem abre escolhe só entre elas. Sem ninguém, cai na fila do setor
                {parentId ? ' — ou vale quem está marcado no nível de cima mais próximo' : ''}.
              </p>
              {membros.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguém tem acesso a este setor ainda.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {membros.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={responsaveis.includes(m.id)}
                        onCheckedChange={(v) => setResponsaveis(prev =>
                          v ? [...prev, m.id] : prev.filter(id => id !== m.id))}
                      />
                      {m.full_name || m.email}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {ofereceCompra && (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                id="category-is-purchase"
                checked={isPurchase}
                onCheckedChange={setIsPurchase}
                aria-label="Chamado desta categoria é uma compra"
              />
              <div className="space-y-1">
                <Label htmlFor="category-is-purchase">É um pedido de compra</Label>
                <p className="text-xs text-muted-foreground">
                  Quem abrir um chamado nesta categoria preenche produto, orçamentos e
                  valor, e o pedido passa pela aprovação antes de virar conta a pagar.
                </p>
              </div>
            </div>
          )}
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
          outrasCategorias={categoriesWithChildren
            .flatMap(c => [{ id: c.id, nome: c.name }, ...c.children.flatMap(f => [
              { id: f.id, nome: `${c.name} › ${f.name}` },
              ...itensDe(f.id).map(i => ({ id: i.id, nome: `${c.name} › ${f.name} › ${i.name}` })),
            ])])
            .filter(c => c.id !== formBuilderCategory.id)}
        />
      )}
    </div>
  );
}
