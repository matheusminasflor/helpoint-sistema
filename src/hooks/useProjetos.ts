import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Projetos e o quadro (OKR-2). O projeto é fechado: só quem participa enxerga
 * (mais dono e administrador da empresa). As tarefas do quadro são **as mesmas
 * tarefas** do resto do sistema — as que nascem de chamado e de fluxo
 * automatizado incluídas —, só que com `project_id` preenchido.
 */

export type ProjetoRow = Database['public']['Tables']['projects']['Row'];
export type TarefaRow = Database['public']['Tables']['tasks']['Row'];

export type StatusProjeto = 'planned' | 'active' | 'done' | 'cancelled';

export const STATUS_PROJETO: Record<StatusProjeto, string> = {
  planned: 'A começar',
  active: 'Em andamento',
  done: 'Concluído',
  cancelled: 'Cancelado',
};

/** As colunas do quadro são os estados que a tarefa já tinha. */
export const COLUNAS = [
  { status: 'pending', titulo: 'A fazer' },
  { status: 'in_progress', titulo: 'Fazendo' },
  { status: 'completed', titulo: 'Concluída' },
  { status: 'cancelled', titulo: 'Cancelada' },
] as const;

export type StatusTarefa = (typeof COLUNAS)[number]['status'];

export interface Projeto extends ProjetoRow {
  responsavel: string | null;
  objetivo: string | null;
  /** Quantas tarefas do quadro já estão concluídas, e quantas há no total. */
  feitas: number;
  total: number;
}

export interface Participante {
  user_id: string;
  nome: string;
  e_dono: boolean;
}

export function useProjetos() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projetos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Projeto[]> => {
      const linhas = unwrap(
        await supabase.from('projects').select('*').order('created_at', { ascending: false }),
      );
      if (linhas.length === 0) return [];

      // Nomes e objetivos vêm em consultas próprias: as chaves estrangeiras são
      // compostas (pessoa + empresa), e é aí que a junção do PostgREST fica
      // ambígua. O mesmo caminho de `useMetas`.
      const donos = [...new Set(linhas.map(p => p.owner_id).filter((x): x is string => !!x))];
      const metas = [...new Set(linhas.map(p => p.goal_id).filter((x): x is string => !!x))];

      const nomes = new Map<string, string | null>();
      if (donos.length) {
        unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', donos))
          .forEach(p => nomes.set(p.id, p.full_name || p.email));
      }
      const titulos = new Map<string, string>();
      if (metas.length) {
        unwrap(await supabase.from('goals').select('id, title').in('id', metas))
          .forEach(g => titulos.set(g.id, g.title));
      }

      // O andamento é contado das tarefas que a pessoa pode ver — que, num
      // projeto de que ela participa, são todas.
      const tarefas = unwrap(
        await supabase.from('tasks').select('project_id, status')
          .in('project_id', linhas.map(p => p.id)),
      );

      return linhas.map((p): Projeto => {
        const doProjeto = tarefas.filter(t => t.project_id === p.id);
        return {
          ...p,
          responsavel: p.owner_id ? nomes.get(p.owner_id) ?? null : null,
          objetivo: p.goal_id ? titulos.get(p.goal_id) ?? null : null,
          feitas: doProjeto.filter(t => t.status === 'completed').length,
          total: doProjeto.length,
        };
      });
    },
  });
}

export function useProjeto(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<ProjetoRow | null> => {
      const linhas = unwrap(await supabase.from('projects').select('*').eq('id', id!));
      return linhas[0] ?? null;
    },
  });
}

export function useTarefasDoProjeto(projectId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto-tarefas', tenantId, projectId],
    enabled: !!tenantId && !!projectId,
    queryFn: async (): Promise<TarefaRow[]> =>
      unwrap(
        await supabase.from('tasks').select('*')
          .eq('project_id', projectId!)
          .order('position', { ascending: true }),
      ),
  });
}

