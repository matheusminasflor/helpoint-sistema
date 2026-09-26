import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Supplier, SupplierCategory, SupplierStatus } from '@/types/suppliers';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fornecedores da empresa — uma lista só.
 *
 * Era `useMKTSuppliers` sobre `mkt_suppliers`, enquanto o Financeiro tinha
 * `fin_suppliers` sem tela nenhuma. Leva I (2026-09-26), decisão do dono: uma
 * lista para a empresa toda. O Marketing usa nas cotações; as Compras usam nos
 * orçamentos.
 */

interface CreateSupplierData {
  name: string;
  cnpj?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category?: SupplierCategory;
  services?: string[];
  rating?: number;
  status?: SupplierStatus;
  notes?: string;
}

interface UpdateSupplierData extends Partial<CreateSupplierData> {
  id: string;
}

export function useSuppliers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['suppliers', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Supplier[]> => {
      const data = unwrap(await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true }));
      return (data || []) as unknown as Supplier[];
    },
  });
}

export function useSupplier(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['supplier', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<Supplier | null> => {
      const data = unwrap(await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id!)
        .maybeSingle());
      return (data as unknown as Supplier) ?? null;
    },
  });
}

/** Só os ativos — é a lista que se oferece para escolher num orçamento. */
export function useActiveSuppliers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['suppliers-active', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Supplier[]> => {
      const data = unwrap(await supabase
        .from('suppliers')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true }));
      return (data || []) as unknown as Supplier[];
    },
  });
}

function useInvalidateSuppliers() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['suppliers-active'] });
    qc.invalidateQueries({ queryKey: ['supplier'] });
  };
}

export function useCreateSupplier() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidateSuppliers();

  return useMutation({
    mutationFn: async (data: CreateSupplierData): Promise<Supplier> => {
      const linhas = expectRows(
        await supabase
          .from('suppliers')
          .insert({
            tenant_id: tenantId,
            name: data.name.trim(),
            cnpj: data.cnpj,
            contact_name: data.contact_name,
            contact_email: data.contact_email,
            contact_phone: data.contact_phone,
            category: data.category || 'outro',
            services: data.services || [],
            rating: data.rating,
            status: data.status || 'active',
            notes: data.notes,
          } as never)
          .select('*'),
        'o fornecedor',
      );
      return linhas[0] as unknown as Supplier;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fornecedor cadastrado');
    },
    onError: (error: Error) => {
      // `suppliers_nome_unico` é o índice que impede o mesmo fornecedor duas
      // vezes na empresa — a razão de a lista ser uma só. A mensagem crua do
      // Postgres não diria isso.
      const msg = /suppliers_nome_unico|duplicate key/i.test(error.message)
        ? 'Já existe um fornecedor com esse nome nesta empresa.'
        : error.message;
      toast.error('Erro ao cadastrar fornecedor: ' + msg);
    },
  });
}

export function useUpdateSupplier() {
  const invalidate = useInvalidateSuppliers();

  return useMutation({
    mutationFn: async (data: UpdateSupplierData) => {
      const { id, ...patch } = data;
      expectRows(
        await supabase
          .from('suppliers')
          .update(patch as never)
          .eq('id', id)
          .select('id'),
        'a alteração do fornecedor',
      );
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fornecedor atualizado');
    },
    onError: (error: Error) => toast.error('Erro ao atualizar fornecedor: ' + error.message),
  });
}

export function useDeleteSupplier() {
  const invalidate = useInvalidateSuppliers();

  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('suppliers').delete().eq('id', id).select('id'),
        'a remoção do fornecedor',
      );
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fornecedor removido');
    },
    onError: (error: Error) => toast.error('Erro ao remover fornecedor: ' + error.message),
  });
}
