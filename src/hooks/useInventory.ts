import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Asset } from '@/types/helpdesk';
import type { AssetWithOwner, AssetFormData } from '@/types/inventory';
import type { TicketWithDetails } from '@/types/helpdesk';

export function useInventoryAssets() {
  const [assets, setAssets] = useState<AssetWithOwner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select(`
          *,
          owner:profiles!assets_assigned_to_fkey(id, full_name, email, department)
        `)
        .order('asset_tag', { ascending: true });

      if (error) throw error;
      setAssets((data as unknown as AssetWithOwner[]) || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return { assets, isLoading, refetch: fetchAssets };
}

export function useAssetById(assetId: string | null) {
  const [asset, setAsset] = useState<AssetWithOwner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAsset = useCallback(async () => {
    if (!assetId) {
      setAsset(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select(`
          *,
          owner:profiles!assets_assigned_to_fkey(id, full_name, email, department)
        `)
        .eq('id', assetId)
        .single();

      if (error) throw error;
      setAsset(data as unknown as AssetWithOwner);
    } catch (error) {
      console.error('Error fetching asset:', error);
      setAsset(null);
    } finally {
      setIsLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  return { asset, isLoading, refetch: fetchAsset };
}

export function useAssetTicketHistory(assetId: string | null) {
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!assetId) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email, department),
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)
        `)
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets((data as unknown as TicketWithDetails[]) || []);
    } catch (error) {
      console.error('Error fetching asset ticket history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { tickets, isLoading, refetch: fetchHistory };
}

export function useAssetMutations() {
  const [isLoading, setIsLoading] = useState(false);

  const createAsset = async (data: AssetFormData) => {
    setIsLoading(true);
    try {
      const { data: asset, error } = await supabase
        .from('assets')
        .insert(data as any)
        .select()
        .single();

      if (error) throw error;
      return asset as Asset;
    } finally {
      setIsLoading(false);
    }
  };

  const updateAsset = async (id: string, data: Partial<AssetFormData>) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('assets')
        .update(data as any)
        .eq('id', id);

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAsset = async (id: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const transferOwnership = async (assetId: string, newOwnerId: string | null) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('assets')
        .update({ assigned_to: newOwnerId })
        .eq('id', assetId);

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { createAsset, updateAsset, deleteAsset, transferOwnership, isLoading };
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; email: string; department: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, department')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return { profiles, isLoading };
}
