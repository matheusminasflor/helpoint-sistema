import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type FormFieldType = 
  | 'text' 
  | 'textarea' 
  | 'email' 
  | 'phone' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'date' 
  | 'file'
  | 'delivery_datetime'
  | 'assignee_select';

export interface TicketFormField {
  id: string;
  tenant_id: string;
  category_id: string;
  label: string;
  field_type: FormFieldType;
  options: string[];
  is_required: boolean;
  placeholder: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketFormResponse {
  id: string;
  tenant_id: string;
  ticket_id: string;
  field_id: string;
  value: string | null;
  created_at: string;
}

export function useTicketFormFields(categoryId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: fields = [], isLoading, error } = useQuery({
    queryKey: ['ticket-form-fields', categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await supabase
        .from('ticket_form_fields' as 'profiles')
        .select('*')
        .eq('category_id' as 'email', categoryId)
        .eq('is_active' as 'email', true as unknown as string)
        .order('sort_order' as 'email', { ascending: true }) as unknown as { 
          data: TicketFormField[] | null; 
          error: Error | null 
        };
      
      if (error) throw error;
      return (data || []) as TicketFormField[];
    },
    enabled: !!categoryId,
  });

  // Buscar todos os campos de uma categoria (incluindo inativos) para edição
  const { data: allFields = [], isLoading: isLoadingAll } = useQuery({
    queryKey: ['ticket-form-fields-all', categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await supabase
        .from('ticket_form_fields' as 'profiles')
        .select('*')
        .eq('category_id' as 'email', categoryId)
        .order('sort_order' as 'email', { ascending: true }) as unknown as { 
          data: TicketFormField[] | null; 
          error: Error | null 
        };
      
      if (error) throw error;
      return (data || []) as TicketFormField[];
    },
    enabled: !!categoryId,
  });

  // Criar campo
  const createField = useMutation({
    mutationFn: async (data: {
      category_id: string;
      label: string;
      field_type: FormFieldType;
      options?: string[];
      is_required?: boolean;
      placeholder?: string;
      sort_order?: number;
    }) => {
      const { data: result, error } = await supabase
        .from('ticket_form_fields' as 'profiles')
        .insert({
          category_id: data.category_id,
          label: data.label,
          field_type: data.field_type,
          options: data.options || [],
          is_required: data.is_required || false,
          placeholder: data.placeholder || null,
          sort_order: data.sort_order || 0,
        } as never)
        .select()
        .single() as unknown as { data: TicketFormField | null; error: Error | null };

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields-all'] });
      toast({
        title: 'Campo criado',
        description: 'O campo foi adicionado ao formulário.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar campo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Atualizar campo
  const updateField = useMutation({
    mutationFn: async ({ id, ...data }: Partial<TicketFormField> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('ticket_form_fields' as 'profiles')
        .update(data as never)
        .eq('id' as 'email', id)
        .select()
        .single() as unknown as { data: TicketFormField | null; error: Error | null };

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields-all'] });
      toast({
        title: 'Campo atualizado',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar campo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Deletar campo
  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ticket_form_fields' as 'profiles')
        .delete()
        .eq('id' as 'email', id) as unknown as { error: Error | null };

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields-all'] });
      toast({
        title: 'Campo removido',
        description: 'O campo foi removido do formulário.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover campo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reordenar campos
  const reorderFields = useMutation({
    mutationFn: async (fieldIds: string[]) => {
      const updates = fieldIds.map((id, index) => 
        supabase
          .from('ticket_form_fields' as 'profiles')
          .update({ sort_order: index } as never)
          .eq('id' as 'email', id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-form-fields-all'] });
    },
  });

  return {
    fields,
    allFields,
    isLoading,
    isLoadingAll,
    error,
    createField,
    updateField,
    deleteField,
    reorderFields,
  };
}

// Hook para salvar respostas do formulário
export function useTicketFormResponses() {
  const { toast } = useToast();

  const saveResponses = useMutation({
    mutationFn: async (responses: { ticket_id: string; field_id: string; value: string }[]) => {
      if (responses.length === 0) return;

      const { error } = await supabase
        .from('ticket_form_responses' as 'profiles')
        .insert(responses as never) as unknown as { error: Error | null };

      if (error) throw error;
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar respostas',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return { saveResponses };
}

// Hook para buscar respostas de um ticket
export function useTicketResponses(ticketId?: string) {
  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['ticket-form-responses', ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from('ticket_form_responses' as 'profiles')
        .select(`
          *,
          field:ticket_form_fields(*)
        `)
        .eq('ticket_id' as 'email', ticketId) as unknown as { 
          data: (TicketFormResponse & { field: TicketFormField })[] | null; 
          error: Error | null 
        };
      
      if (error) throw error;
      return (data || []);
    },
    enabled: !!ticketId,
  });

  return { responses, isLoading };
}
