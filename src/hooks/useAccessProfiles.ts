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
  TICKET_ACTIONS,
  type Department,
  type PermissionsMap,
  type ProfileRestrictions,
} from '@/config/access-profile-schemas';
import { podeComoOBanco, setorDoModulo } from '@/lib/permissoes';
import { ABAS_DE_CONFIGURACAO, chaveDaAba } from '@/config/abas-de-configuracao';

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

/**
 * O que a pessoa logada pode fazer num chamado deste módulo — a MESMA conta do banco
 * (`pode_no_chamado`, guarda `chamado_guarda_o_perfil`): dono/admin tudo; o resto pela seção
 * "Chamados" do perfil no setor do chamado. `atende` = alguma ação além de ver (mostra a barra).
 *
 * Até 2026-10-01 as telas do chamado perguntavam só "tem perfil da TI?" e nenhuma caixinha de
 * chamado era lida. Compras fica de fora (decisão do dono): lá vale ter o perfil de Compras, como
 * antes, e a solicitação tem as ações próprias (Aprovar/Executar).
 */
export function usePodeNoChamado(modulo: string | null | undefined) {
  const { role } = useAuth();
  const setor = setorDoModulo(modulo ?? 'tickets') ?? 'ti';
  const { canComoOBanco, hasProfile } = useDepartmentPermissions(setor);
  const ehCompras = modulo === 'compras';
  const pode = (acao: string): boolean =>
    ehCompras ? hasProfile || ['manager', 'admin', 'owner'].includes(role) : canComoOBanco('tickets', acao);
  const atende = TICKET_ACTIONS.some((a) => a.key !== 'view_all' && pode(a.key));
  return { pode, atende };
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
 * O que a pessoa logada CONFIGURA, aba por aba (LEVA P, parte 7 — "Jeito 1" do dono). Cada aba da
 * configuração de um setor é a chave `config_<aba>` no perfil daquele setor:
 *   * `abreAba(setor, aba)` — "Abrir" ou "Alterar" marcado: a aba aparece;
 *   * `alteraAba(setor, aba)` — "Alterar" marcado: a mesma pergunta de `pode_alterar_aba` no banco;
 *   * `abre(setor)` — alguma aba do setor abre: o cartão fica ativo em Configurações › Setores.
 * Dono e admin passam em tudo.
 *
 * Uma consulta só, e não `useDepartmentPermissions` oito vezes: a tela dos setores pergunta pelos
 * oito ao mesmo tempo, e o menu pergunta "algum?".
 */
export function useConfiguracaoDosSetores() {
  const { user, tenantId, role } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['minhas-configuracoes-de-setor', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => {
      const linhas = unwrap(await supabase
        .from('user_access_profiles')
        .select('department, overrides, profile:access_profiles(permissions)')
        .eq('tenant_id', tenantId!)
        .eq('user_id', user!.id)) as unknown as Array<{
          department: Department;
          overrides: PermissionsMap | null;
          profile: { permissions: PermissionsMap | null } | null;
        }>;
      return new Map(linhas.map((l) => [l.department, l]));
    },
  });

  return useMemo(() => {
    /** Qualquer permissão de perfil, pela mesma conta de `tem_permissao` (dono/admin passam). */
    const pode = (setor: Department | null, modulo: string, acao: string) => {
      if (role === 'owner' || role === 'admin') return true;
      if (!setor) return false;
      const minha = data?.get(setor);
      return podeComoOBanco(role, minha?.profile?.permissions, minha?.overrides, modulo, acao);
    };
    const alteraAba = (setor: Department | null, aba: string) => pode(setor, chaveDaAba(aba), 'edit');
    // Quem altera também abre: marcar só "Alterar" não pode deixar a aba escondida.
    const abreAba = (setor: Department | null, aba: string) => pode(setor, chaveDaAba(aba), 'view') || alteraAba(setor, aba);
    return {
      isLoading,
      isError,
      pode,
      abreAba,
      alteraAba,
      abre: (setor: Department | null) => !!setor && ABAS_DE_CONFIGURACAO[setor].some((a) => abreAba(setor, a.aba)),
    };
  }, [data, isLoading, isError, role]);
}

/**
 * "Pode montar as carteiras do Comercial?" — o espelho de `public.com_pode_gerir_carteiras`, que
 * várias funções e policies do banco perguntam. Desde a LEVA P, parte 7, quem altera a aba
 * "Equipe e carteiras" também pode (o banco passou a incluir `pode_alterar_aba('comercial',
 * 'equipe')`); a tela pergunta o mesmo, num lugar só, para as seis telas não divergirem.
 */
export function usePodeGerirCarteiras() {
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const { alteraAba } = useConfiguracaoDosSetores();
  return canComoOBanco('carteiras', 'gerir') || alteraAba('comercial', 'equipe');
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

  /**
   * A MESMA conta que a RLS faz (achado 2b da auditoria do Painel Comercial):
   * `manager` NÃO passa direto aqui — só owner/admin, como
   * `is_admin_or_higher` no banco. `can` acima fica intacto de propósito:
   * ele é cosmético nos módulos sem policy de perfil (RH, Financeiro,
   * Qualidade, Marketing), e estreitá-lo esconderia botão de gestor onde
   * o banco nunca recusou.
   */
  const canComoOBanco = useMemo(() => {
    return (moduleKey: string, actionKey: string): boolean =>
      podeComoOBanco(role, data?.profile?.permissions, data?.overrides, moduleKey, actionKey);
  }, [role, data]);

  return {
    can,
    canComoOBanco,
    isAdmin,
    isLoading,
    /** Tem algum perfil atribuído neste departamento (ex.: é da equipe do módulo). */
    hasProfile: !!data?.profile,
    restrictions: data?.restrictions ?? normalizeRestrictions(null),
  };
}
