import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MKTQuotation, MKTQuotationStatus, MKTQuotationItem } from '@/types/mkt-expanded';
import type { Json } from '@/integrations/supabase/types';

interface CreateQuotationData {
  supplier_id: string;
  event_id?: string;
  title: string;
  description?: string;
  items?: MKTQuotationItem[];
  total_value?: number;
  status?: MKTQuotationStatus;
  valid_until?: string;
  notes?: string;
}

interface UpdateQuotationData extends Partial<CreateQuotationData> {
  id: string;
  approved_by?: string;
  approved_at?: string;
  purchase_order_ref?: string;
}

export function useMKTQuotations() {
  return useQuery({
    queryKey: ['mkt-quotations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_quotations')
        .select(`
          *,
          supplier:mkt_suppliers(id, name, category),
          event:mkt_events(id, title)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as MKTQuotation[];
    },
  });
}

export function useMKTQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ['mkt-quotation', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('mkt_quotations')
        .select(`
          *,
          supplier:mkt_suppliers(id, name, category, contact_name, contact_email, contact_phone),
          event:mkt_events(id, title)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as unknown as MKTQuotation;
    },
    enabled: !!id,
  });
}

export function useMKTQuotationsBySupplier(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['mkt-quotations-supplier', supplierId],
    queryFn: async () => {
      if (!supplierId) return [];
      const { data, error } = await supabase
        .from('mkt_quotations')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as MKTQuotation[];
    },
    enabled: !!supplierId,
  });
}

export function useMKTApprovedQuotations() {
  return useQuery({
    queryKey: ['mkt-quotations-approved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mkt_quotations')
        .select(`
          *,
          supplier:mkt_suppliers(id, name, category)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as unknown as MKTQuotation[];
    },
  });
}

export function useCreateMKTQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateQuotationData) => {
      const insertData = {
        supplier_id: data.supplier_id,
        event_id: data.event_id,
        title: data.title,
        description: data.description,
        items: (data.items || []) as unknown as Json,
        total_value: data.total_value,
        status: data.status || 'pending',
        valid_until: data.valid_until,
        notes: data.notes,
      } as any;
      
      const { data: result, error } = await supabase
        .from('mkt_quotations')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-quotations'] });
      toast.success('Cotação criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar cotação: ' + error.message);
    },
  });
}

export function useUpdateMKTQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateQuotationData) => {
      const { id, items, ...rest } = data;
      const updateData = items ? { ...rest, items: items as unknown as Json } : rest;
      const { data: result, error } = await supabase
        .from('mkt_quotations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-quotations'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-quotation', variables.id] });
      toast.success('Cotação atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar cotação: ' + error.message);
    },
  });
}

export function useApproveMKTQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: result, error } = await supabase
        .from('mkt_quotations')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['mkt-quotations'] });
      queryClient.invalidateQueries({ queryKey: ['mkt-quotation', id] });
      queryClient.invalidateQueries({ queryKey: ['mkt-quotations-approved'] });
      toast.success('Cotação aprovada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao aprovar cotação: ' + error.message);
    },
  });
}

export function useDeleteMKTQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mkt_quotations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mkt-quotations'] });
      toast.success('Cotação removida com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover cotação: ' + error.message);
    },
  });
}
