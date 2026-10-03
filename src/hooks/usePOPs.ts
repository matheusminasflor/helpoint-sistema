import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export type POPVisibilityType = 'all' | 'departments' | 'viewers_only';
export type POPAudience = 'staff' | 'customer';

export interface POP {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  category: string | null;
  subcategory: string | null;
  keywords: string[];
  related_pattern_id: string | null;
  views_count: number;
  solved_count: number;
  avg_rating: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  visibility_type: POPVisibilityType;
  visibility_departments: string[];
  audience: POPAudience;
}

export interface POPInsert {
  title: string;
  content: string;
  category?: string | null;
  subcategory?: string | null;
  keywords?: string[];
  related_pattern_id?: string | null;
  is_active?: boolean;
  visibility_type?: POPVisibilityType;
  visibility_departments?: string[];
  audience?: POPAudience;
}

export interface POPUpdate {
  title?: string;
  content?: string;
  category?: string | null;
  subcategory?: string | null;
  keywords?: string[];
  related_pattern_id?: string | null;
  is_active?: boolean;
  visibility_type?: POPVisibilityType;
  visibility_departments?: string[];
  audience?: POPAudience;
}

export function usePOPs() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pops', tenantId],
    queryFn: async (): Promise<POP[]> => {
      const { data, error } = await supabase
        .from('pops')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as POP[];
    },
  });
}

export function useActivePOPs(category?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pops', tenantId, 'active', category],
    queryFn: async (): Promise<POP[]> => {
      let query = supabase
        .from('pops')
        .select('*')
        .eq('is_active', true)
        .order('title');

      if (category) {
        query = query.or(`category.eq.${category},category.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as POP[];
    },
  });
}

export function usePOP(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['pops', tenantId, id],
    queryFn: async (): Promise<POP | null> => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('pops')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as POP;
    },
    enabled: !!id,
  });
}

export function useCreatePOP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pop: POPInsert): Promise<POP> => {
      // Get user's tenant_id first
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      const profile = unwrap(await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single());

      if (!profile?.tenant_id) throw new Error('User not associated with tenant');

      const { data, error } = await supabase
        .from('pops')
        .insert({
          tenant_id: profile.tenant_id,
          title: pop.title,
          content: pop.content,
          category: pop.category || null,
          subcategory: pop.subcategory || null,
          keywords: pop.keywords || [],
          related_pattern_id: pop.related_pattern_id || null,
          is_active: pop.is_active ?? true,
          visibility_type: pop.visibility_type || 'all',
          visibility_departments: pop.visibility_departments || [],
          audience: pop.audience || 'staff',
          // O autor vê o rascunho que acabou de gravar mesmo sem "editar" no perfil — a policy
          // compara esta coluna (20261124010000).
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as POP;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
      // Toast is handled in TutorialEditor for action button
    },
    onError: (error) => {
      console.error('Error creating POP:', error);
      toast.error('Erro ao criar POP. Tente novamente ou avise o suporte.');
    },
  });
}

export function useUpdatePOP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: POPUpdate }): Promise<POP> => {
      const { data: updated, error } = await supabase
        .from('pops')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated as POP;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
      toast.success('POP atualizado com sucesso');
    },
    onError: (error) => {
      console.error('Error updating POP:', error);
      toast.error('Erro ao atualizar POP. Tente novamente ou avise o suporte.');
    },
  });
}

export function useDeletePOP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('pops')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
      toast.success('POP excluído com sucesso');
    },
    onError: (error) => {
      console.error('Error deleting POP:', error);
      toast.error('Erro ao excluir POP. Tente novamente ou avise o suporte.');
    },
  });
}

/**
 * Conta uma leitura do POP.
 *
 * O teto que estava escrito aqui CAIU em 2026-09-27. A RPC `increment_pop_views`
 * não existia no banco, então o caminho real era o `UPDATE pops` do fallback — e a
 * única policy de UPDATE de `pops` é de supervisor, logo o contador só subia quando
 * um supervisor lia. Agora a função existe (`security definer`, migration
 * `20261108030000`), o fallback saiu, e o erro deixa de ser engolido: se a chamada
 * falhar, `unwrap` lança e o aviso global aparece, em vez de a contagem sumir em
 * silêncio.
 */
export function useIncrementPOPViews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      unwrap(await supabase.rpc('increment_pop_views', { pop_id: id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
    },
  });
}

/** Conta um "resolveu meu problema". Mesma razão de `useIncrementPOPViews`. */
export function useIncrementPOPSolved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      unwrap(await supabase.rpc('increment_pop_solved', { pop_id: id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops'] });
    },
  });
}

export function useRecordPOPInteraction() {
  return useMutation({
    mutationFn: async ({ 
      pop_id, 
      action, 
      ticket_id 
    }: { 
      pop_id: string; 
      action: 'viewed' | 'solved' | 'proceeded'; 
      ticket_id?: string;
    }): Promise<void> => {
      const { user } = unwrap(await supabase.auth.getUser());
      if (!user) throw new Error('Not authenticated');

      const profile = unwrap(await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single());

      if (!profile?.tenant_id) throw new Error('User not associated with tenant');

      const { error } = await supabase
        .from('pop_interactions')
        .insert({
          tenant_id: profile.tenant_id,
          pop_id,
          user_id: user.id,
          action,
          ticket_id: ticket_id || null,
        });

      if (error) throw error;
    },
  });
}
