import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Formulários do site (CRM-3a, ADR-006): a empresa monta campo a campo e recebe
 * o lead direto no funil. A página pública lê por `crm_form_publico()`, que não
 * devolve funil, segmento nem dono — isso é assunto interno.
 */

export type CRMForm = Database['public']['Tables']['crm_forms']['Row'];

/** Os cinco embutidos + `custom:<id>` para campo personalizado do contato. */
export type FormFieldKey = 'name' | 'email' | 'phone' | 'company' | 'message' | string;

export interface FormField {
  key: FormFieldKey;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'number' | 'date';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export const CAMPOS_EMBUTIDOS: FormField[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', label: 'Telefone / WhatsApp', type: 'tel' },
  { key: 'company', label: 'Empresa', type: 'text' },
  { key: 'message', label: 'Mensagem', type: 'textarea' },
];

export function useCRMForms() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-forms', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMForm[]> =>
      unwrap(await supabase.from('crm_forms').select('*').order('created_at', { ascending: false })),
  });
}

export interface FormInput {
  id?: string;
  name: string;
  slug: string;
  is_active?: boolean;
  pipeline_id?: string | null;
  segment_id?: string | null;
  owner_id?: string | null;
  headline?: string | null;
  subhead?: string | null;
  submit_label?: string;
  success_message?: string;
  redirect_url?: string | null;
  fields: FormField[];
}

export function useSaveCRMForm() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FormInput) => {
      const payload = {
        name: input.name,
        slug: input.slug,
        is_active: input.is_active ?? true,
        pipeline_id: input.pipeline_id ?? null,
        segment_id: input.segment_id ?? null,
        owner_id: input.owner_id ?? null,
        headline: input.headline ?? null,
        subhead: input.subhead ?? null,
        submit_label: input.submit_label || 'Enviar',
        success_message: input.success_message || 'Recebemos sua mensagem. Em breve entramos em contato.',
        redirect_url: input.redirect_url ?? null,
        fields: input.fields as unknown as Json,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('crm_forms').update(payload).eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'o formulário',
        );
      }
      return expectRows(
        await supabase.from('crm_forms').insert({ ...payload, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'o formulário',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-forms', tenantId] });
      toast.success('Formulário salvo.');
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes('crm_forms_tenant_id_slug_key')
        ? 'Já existe um formulário com esse endereço nesta empresa.'
        : msg.includes('crm_forms_slug_check')
          ? 'O endereço só aceita letras minúsculas, números e hífen.'
          : msg);
    },
  });
}

export function useDeleteCRMForm() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('crm_forms').delete().eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'o formulário',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-forms', tenantId] });
      toast.success('Formulário removido.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export interface FormPublico {
  form_id: string;
  tenant_id: string;
  name: string;
  headline: string | null;
  subhead: string | null;
  submit_label: string;
  success_message: string;
  redirect_url: string | null;
  fields: FormField[];
  empresa: string;
  logo_url: string | null;
}

/** A página pública: sem login, e só o que o visitante precisa ver. */
export function useFormPublico(tenantSlug: string | undefined, formSlug: string | undefined) {
  return useQuery({
    // A regra 3 pede `tenantId` na chave para o cache não misturar empresas.
    // Aqui não há login nem `tenantId`: quem separa as empresas é o `tenantSlug`
    // do endereço, que está na chave e cumpre exatamente o mesmo papel.
    // eslint-disable-next-line no-restricted-syntax -- página pública: o slug da empresa É a separação
    queryKey: ['crm-form-publico', tenantSlug, formSlug],
    enabled: !!tenantSlug && !!formSlug,
    queryFn: async (): Promise<FormPublico | null> => {
      const rows = unwrap(await supabase.rpc('crm_form_publico', {
        p_tenant_slug: tenantSlug!, p_form_slug: formSlug!,
      }));
      return (rows[0] as unknown as FormPublico) ?? null;
    },
  });
}
