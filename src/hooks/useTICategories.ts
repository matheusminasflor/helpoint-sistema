import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type TIModule = 'inventory' | 'contracts' | 'licenses' | 'maintenances' | 'tickets' | 'marketing' | 'financeiro' | 'rh' | 'qualidade';

export interface TICategory {
  id: string;
  tenant_id: string;
  module: TIModule;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithChildren extends TICategory {
  children: TICategory[];
}

export function formatTICategoryLabel(category: TICategory, allCategories: TICategory[]) {
  if (!category.parent_id) {
    return `${category.name} (categoria)`;
  }

  const parent = allCategories.find((item) => item.id === category.parent_id);
  return parent
    ? `${parent.name} > ${category.name} (subcategoria)`
    : `${category.name} (subcategoria)`;
}

export function useTICategories(module?: TIModule) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['ti-categories', tenantId, module],
    queryFn: async () => {
      let query = supabase
        .from('ti_categories' as 'profiles') // workaround para tipo não gerado
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (module) {
        query = query.eq('module' as 'email', module);
      }

      const { data, error } = await query as unknown as { data: TICategory[] | null; error: Error | null };
      
      if (error) throw error;
      return (data || []) as TICategory[];
    },
  });

  // Organiza categorias em estrutura hierárquica
  const categoriesWithChildren: CategoryWithChildren[] = categories
    .filter(cat => cat.parent_id === null)
    .map(parent => ({
      ...parent,
      children: categories.filter(child => child.parent_id === parent.id),
    }));

  // Apenas categorias raiz (para selects de categoria principal)
  const rootCategories = categories.filter(cat => cat.parent_id === null && cat.is_active);

  // Função para obter subcategorias de uma categoria específica
  const getSubcategories = (parentId: string) => 
    categories.filter(cat => cat.parent_id === parentId && cat.is_active);

  // Criar categoria
  const createCategory = useMutation({
    mutationFn: async (data: {
      module: TIModule;
      name: string;
      parent_id?: string | null;
      sort_order?: number;
    }) => {
      // Usamos rpc ou query direta já que o tipo ainda não foi regenerado
      const { data: result, error } = await (supabase
        .from('ti_categories' as 'profiles') // workaround para tipo não gerado
        .insert({
          module: data.module,
          name: data.name,
          parent_id: data.parent_id || null,
          sort_order: data.sort_order || 0,
        } as never)
        .select()
        .single() as unknown as Promise<{ data: TICategory | null; error: Error | null }>);

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ti-categories'] });
      toast({
        title: 'Categoria criada',
        description: 'A categoria foi adicionada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar categoria',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Atualizar categoria
  const updateCategory = useMutation({
    mutationFn: async ({ id, ...data }: Partial<TICategory> & { id: string }) => {
      const { data: result, error } = await (supabase
        .from('ti_categories' as 'profiles')
        .update(data as never)
        .eq('id' as 'email', id)
        .select()
        .single() as unknown as Promise<{ data: TICategory | null; error: Error | null }>);

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ti-categories'] });
      toast({
        title: 'Categoria atualizada',
        description: 'A categoria foi atualizada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar categoria',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Deletar categoria
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase
        .from('ti_categories' as 'profiles')
        .delete()
        .eq('id' as 'email', id) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ti-categories'] });
      toast({
        title: 'Categoria removida',
        description: 'A categoria foi removida com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover categoria',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle ativo/inativo
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase
        .from('ti_categories' as 'profiles')
        .update({ is_active } as never)
        .eq('id' as 'email', id) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ti-categories'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    categories,
    categoriesWithChildren,
    rootCategories,
    getSubcategories,
    isLoading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    toggleActive,
  };
}
