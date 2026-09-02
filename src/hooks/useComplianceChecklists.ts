import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ChecklistModule = 'tickets';
export type ChecklistBindingTargetType = 'category' | 'form';
export type TicketChecklistStatus = 'active' | 'completed' | 'skipped';

export interface ChecklistTemplateItemInput {
  id?: string;
  description: string;
  is_required: boolean;
  responsible_sector: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ChecklistTemplateBindingInput {
  id?: string;
  target_type: ChecklistBindingTargetType;
  target_id: string;
  priority: number;
}

export interface ChecklistTemplate {
  id: string;
  tenant_id: string;
  module: ChecklistModule;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: ChecklistTemplateItem[];
  bindings?: ChecklistTemplateBinding[];
}

export interface ChecklistTemplateItem {
  id: string;
  tenant_id: string;
  template_id: string;
  description: string;
  is_required: boolean;
  responsible_sector: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateBinding {
  id: string;
  tenant_id: string;
  template_id: string;
  target_type: ChecklistBindingTargetType;
  target_id: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface TicketChecklistItem {
  id: string;
  tenant_id: string;
  ticket_checklist_id: string;
  template_item_id: string | null;
  description: string;
  is_required: boolean;
  responsible_sector: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TicketChecklist {
  id: string;
  tenant_id: string;
  ticket_id: string;
  template_id: string | null;
  status: TicketChecklistStatus;
  created_at: string;
  updated_at: string;
  template?: Pick<ChecklistTemplate, 'id' | 'name' | 'description'> | null;
  items: TicketChecklistItem[];
}

export interface TicketChecklistGuardrail {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  pendingRequiredItems: number;
  canClose: boolean;
}

const checklistTemplatesTable = 'checklist_templates' as 'profiles';
const checklistTemplateItemsTable = 'checklist_template_items' as 'profiles';
const checklistTemplateBindingsTable = 'checklist_template_bindings' as 'profiles';
const ticketChecklistsTable = 'ticket_checklists' as 'profiles';
const ticketChecklistItemsTable = 'ticket_checklist_items' as 'profiles';

export function getTicketChecklistGuardrail(checklists: TicketChecklist[]): TicketChecklistGuardrail {
  const items = checklists.flatMap((checklist) => checklist.items || []);
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.is_completed).length;
  const requiredItems = items.filter((item) => item.is_required).length;
  const pendingRequiredItems = items.filter((item) => item.is_required && !item.is_completed).length;

  return {
    totalItems,
    completedItems,
    requiredItems,
    pendingRequiredItems,
    canClose: pendingRequiredItems === 0,
  };
}

export function useTicketChecklist(ticketId?: string | null) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['ticket-checklists', ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      if (!ticketId) return [] as TicketChecklist[];

      const { data, error } = await (supabase
        .from(ticketChecklistsTable)
        .select(`
          *,
          template:checklist_templates(id, name, description),
          items:ticket_checklist_items(*)
        `)
        .eq('ticket_id' as 'email', ticketId)
        .order('created_at', { ascending: true }) as unknown as Promise<{ data: TicketChecklist[] | null; error: Error | null }>);

      if (error) throw error;

      return (data || []).map((checklist) => ({
        ...checklist,
        items: [...(checklist.items || [])].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
  });

  const guardrail = useMemo(() => getTicketChecklistGuardrail(data), [data]);

  return {
    checklists: data,
    guardrail,
    isLoading,
    error,
  };
}

export function useToggleTicketChecklistItem(ticketId?: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) => {
      const { error } = await (supabase
        .from(ticketChecklistItemsTable)
        .update({ is_completed: isCompleted } as never)
        .eq('id' as 'email', itemId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-checklists', ticketId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar checklist',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    toggleItem: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}

export function useChecklistTemplates(module: ChecklistModule = 'tickets') {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['checklist-templates', module],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from(checklistTemplatesTable)
        .select(`
          *,
          items:checklist_template_items(*),
          bindings:checklist_template_bindings(*)
        `)
        .eq('module' as 'email', module)
        .order('created_at', { ascending: false }) as unknown as Promise<{ data: ChecklistTemplate[] | null; error: Error | null }>);

      if (error) throw error;

      return (data || []).map((template) => ({
        ...template,
        items: [...(template.items || [])].sort((a, b) => a.sort_order - b.sort_order),
        bindings: [...(template.bindings || [])].sort((a, b) => b.priority - a.priority),
      }));
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-checklists'] });
  };

  const createTemplate = useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string | null;
      is_active?: boolean;
      items: ChecklistTemplateItemInput[];
      bindings: ChecklistTemplateBindingInput[];
    }) => {
      const { data: template, error: templateError } = await (supabase
        .from(checklistTemplatesTable)
        .insert({
          module,
          name: payload.name,
          description: payload.description || null,
          is_active: payload.is_active ?? true,
        } as never)
        .select()
        .single() as unknown as Promise<{ data: ChecklistTemplate | null; error: Error | null }>);

      if (templateError) throw templateError;
      if (!template) throw new Error('Template não criado');

      if (payload.items.length > 0) {
        const { error } = await (supabase
          .from(checklistTemplateItemsTable)
          .insert(
            payload.items.map((item, index) => ({
              template_id: template.id,
              description: item.description,
              is_required: item.is_required,
              responsible_sector: item.responsible_sector || null,
              sort_order: item.sort_order ?? index,
              is_active: item.is_active,
            })) as never
          ) as unknown as Promise<{ error: Error | null }>);

        if (error) throw error;
      }

      if (payload.bindings.length > 0) {
        const { error } = await (supabase
          .from(checklistTemplateBindingsTable)
          .insert(
            payload.bindings.map((binding) => ({
              template_id: template.id,
              target_type: binding.target_type,
              target_id: binding.target_id,
              priority: binding.priority ?? 0,
            })) as never
          ) as unknown as Promise<{ error: Error | null }>);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Checklist criado', description: 'Template salvo com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar checklist', description: error.message, variant: 'destructive' });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      description?: string | null;
      is_active: boolean;
      items: ChecklistTemplateItemInput[];
      bindings: ChecklistTemplateBindingInput[];
    }) => {
      const { error: templateError } = await (supabase
        .from(checklistTemplatesTable)
        .update({
          name: payload.name,
          description: payload.description || null,
          is_active: payload.is_active,
        } as never)
        .eq('id' as 'email', payload.id) as unknown as Promise<{ error: Error | null }>);

      if (templateError) throw templateError;

      const { error: deleteItemsError } = await (supabase
        .from(checklistTemplateItemsTable)
        .delete()
        .eq('template_id' as 'email', payload.id) as unknown as Promise<{ error: Error | null }>);
      if (deleteItemsError) throw deleteItemsError;

      const { error: deleteBindingsError } = await (supabase
        .from(checklistTemplateBindingsTable)
        .delete()
        .eq('template_id' as 'email', payload.id) as unknown as Promise<{ error: Error | null }>);
      if (deleteBindingsError) throw deleteBindingsError;

      if (payload.items.length > 0) {
        const { error } = await (supabase
          .from(checklistTemplateItemsTable)
          .insert(
            payload.items.map((item, index) => ({
              template_id: payload.id,
              description: item.description,
              is_required: item.is_required,
              responsible_sector: item.responsible_sector || null,
              sort_order: item.sort_order ?? index,
              is_active: item.is_active,
            })) as never
          ) as unknown as Promise<{ error: Error | null }>);
        if (error) throw error;
      }

      if (payload.bindings.length > 0) {
        const { error } = await (supabase
          .from(checklistTemplateBindingsTable)
          .insert(
            payload.bindings.map((binding) => ({
              template_id: payload.id,
              target_type: binding.target_type,
              target_id: binding.target_id,
              priority: binding.priority ?? 0,
            })) as never
          ) as unknown as Promise<{ error: Error | null }>);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Checklist atualizado', description: 'As alterações foram salvas.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar checklist', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await (supabase
        .from(checklistTemplatesTable)
        .delete()
        .eq('id' as 'email', templateId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Checklist removido', description: 'O template foi excluído.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover checklist', description: error.message, variant: 'destructive' });
    },
  });

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
