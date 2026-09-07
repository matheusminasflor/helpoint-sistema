import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AssetStatus } from '@/types/helpdesk';
import { useAuth } from '@/contexts/AuthContext';

export interface MKTAsset {
  id: string;
  tenant_id: string;
  asset_tag: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  assigned_to: string | null;
  department: string | null;
  location: string | null;
  status: AssetStatus;
  purchase_date: string | null;
  purchase_value: number | null;
  warranty_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MKTAssetInput {
  asset_tag: string;
  name: string;
  description?: string | null;
  category?: string;
  subcategory?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  assigned_to?: string | null;
  department?: string | null;
  location?: string | null;
  status?: AssetStatus;
  purchase_date?: string | null;
  purchase_value?: number | null;
  warranty_expiry?: string | null;
  notes?: string | null;
}

export function useMKTAssets() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-assets', tenantId],
    queryFn: async (): Promise<MKTAsset[]> => {
      const { data, error } = await supabase
        .from('mkt_assets' as any)
        .select('*')
        .order('asset_tag', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as MKTAsset[];
    },
  });
}

export function useCreateMKTAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MKTAssetInput) => {
      const { data, error } = await supabase
        .from('mkt_assets' as any)
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mkt-assets'] });
      qc.invalidateQueries({ queryKey: ['mkt-metrics'] });
      toast.success('Item adicionado ao inventário.');
    },
    onError: (e: Error) => toast.error('Erro: ' + e.message),
  });
}

export function useUpdateMKTAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: MKTAssetInput & { id: string }) => {
      const { error } = await supabase
        .from('mkt_assets' as any)
        .update(input as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mkt-assets'] });
      toast.success('Item atualizado.');
    },
    onError: (e: Error) => toast.error('Erro: ' + e.message),
  });
}

export function useDeleteMKTAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mkt_assets' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mkt-assets'] });
      qc.invalidateQueries({ queryKey: ['mkt-metrics'] });
      toast.success('Item removido.');
    },
    onError: (e: Error) => toast.error('Erro: ' + e.message),
  });
}
