import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MKTSupplier, MKTSupplierCategory, MKTSupplierStatus } from '@/types/mkt-expanded';
import { useAuth } from '@/contexts/AuthContext';

interface CreateSupplierData {
  name: string;
  cnpj?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category?: MKTSupplierCategory;
  services?: string[];
  rating?: number;
  status?: MKTSupplierStatus;
  notes?: string;
}

interface UpdateSupplierData extends Partial<CreateSupplierData> {
  id: string;
}

export function useMKTSuppliers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-suppliers', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_suppliers')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as MKTSupplier[];
    },
  });
}

export function useMKTSupplier(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-supplier', tenantId, id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('mkt_suppliers')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as MKTSupplier;
    },
    enabled: !!id,
  });
}

export function useMKTActiveSuppliers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-suppliers-active', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_suppliers')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as MKTSupplier[];
    },
  });
}

export function useCreateMKTSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierData) => {
      const insertData = {
        name: data.name,
        cnpj: data.cnpj,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        category: data.category || 'outro',
        services: data.services || [],
        rating: data.rating,
        status: data.status || 'active',
        notes: data.notes,
      } as any;
      
      const { data: result, error } = await supabase
        .from('mkt_suppliers')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-suppliers'] });
      toast.success('Fornecedor criado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar fornecedor: ' + error.message);
    },
  });
}

export function useUpdateMKTSupplier() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSupplierData) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('mkt_suppliers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-supplier', tenantId, variables.id] });
      toast.success('Fornecedor atualizado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar fornecedor: ' + error.message);
    },
  });
}

export function useDeleteMKTSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mkt_suppliers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-suppliers'] });
      toast.success('Fornecedor removido com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover fornecedor: ' + error.message);
    },
  });
}
