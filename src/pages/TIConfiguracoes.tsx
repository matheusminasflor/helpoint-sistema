import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Settings, FileText, Shield, Clock, CheckSquare, Plug, Info, Building2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { useTICategories, TIModule, TICategory, CategoryWithChildren } from '@/hooks/useTICategories';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { useTenantSettings, useUpdateTenantSettings, TenantSettings } from '@/hooks/useTenantSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { FormBuilderDialog } from '@/components/ti/FormBuilderDialog';
import { useTicketFormFields } from '@/hooks/useTicketFormFields';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';


import { SLAPoliciesTab } from '@/components/ti/SLAPoliciesTab';
import { ChecklistTemplatesTab } from '@/components/ti/ChecklistTemplatesTab';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';

const MODULE_LABELS: Record<Exclude<TIModule, 'marketing' | 'financeiro' | 'rh' | 'qualidade'>, string> = {
  inventory: 'Inventário',
  contracts: 'Contratos',
  licenses: 'Licenças',
  maintenances: 'Manutenções',
  tickets: 'Chamados',
};

export default function TIConfiguracoes() {
  const [activeModule, setActiveModule] = useState<TIModule>('tickets');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TICategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<TICategory | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [formBuilderCategory, setFormBuilderCategory] = useState<TICategory | null>(null);
  const [activeTab, setActiveTab] = useState<'categories' | 'checklists' | 'sla' | 'integrations'>('categories');

  const {
    categoriesWithChildren,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    toggleActive,
  } = useTICategories(activeModule);

  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: tenantSettings, isLoading: settingsLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const { can } = useDepartmentPermissions('ti');


  const handleSettingsChange = (key: keyof TenantSettings['alerts'], value: number | boolean) => {
    // Boolean toggles (Switch) get a confirmation toast; numeric sliders are silent
    // (the slider component already gives visual feedback while dragging).
    const isSilent = typeof value === 'number';
    updateSettings.mutate({
      settings: {
        alerts: {
          ...tenantSettings?.alerts,
          [key]: value,
        },
      },
      silent: isSilent,
    });
  };

  const handleOpenDialog = (parentId: string | null = null, category?: TICategory) => {
    setParentId(parentId);
    setEditingCategory(category || null);
    setCategoryName(category?.name || '');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCategory(null);
    setParentId(null);
    setCategoryName('');
  };

  const handleSave = async () => {
    if (!categoryName.trim()) return;

    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        name: categoryName.trim(),
      });
    } else {
      await createCategory.mutateAsync({
        module: activeModule,
        name: categoryName.trim(),
        parent_id: parentId,
      });
    }

    handleCloseDialog();
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    await deleteCategory.mutateAsync(deletingCategory.id);
    setDeleteDialogOpen(false);
    setDeletingCategory(null);
  };

  const handleToggleActive = (category: TICategory) => {
    toggleActive.mutate({ id: category.id, is_active: !category.is_active });
  };

  const toggleExpanded = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderCategory = (category: CategoryWithChildren) => {
    const isExpanded = expandedCategories.has(category.id);
    const hasChildren = category.children.length > 0;

    return (
      <Collapsible
        key={category.id}
        open={isExpanded}
        onOpenChange={() => toggleExpanded(category.id)}
      >
        <div className="border rounded-lg mb-2 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>

            <span className={`flex-1 font-medium ${!category.is_active ? 'text-muted-foreground line-through' : ''}`}>
              {category.name}
            </span>

            <span className="text-xs text-muted-foreground">
              {category.children.length} sub
            </span>

            {activeModule === 'tickets' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
                onClick={() => setFormBuilderCategory(category)}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Formulário
              </Button>
            )}

            <Switch
              checked={category.is_active}
              onCheckedChange={() => handleToggleActive(category)}
              aria-label="Ativar/Desativar"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleOpenDialog(null, category)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => {
                setDeletingCategory(category);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <CollapsibleContent>
            <div className="pl-8 pr-3 py-2 space-y-1 border-t bg-background">
              {category.children.map(child => (
                <div
                  key={child.id}
                  className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/30 transition-colors"
                >
                  <span className={`flex-1 ${!child.is_active ? 'text-muted-foreground line-through' : ''}`}>
                    {child.name}
                  </span>

                  {activeModule === 'tickets' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => setFormBuilderCategory(child)}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Formulário
                    </Button>
                  )}

                  <Switch
                    checked={child.is_active}
                    onCheckedChange={() => handleToggleActive(child)}
                    aria-label="Ativar/Desativar"
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleOpenDialog(category.id, child)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeletingCategory(child);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleOpenDialog(category.id)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar subcategoria
              </Button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Settings}
        title="Configurações de TI"
        description="Gerencie categorias, subcategorias e alertas do módulo de TI"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-4">
          {(can('categories','view') || can('categories','edit')) && (
            <TabsTrigger value="categories" className="gap-2">
              <Settings className="h-4 w-4" />
              Categorias
            </TabsTrigger>
          )}
          {(can('checklists','view') || can('checklists','edit')) && (
            <TabsTrigger value="checklists" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              Checklists
            </TabsTrigger>
          )}
          {(can('sla','view') || can('sla','edit_policies')) && (
            <TabsTrigger value="sla" className="gap-2">
              <Clock className="h-4 w-4" />
              SLA e Prazos
            </TabsTrigger>
          )}
          <TabsTrigger value="automacoes" className="gap-2">
            <Zap className="h-4 w-4" />
            Automações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Categorias por Módulo</CardTitle>
              <CardDescription>
                Defina as categorias e subcategorias disponíveis em cada módulo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeModule} onValueChange={(v) => setActiveModule(v as TIModule)}>
                <TabsList className="grid w-full grid-cols-5 mb-6">
                  {(Object.keys(MODULE_LABELS) as TIModule[]).map(module => (
                    <TabsTrigger key={module} value={module}>
                      {MODULE_LABELS[module]}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {(Object.keys(MODULE_LABELS) as TIModule[]).map(module => (
                  <TabsContent key={module} value={module} className="space-y-4">
                    <div className="flex justify-end">
                      <Button onClick={() => handleOpenDialog(null)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Categoria
                      </Button>
                    </div>

                    {isLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-14 w-full" />
                        ))}
                      </div>
                    ) : categoriesWithChildren.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>Nenhuma categoria cadastrada para {MODULE_LABELS[module]}.</p>
                        <p className="text-sm mt-1">Clique em "Nova Categoria" para começar.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {categoriesWithChildren.map(renderCategory)}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklists">
          <ChecklistTemplatesTab />
        </TabsContent>

        <TabsContent value="sla">
          <SLAPoliciesTab
            tenantSettings={tenantSettings}
            settingsLoading={settingsLoading}
            onSettingsChange={handleSettingsChange}
          />
        </TabsContent>

        <TabsContent value="automacoes">
          <AutomationsTab module="tickets" />
        </TabsContent>

        {/* Integrações tab removed — feature deferred. */}

        {/* Perfis de Acesso movidos para Configurações → Usuários. */}

      </Tabs>

      {/* Dialog para criar/editar categoria */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Editar' : 'Nova'} {parentId ? 'Subcategoria' : 'Categoria'}
            </DialogTitle>
            <DialogDescription>
              {parentId
                ? 'Adicione uma subcategoria para organizar melhor seus itens.'
                : 'Categorias principais agrupam subcategorias relacionadas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              placeholder={`Nome da ${parentId ? 'subcategoria' : 'categoria'}`}
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!categoryName.trim() || createCategory.isPending || updateCategory.isPending}
            >
              {createCategory.isPending || updateCategory.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação para deletar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a categoria "{deletingCategory?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria deixa de aparecer em novas solicitações de TI.
              {deletingCategory && !deletingCategory.parent_id && (
                <span className="block mt-2 text-destructive font-medium">
                  Atenção: Todas as subcategorias também serão removidas.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para configurar formulário */}
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
