import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  SoftwareLicense, 
  LicenseWithAssignments, 
  LicenseAssignment,
  LicenseAssignmentWithDetails 
} from '@/types/it-management';

async function getTenantId(): Promise<string> {
  const { data, error } = await supabase.rpc('get_user_tenant_id');
  if (error) throw error;
  return data as string;
}

type LicenseKeyRow = { license_id: string; license_key: string };

export function useLicenses() {
  return useQuery({
    queryKey: ['licenses'],
    queryFn: async (): Promise<LicenseWithAssignments[]> => {
      // Fetch licenses
      const { data: licenses, error: licensesError } = await supabase
        .from('software_licenses')
        .select('*')
        .order('name');

      if (licensesError) throw licensesError;

      // Fetch license keys (will return empty if user lacks permission)
      const { data: keys, error: keysError } = await supabase
        .from('software_license_keys')
        .select('license_id, license_key');

      if (keysError) throw keysError;

      const keyByLicenseId = new Map(
        ((keys || []) as LicenseKeyRow[]).map((k) => [k.license_id, k.license_key])
      );

      // Fetch assignments with related data
      const { data: assignments, error: assignmentsError } = await supabase
        .from('license_assignments')
        .select(`
          *,
          assigned_user:profiles!license_assignments_assigned_to_fkey(id, full_name, email),
          asset:assets!license_assignments_asset_id_fkey(id, name, asset_tag),
          assigned_by_user:profiles!license_assignments_assigned_by_fkey(id, full_name)
        `);

      if (assignmentsError) throw assignmentsError;

      // Map assignments to licenses
      return (licenses as SoftwareLicense[]).map(license => {
        const licenseAssignments = (assignments || [])
          .filter(a => a.license_id === license.id)
          .map(a => ({
            ...a,
            assigned_user: a.assigned_user,
            asset: a.asset,
            assigned_by_user: a.assigned_by_user,
          })) as LicenseAssignmentWithDetails[];

        return {
          ...license,
          license_key: keyByLicenseId.get(license.id) ?? null,
          assignments: licenseAssignments,
          used_quantity: licenseAssignments.length,
          available_quantity: license.total_quantity - licenseAssignments.length,
        };
      });
    },
  });
}

export function useLicenseById(id: string | null) {
  return useQuery({
    queryKey: ['license', id],
    queryFn: async (): Promise<LicenseWithAssignments | null> => {
      if (!id) return null;

      const { data: license, error: licenseError } = await supabase
        .from('software_licenses')
        .select('*')
        .eq('id', id)
        .single();

      if (licenseError) throw licenseError;

      const { data: keyRow, error: keyError } = await supabase
        .from('software_license_keys')
        .select('license_id, license_key')
        .eq('license_id', id)
        .maybeSingle();

      if (keyError) throw keyError;

      const { data: assignments, error: assignmentsError } = await supabase
        .from('license_assignments')
        .select(`
          *,
          assigned_user:profiles!license_assignments_assigned_to_fkey(id, full_name, email),
          asset:assets!license_assignments_asset_id_fkey(id, name, asset_tag),
          assigned_by_user:profiles!license_assignments_assigned_by_fkey(id, full_name)
        `)
        .eq('license_id', id);

      if (assignmentsError) throw assignmentsError;

      const licenseAssignments = (assignments || []).map(a => ({
        ...a,
        assigned_user: a.assigned_user,
        asset: a.asset,
        assigned_by_user: a.assigned_by_user,
      })) as LicenseAssignmentWithDetails[];

      return {
        ...(license as SoftwareLicense),
        license_key: (keyRow as LicenseKeyRow | null)?.license_key ?? null,
        assignments: licenseAssignments,
        used_quantity: licenseAssignments.length,
        available_quantity: license.total_quantity - licenseAssignments.length,
      };
    },
    enabled: !!id,
  });
}

export function useLicenseMutations() {
  const queryClient = useQueryClient();

  const createLicense = useMutation({
    mutationFn: async (license: Omit<SoftwareLicense, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
      const { license_key, ...licenseRow } = license;
      const { data, error } = await supabase
        .from('software_licenses')
        .insert(licenseRow as any)
        .select()
        .single();

      if (error) throw error;

      if (license_key && String(license_key).trim().length > 0) {
        const tenant_id = await getTenantId();
        const { error: keyUpsertError } = await supabase
          .from('software_license_keys')
          .upsert({
            license_id: (data as any).id,
            tenant_id,
            license_key: String(license_key).trim(),
          } as any);
        if (keyUpsertError) throw keyUpsertError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
    },
  });

  const updateLicense = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SoftwareLicense> & { id: string }) => {
      const { license_key, ...licenseUpdates } = updates as Partial<SoftwareLicense>;
      const { data, error } = await supabase
        .from('software_licenses')
        .update(licenseUpdates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If license_key is provided (including empty string), sync it to secure table
      if (license_key !== undefined) {
        const nextKey = String(license_key ?? '').trim();
        if (nextKey.length === 0) {
          const { error: delErr } = await supabase
            .from('software_license_keys')
            .delete()
            .eq('license_id', id);
          if (delErr) throw delErr;
        } else {
          const tenant_id = await getTenantId();
          const { error: upsertErr } = await supabase
            .from('software_license_keys')
            .upsert({ license_id: id, tenant_id, license_key: nextKey } as any);
          if (upsertErr) throw upsertErr;
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['license', variables.id] });
    },
  });

  const deleteLicense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('software_licenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
    },
  });

  const assignLicense = useMutation({
    mutationFn: async (assignment: Omit<LicenseAssignment, 'id' | 'tenant_id' | 'assigned_at'>) => {
      const { data, error } = await supabase
        .from('license_assignments')
        .insert(assignment as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['license', variables.license_id] });
    },
  });

  const unassignLicense = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('license_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
    },
  });

  return {
    createLicense,
    updateLicense,
    deleteLicense,
    assignLicense,
    unassignLicense,
  };
}
