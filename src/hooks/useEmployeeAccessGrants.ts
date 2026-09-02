import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AccessType = 'sistema' | 'email' | 'pasta' | 'equipamento' | 'outro';

export interface EmployeeAccessGrant {
  id: string;
  tenant_id: string;
  employee_id: string | null;
  employee_name: string;
  ticket_id: string | null;
  access_type: AccessType;
  name: string;
  details: Record<string, any>;
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_ticket_id: string | null;
}

export interface NewAccessGrant {
  access_type: AccessType;
  name: string;
  note?: string;
}

const TABLE = 'employee_access_grants' as 'profiles';

export function useEmployeeAccessGrants(opts: { employeeId?: string | null; revokeTicketId?: string | null }) {
  return useQuery({
    queryKey: ['employee-access-grants', opts.employeeId, opts.revokeTicketId],
    enabled: !!(opts.employeeId || opts.revokeTicketId),
    queryFn: async () => {
      let q = (supabase.from(TABLE) as any).select('*').order('access_type').order('name');
      if (opts.revokeTicketId) q = q.eq('revoke_ticket_id', opts.revokeTicketId);
      else if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as EmployeeAccessGrant[];
    },
  });
}

export function useBatchCreateAccessGrants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: {
      employeeId: string;
      employeeName: string;
      ticketId?: string | null;
      grants: NewAccessGrant[];
    }) => {
      if (!params.grants.length) return [];
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single();
      const rows = params.grants.map(g => ({
        tenant_id: profile!.tenant_id,
        employee_id: params.employeeId,
        employee_name: params.employeeName,
        ticket_id: params.ticketId || null,
        access_type: g.access_type,
        name: g.name,
        details: g.note ? { note: g.note } : {},
        granted_by: user?.id,
      }));
      const { error } = await (supabase.from(TABLE) as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-access-grants'] }),
    onError: (e: Error) => toast({ title: 'Erro ao salvar acessos', description: e.message, variant: 'destructive' }),
  });
}

export function useToggleRevokeGrant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, revoke }: { id: string; revoke: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const patch = revoke
        ? { revoked_at: new Date().toISOString(), revoked_by: user?.id }
        : { revoked_at: null, revoked_by: null };
      const { error } = await (supabase.from(TABLE) as any).update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-access-grants'] }),
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export const ACCESS_TYPE_LABEL: Record<AccessType, string> = {
  sistema: 'Sistema',
  email: 'E-mail',
  pasta: 'Pasta / Drive',
  equipamento: 'Equipamento',
  outro: 'Outro',
};
