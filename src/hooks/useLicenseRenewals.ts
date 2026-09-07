import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LicenseRenewal } from '@/types/it-management';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export function useLicenseRenewals(licenseId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['license-renewals', tenantId, licenseId],
    queryFn: async (): Promise<LicenseRenewal[]> => {
      if (!licenseId) return [];
      const { data, error } = await (supabase as any)
        .from('software_license_renewals')
        .select('*')
        .eq('license_id', licenseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LicenseRenewal[];
    },
    enabled: !!licenseId,
  });
}

interface CreateRenewalInput {
  license_id: string;
  previous_purchase_date: string | null;
  previous_expiry_date: string | null;
  new_purchase_date: string | null;
  new_expiry_date: string | null;
  renewal_value: number | null;
  provider: string | null;
  notes: string | null;
}

export function useCreateLicenseRenewal() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRenewalInput) => {
      const { user } = unwrap(await supabase.auth.getUser());
      const userId = user?.id ?? null;

      // 1. Insere histórico
      const { error: insertErr } = await (supabase as any)
        .from('software_license_renewals')
        .insert({
          license_id: input.license_id,
          previous_purchase_date: input.previous_purchase_date,
          previous_expiry_date: input.previous_expiry_date,
          new_purchase_date: input.new_purchase_date,
          new_expiry_date: input.new_expiry_date,
          renewal_value: input.renewal_value,
          provider: input.provider,
          notes: input.notes,
          created_by: userId,
        });
      if (insertErr) throw insertErr;

      // 2. Atualiza a licença principal com novos dados
      const updates: Record<string, any> = {};
      if (input.new_purchase_date) updates.purchase_date = input.new_purchase_date;
      if (input.new_expiry_date) updates.expiry_date = input.new_expiry_date;
      if (input.renewal_value !== null) updates.purchase_value = input.renewal_value;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from('software_licenses')
          .update(updates)
          .eq('id', input.license_id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['license-renewals', tenantId, variables.license_id] });
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['license', tenantId, variables.license_id] });
    },
  });
}
