import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { ImportRow } from '@/lib/crm-import';
import type { Database, Json } from '@/integrations/supabase/types';

export type CRMImport = Database['public']['Tables']['crm_imports']['Row'];

export interface ImportBatchResult {
  contacts_created: number;
  contacts_reused: number;
  deals_created: number;
  errors: { line: number; name: string; error: string }[];
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Histórico de importações da empresa, a mais recente primeiro. */
export function useCRMImports() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-imports', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CRMImport[]> =>
      unwrap(await supabase.from('crm_imports').select('*').eq('tenant_id', tenantId!).order('created_at', { ascending: false }).limit(20)),
  });
}

/** Abre a importação (linha em `crm_imports`); devolve o id que os lotes e o "desfazer" usam. */
export function useCreateImport() {
  const { tenantId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { file_name: string; pipeline_id: string | null; rows_total: number }): Promise<string> => {
      const rows = expectRows(
        await supabase.from('crm_imports').insert({ ...input, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'a importação',
      );
      return rows[0].id;
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Um lote de até 200 linhas pela RPC `crm_import_rows`. Erro por linha vem no resultado, não como exceção. */
export function useImportRows() {
  return useMutation({
    mutationFn: async ({ importId, rows }: { importId: string; rows: ImportRow[] }): Promise<ImportBatchResult> =>
      unwrap(await supabase.rpc('crm_import_rows', { p_import: importId, p_rows: rows as unknown as Json })) as unknown as ImportBatchResult,
  });
}

/** Fecha a importação (status, total de linhas) e recarrega contatos e negócios. */
export function useFinishImport() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ importId, rows_total }: { importId: string; rows_total: number }) =>
      expectRows(
        await supabase.from('crm_imports').update({ status: 'done', rows_total, finished_at: new Date().toISOString() }).eq('id', importId).select('id'),
        'a importação',
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-imports', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
    },
  });
}

export function useUndoImport() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (importId: string) =>
      unwrap(await supabase.rpc('crm_undo_import', { p_import: importId })) as unknown as { deals_deleted: number; contacts_deleted: number },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['crm-imports', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
      toast.success(`Importação desfeita: ${r.deals_deleted} negócio(s) e ${r.contacts_deleted} contato(s) apagados.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
