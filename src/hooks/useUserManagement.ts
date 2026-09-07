import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';


export type AppRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  is_active: boolean | null;
  created_at: string;
  role: AppRole | null;
}

export function useUsers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['users-management', tenantId],
    queryFn: async (): Promise<UserWithRole[]> => {
      // Get profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Map roles to users
      const roleMap: Record<string, AppRole> = {};
      roles?.forEach(r => {
      // Keep highest role for each user
        const currentRole = roleMap[r.user_id];
        const roleHierarchy: AppRole[] = ['owner', 'admin', 'manager', 'member', 'viewer'];
        if (!currentRole || roleHierarchy.indexOf(r.role as AppRole) < roleHierarchy.indexOf(currentRole)) {
          roleMap[r.user_id] = r.role as AppRole;
        }
      });

      return profiles?.map(p => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        department: p.department,
        job_title: p.job_title,
        is_active: p.is_active,
        created_at: p.created_at,
        role: roleMap[p.id] || null,
      })) || [];
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      // Delete existing role
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
      toast.success('Perfil atualizado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    },
  });
}

export function useToggleUserActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
      toast.success(isActive ? 'Usuário ativado' : 'Usuário desativado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    },
  });
}

export interface ProfileHistoryEntry {
  id: string;
  user_id: string;
  archived_at: string;
  archived_by: string | null;
  reason: string | null;
  snapshot: any;
  restored_at: string | null;
  restored_by: string | null;
}

export function useUserHistory(userId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['profile-history', userId, tenantId],
    queryFn: async (): Promise<ProfileHistoryEntry[]> => {
      if (!userId || !tenantId) return [];
      const { data, error } = await supabase
        .from('profile_history' as any)
        .select('*')
        .eq('user_id', userId)
        .order('archived_at', { ascending: false });
      if (error) {
        console.error('Error fetching profile history:', error);
        return [];
      }
      return (data || []) as unknown as ProfileHistoryEntry[];
    },
    enabled: !!userId && !!tenantId,
  });
}

export function useArchiveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const { error } = await supabase.rpc('archive_profile' as any, {
        _user_id: userId,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
      queryClient.invalidateQueries({ queryKey: ['profile-history'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-modules'] });
      toast.success('Usuário desativado e acessos revogados');
    },
    onError: (e: any) => toast.error('Erro ao desativar: ' + (e?.message ?? e)),
  });
}

export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc('restore_profile' as any, { _user_id: userId });
      if (error) throw error;
      return data as { restored: string[]; skipped: string[]; history_id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
      queryClient.invalidateQueries({ queryKey: ['profile-history'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-modules'] });
      queryClient.invalidateQueries({ queryKey: ['user-modules'] });
      const skipped = (data as any)?.skipped ?? [];
      if (skipped.length) {
        toast.success(`Usuário reativado. Módulos fora do plano ignorados: ${skipped.join(', ')}`);
      } else {
        toast.success('Usuário reativado e acessos restaurados');
      }
    },
    onError: (e: any) => toast.error('Erro ao reativar: ' + (e?.message ?? e)),
  });
}


export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      data 
    }: { 
      userId: string; 
      data: { full_name?: string; department?: string; job_title?: string } 
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
      toast.success('Usuário atualizado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    },
  });
}

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Dono da Conta',
  admin: 'Administrador',
  manager: 'Supervisor',
  member: 'Operador',
  viewer: 'Leitor',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner: 'Proprietário único. Controle total sobre cobrança, plano e encerramento da conta.',
  admin: 'Acesso total ao sistema. Pode gerenciar todos os usuários e configurações.',
  manager: 'Gerencia equipes e tem acesso amplo aos módulos atribuídos. Pode configurar categorias.',
  member: 'Executa tarefas operacionais nos módulos liberados. Pode criar e editar registros.',
  viewer: 'Apenas visualização. Não pode criar, editar ou excluir nenhum registro.',
};

export const ROLE_CAPABILITIES: Record<AppRole, { allowed: string[]; denied: string[] }> = {
  owner: {
    allowed: [
      'Controle total sobre cobrança e plano',
      'Gerenciar todos os usuários',
      'Acessar todas as configurações',
      'Encerrar ou transferir a conta',
    ],
    denied: [],
  },
  admin: {
    allowed: [
      'Gerenciar todos os usuários',
      'Acessar todos os módulos do plano',
      'Configurar SLAs e alertas',
      'Visualizar relatórios completos',
    ],
    denied: [
      'Alterar cobrança ou encerrar conta',
    ],
  },
  manager: {
    allowed: [
      'Gerenciar equipe dos módulos atribuídos',
      'Atribuir e redistribuir chamados',
      'Configurar categorias e prioridades',
      'Aprovar documentação',
    ],
    denied: [
      'Gerenciar usuários de outros módulos',
      'Alterar configurações globais',
    ],
  },
  member: {
    allowed: [
      'Criar e editar registros',
      'Responder e resolver chamados',
      'Visualizar inventário e contratos',
    ],
    denied: [
      'Excluir registros',
      'Alterar configurações',
      'Gerenciar outros usuários',
    ],
  },
  viewer: {
    allowed: [
      'Visualizar todos os dados',
      'Acompanhar status de chamados',
      'Consultar base de conhecimento',
    ],
    denied: [
      'Criar, editar ou excluir qualquer registro',
    ],
  },
};