export function useParticipantes(projectId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto-participantes', tenantId, projectId],
    enabled: !!tenantId && !!projectId,
    queryFn: async (): Promise<Participante[]> => {
      const membros = unwrap(
        await supabase.from('project_members').select('user_id').eq('project_id', projectId!),
      );
      if (membros.length === 0) return [];
      const projeto = unwrap(await supabase.from('projects').select('owner_id').eq('id', projectId!));
      const dono = projeto[0]?.owner_id ?? null;
      const perfis = unwrap(
        await supabase.from('profiles').select('id, full_name, email')
          .in('id', membros.map(m => m.user_id)),
      );
      return perfis.map(p => ({
        user_id: p.id,
        nome: p.full_name || p.email,
        e_dono: p.id === dono,
      })).sort((a, b) => Number(b.e_dono) - Number(a.e_dono) || a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
}

export interface ProjetoInput {
  id?: string;
  name: string;
  description?: string | null;
  status?: StatusProjeto;
  owner_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  goal_id?: string | null;
}

export function useSalvarProjeto() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjetoInput) => {
      const payload = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? 'active',
        owner_id: input.owner_id ?? user!.id,
        start_date: input.start_date || null,
        due_date: input.due_date || null,
        goal_id: input.goal_id || null,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('projects').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'o projeto',
        );
      }
      return expectRows(
        await supabase.from('projects')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user!.id }).select('id'),
        'o projeto',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
      qc.invalidateQueries({ queryKey: ['projeto', tenantId] });
      toast.success('Projeto salvo.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useApagarProjeto() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('projects').delete().eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'o projeto',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
      toast.success('Projeto removido.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useConvidar(projectId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      return expectRows(
        await supabase.from('project_members')
          .insert({ tenant_id: tenantId!, project_id: projectId, user_id: userId }).select('id'),
        'o participante',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-participantes', tenantId, projectId] });
      toast.success('Participante adicionado.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useTirarParticipante(projectId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      expectRows(
        await supabase.from('project_members').delete()
          .eq('project_id', projectId).eq('user_id', userId).select('id'),
        'o participante',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-participantes', tenantId, projectId] });
      qc.invalidateQueries({ queryKey: ['projeto-tarefas', tenantId, projectId] });
      toast.success('Participante removido do projeto.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export interface TarefaInput {
  id?: string;
  project_id: string;
  title: string;
  description?: string | null;
  status?: StatusTarefa;
  user_id?: string | null;
  due_date?: string | null;
  priority?: number | null;
}

export function useSalvarTarefa(projectId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TarefaInput) => {
      const payload = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? 'pending',
        user_id: input.user_id || null,
        due_date: input.due_date || null,
        priority: input.priority ?? 3,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('tasks').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'a tarefa',
        );
      }
      return expectRows(
        await supabase.from('tasks')
          .insert({ ...payload, tenant_id: tenantId!, project_id: input.project_id, position: Date.now() })
          .select('id'),
        'a tarefa',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-tarefas', tenantId, projectId] });
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/**
 * Arrastar um cartão de coluna é mudar o estado da tarefa. `completed_at` anda
 * junto porque é dele que os relatórios de produtividade já vivem — deixá-lo
 * para trás faria a tarefa concluída no quadro não contar em lugar nenhum.
 */
export function useMoverTarefa(projectId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, position }: { id: string; status: StatusTarefa; position: number }) => {
      expectRows(
        await supabase.from('tasks')
          .update({
            status,
            position,
            completed_at: status === 'completed' ? new Date().toISOString() : null,
          })
          .eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'a tarefa',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-tarefas', tenantId, projectId] });
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useApagarTarefa(projectId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('tasks').delete().eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'a tarefa',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-tarefas', tenantId, projectId] });
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
      toast.success('Tarefa removida.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** O erro do banco em português de quem usa o sistema. */
function traduzir(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('project_members_uma_vez')) return 'Essa pessoa já participa do projeto.';
  if (msg.includes('projects_prazo_check')) return 'O projeto não pode terminar antes de começar.';
  if (msg.includes('tasks_pessoal_tem_dono_check')) return 'Tarefa fora de projeto precisa de um responsável.';
  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Você não participa deste projeto — peça a quem responde por ele para te incluir.';
  }
  return msg;
}
