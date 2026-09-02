import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { FinEntry, FinEntryInput, FinImport, FinKind } from '@/types/financeiro';
import type { ParsedRow } from '@/lib/finance-import';

const TABLE = 'fin_entries' as const;
const IMPORTS = 'fin_imports' as const;

export function useFinEntries(kind?: FinKind) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['fin-entries', tenantId, kind ?? 'all'],
    enabled: !!tenantId,
    queryFn: async (): Promise<FinEntry[]> => {
      let query = supabase.from(TABLE).select('*').order('due_date', { ascending: true });
      if (kind) query = query.eq('kind', kind);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as FinEntry[];
    },
  });
}

export function useFinImports(kind?: FinKind) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['fin-imports', tenantId, kind ?? 'all'],
    enabled: !!tenantId,
    queryFn: async (): Promise<FinImport[]> => {
      let query = supabase.from(IMPORTS).select('*').order('created_at', { ascending: false });
      if (kind) query = query.eq('kind', kind);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as FinImport[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fin-entries'] });
    qc.invalidateQueries({ queryKey: ['fin-imports'] });
  };
}

export function useCreateFinEntry() {
  const { user, tenantId } = useAuth();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: FinEntryInput) => {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...input, tenant_id: tenantId, created_by: user?.id ?? null } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Lançamento criado'); },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível criar o lançamento'),
  });
}

export function useUpdateFinEntry() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<FinEntry> & { id: string }) => {
      const { error } = await supabase.from(TABLE).update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Lançamento atualizado'); },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível atualizar o lançamento'),
  });
}

export function useDeleteFinEntry() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Lançamento excluído'); },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível excluir o lançamento'),
  });
}

export interface ImportPayload {
  kind: FinKind;
  fileName: string;
  format: string;
  rows: ParsedRow[];
}

/**
 * Importa em lote. Nunca sobrescreve o histórico: cada importação registra um novo
 * lote em `fin_imports` e insere lançamentos adicionais, acumulando competências.
 */
export function useImportFinEntries() {
  const { user, tenantId } = useAuth();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ kind, fileName, format, rows }: ImportPayload) => {
      const competences = [...new Set(rows.map(r => r.competence))].sort();
      const total = rows.reduce((sum, r) => sum + r.amount, 0);

      const { data: batch, error: batchError } = await supabase
        .from(IMPORTS)
        .insert({
          tenant_id: tenantId,
          kind,
          file_name: fileName,
          format,
          competence: competences[0] ?? null,
          row_count: rows.length,
          total_amount: total,
          imported_by: user?.id ?? null,
        } as never)
        .select()
        .single();
      if (batchError) throw batchError;

      const importId = (batch as any).id as string;
      const payload = rows.map(r => ({
        tenant_id: tenantId,
        kind,
        description: r.description,
        category: r.category,
        counterparty: r.counterparty,
        document_number: r.document_number,
        amount: r.amount,
        due_date: r.due_date,
        settled_at: r.settled_at,
        status: r.status,
        payment_method: r.payment_method,
        cost_center: r.cost_center,
        competence: r.competence,
        notes: r.notes,
        source: fileName,
        import_id: importId,
        created_by: user?.id ?? null,
      }));

      for (let i = 0; i < payload.length; i += 400) {
        const { error } = await supabase.from(TABLE).insert(payload.slice(i, i + 400) as never);
        if (error) throw error;
      }
      return { importId, count: rows.length };
    },
    onSuccess: (r) => { invalidate(); toast.success(`${r.count} lançamentos importados`); },
    onError: (e: any) => toast.error(e?.message || 'Falha ao importar a planilha'),
  });
}

/** Remove um lote inteiro (arquivo importado por engano). */
export function useDeleteFinImport() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (importId: string) => {
      const { error: entriesError } = await supabase.from(TABLE).delete().eq('import_id', importId);
      if (entriesError) throw entriesError;
      const { error } = await supabase.from(IMPORTS).delete().eq('id', importId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Importação removida'); },
    onError: (e: any) => toast.error(e?.message || 'Não foi possível remover a importação'),
  });
}
