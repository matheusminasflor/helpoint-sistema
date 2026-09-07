import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { unwrap } from '@/lib/supabase-result';
import {
  normalizePermissions,
  normalizeRestrictions,
  resolvePermission,
  type Department,
  type PermissionsMap,
  type ProfileRestrictions,
} from '@/config/access-profile-schemas';

export interface AccessProfile {
  id: string;
  tenant_id: string;
  department: Department;
  name: string;
  description: string | null;
  is_default: boolean;
  permissions: PermissionsMap;
  restrictions: ProfileRestrictions;
  created_at: string;
  updated_at: string;
}

export interface UserAccessProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  department: Department;
  profile_id: string | null;
  overrides: PermissionsMap;
}

function mapProfile(row: Record<string, unknown>): AccessProfile {
  const department = row.department as Department;
  return {
    ...(row as unknown as AccessProfile),
    permissions: normalizePermissions(department, row.permissions),
    restrictions: normalizeRestrictions(row.restrictions),
  };
}

export function useAccessProfiles(department: Department) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['access-profiles', tenantId, department],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profiles')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('department', department)
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data || []).map(d => mapProfile(d as unknown as Record<string, unknown>));
    },
  });
}

/** Todos os perfis do tenant (todos os departamentos) — usado na tela de usuários. */
export function useAllAccessProfiles() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['access-profiles', tenantId, 'all'],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profiles')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('department')
        .order('name');
      if (error) throw error;
      return (data || []).map(d => mapProfile(d as unknown as Record<string, unknown>));
    },
  });
}

export function useUpsertAccessProfile() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      department: Department;
      name: string;
      description?: string | null;
      is_default?: boolean;
      permissions: PermissionsMap;
      restrictions?: ProfileRestrictions;
    }) => {
      const payload = {
        name: input.name,
        description: input.description ?? null,
        is_default: !!input.is_default,
        permissions: input.permissions as any,
        restrictions: (input.restrictions ?? {}) as any,
      };
      if (input.id) {
        const { error } = await supabase.from('access_profiles').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('access_profiles').insert({
          tenant_id: tenantId!,
          department: input.department,
          ...payload,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      toast.success(vars.id ? 'Perfil atualizado' : 'Perfil criado');
      qc.invalidateQueries({ queryKey: ['access-profiles'] });
      qc.invalidateQueries({ queryKey: ['my-access-profile'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar perfil'),
  });
}

export function useDeleteAccessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('access_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Perfil excluído');
      qc.invalidateQueries({ queryKey: ['access-profiles'] });
      qc.invalidateQueries({ queryKey: ['my-access-profile'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao excluir perfil'),
  });
}

export function useAssignUserAccessProfile() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      department: Department;
      profile_id: string | null;
      overrides?: PermissionsMap;
    }) => {
      const { error } = await supabase
        .from('user_access_profiles')
        .upsert(
          {
            tenant_id: tenantId!,
            user_id: input.user_id,
            department: input.department,
            profile_id: input.profile_id,
            overrides: (input.overrides ?? {}) as any,
            assigned_by: (await supabase.auth.getUser()).data.user?.id,
          } as any,
          { onConflict: 'tenant_id,user_id,department' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Perfil atribuído');
      qc.invalidateQueries({ queryKey: ['user-access-profiles'] });
      qc.invalidateQueries({ queryKey: ['my-access-profile'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atribuir perfil'),
  });
}

export function useRemoveUserAccessProfile() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; department: Department }) => {
      const { error } = await supabase
        .from('user_access_profiles')
        .delete()
        .eq('tenant_id', tenantId!)
        .eq('user_id', input.user_id)
        .eq('department', input.department);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-access-profiles'] });
      qc.invalidateQueries({ queryKey: ['my-access-profile'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover perfil'),
  });
}

export function useUserAccessProfile(userId: string | null, department: Department) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['user-access-profiles', tenantId, userId, department],
    enabled: !!tenantId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_access_profiles')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('user_id', userId!)
        .eq('department', department)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as UserAccessProfile) || null;
    },
  });
}

/** Todas as atribuições do tenant — usado para listar/editar acessos de usuários. */
export function useAllUserAccessProfiles() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['user-access-profiles', tenantId, 'all'],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_access_profiles')
        .select('*')
        .eq('tenant_id', tenantId!);
      if (error) throw error;
      return (data || []) as unknown as UserAccessProfile[];
    },
  });
}

export interface MyAccessProfile {
  profile: AccessProfile | null;
  overrides: PermissionsMap;
  restrictions: ProfileRestrictions;
}

/** Perfil de acesso do usuário logado em um departamento. */
export function useMyAccessProfile(department: Department) {
  const { user, tenantId } = useAuth();
  return useQuery({
    queryKey: ['my-access-profile', tenantId, user?.id, department],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<MyAccessProfile | null> => {
      const assignment = unwrap(await supabase
        .from('user_access_profiles')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('user_id', user!.id)
        .eq('department', department)
        .maybeSingle());

      if (!assignment) return null;

      const a = assignment as unknown as UserAccessProfile;
      let profile: AccessProfile | null = null;
      if (a.profile_id) {
        const data = unwrap(await supabase
          .from('access_profiles')
          .select('*')
          .eq('id', a.profile_id)
          .maybeSingle());
        if (data) profile = mapProfile(data as unknown as Record<string, unknown>);
      }

      return {
        profile,
        overrides: (a.overrides || {}) as PermissionsMap,
        restrictions: profile?.restrictions ?? normalizeRestrictions(null),
      };
    },
  });
}

/**
 * Guard de front-end para permissões granulares de um departamento.
 * Owner / admin / manager sempre passam (RLS continua sendo a fronteira real).
 */
export function useDepartmentPermissions(department: Department) {
  const { role } = useAuth();
  const { data, isLoading } = useMyAccessProfile(department);

  const isAdmin = role === 'owner' || role === 'admin' || role === 'manager';

  const can = useMemo(() => {
    return (moduleKey: string, actionKey: string): boolean => {
      if (isAdmin) return true;
      return resolvePermission(data?.profile?.permissions, data?.overrides, moduleKey, actionKey);
    };
  }, [isAdmin, data]);

  return {
    can,
    isAdmin,
    isLoading,
    /** Tem algum perfil atribuído neste departamento (ex.: é da equipe do módulo). */
    hasProfile: !!data?.profile,
    restrictions: data?.restrictions ?? normalizeRestrictions(null),
  };
}
