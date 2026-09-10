import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { CustomFieldDef, CustomFieldEntity, CustomFieldOption, CustomFieldType } from '@/lib/custom-fields';
import type { Database } from '@/integrations/supabase/types';

type Row = Database['public']['Tables']['crm_custom_fields']['Row'];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function toDef(row: Row): CustomFieldDef {
  return {
    id: row.id,
    entity: row.entity as CustomFieldEntity,
    key: row.key,
    label: row.label,
    type: row.type as CustomFieldType,
    options: Array.isArray(row.options) ? (row.options as unknown as CustomFieldOption[]) : [],
    required: row.required,
    position: row.position,
    is_active: row.is_active,
  };
}

/** Definições de campos personalizados de um cadastro. Por padrão só os ativos (é o que os formulários mostram). */
export function useCustomFields(entity: CustomFieldEntity, includeInactive = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-custom-fields', tenantId, entity, includeInactive],
    enabled: !!tenantId,
    queryFn: async (): Promise<CustomFieldDef[]> => {
      let query = supabase.from('crm_custom_fields').select('*').eq('tenant_id', tenantId!).eq('entity', entity).order('position');
      if (!includeInactive) query = query.eq('is_active', true);
      return unwrap(await query).map(toDef);
    },
  });
}

export interface CustomFieldInput {
  id?: string;
  entity: CustomFieldEntity;
  key?: string;
  label: string;
  type: CustomFieldType;
  options?: CustomFieldOption[];
  required?: boolean;
  is_active?: boolean;
}

/** Cria ou edita a definição. A chave e o tipo só entram na criação (o banco recusa mudar a chave). */
export function useSaveCustomField() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomFieldInput) => {
      const patch = {
        label: input.label,
        options: (input.options ?? []) as unknown as Database['public']['Tables']['crm_custom_fields']['Insert']['options'],
        required: input.required ?? false,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        return expectRows(await supabase.from('crm_custom_fields').update(patch).eq('id', input.id).select('id'), 'o campo');
      }
      // `head: true` devolve `data = null` e o total em `count`: `unwrap` devolveria
      // null e criar campo falharia sempre (mesmo defeito corrigido em useSavePipeline).
      const counted = await supabase
        .from('crm_custom_fields')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('entity', input.entity);
      if (counted.error) throw counted.error;
      const count = counted.count;
      return expectRows(
        await supabase
          .from('crm_custom_fields')
          .insert({ ...patch, tenant_id: tenantId!, entity: input.entity, key: input.key!, type: input.type, position: (count ?? 0) + 1 })
          .select('id'),
        'o campo',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-custom-fields', tenantId] });
      toast.success('Campo salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Nova ordem: um `update` por campo, na ordem da lista. */
export function useReorderCustomFields() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [index, id] of ids.entries()) {
        expectRows(await supabase.from('crm_custom_fields').update({ position: index + 1 }).eq('id', id).select('id'), 'o campo');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-custom-fields', tenantId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Apagar de verdade (gerente): some da definição; valores já gravados nos contatos passam a ser "chave desconhecida" só se alguém os reenviar. */
export function useDeleteCustomField() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('crm_custom_fields').delete().eq('id', id).select('id'), 'o campo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-custom-fields', tenantId] });
      toast.success('Campo apagado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
