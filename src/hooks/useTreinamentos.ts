import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Educacional — treinamentos, turmas e participantes (L3b).
 *
 * Quatro decisões do dono moldam isto: o aluno externo é o **cliente do SAC**
 * (não um cadastro novo); treinamento tem **turma com data e local**; nesta leva
 * **só a equipe lança** (o portal do cliente fica para depois); e concluir
 * **registra**, sem certificado em PDF.
 */

export type Treinamento = Database['public']['Tables']['trainings']['Row'];
export type Turma = Database['public']['Tables']['training_sessions']['Row'];
export type Participante = Database['public']['Tables']['training_enrollments']['Row'];

/** Para quem o treinamento é. O banco aceita estes três e mais nenhum. */
export const PUBLICOS = [
  { valor: 'interno', rotulo: 'Funcionários' },
  { valor: 'externo', rotulo: 'Clientes' },
  { valor: 'ambos', rotulo: 'Funcionários e clientes' },
] as const;

export const SITUACOES_TURMA = [
  { valor: 'agendada', rotulo: 'Agendada' },
  { valor: 'realizada', rotulo: 'Realizada' },
  { valor: 'cancelada', rotulo: 'Cancelada' },
] as const;

/**
 * O que acontece com um participante. A ordem é a da vida: inscreveu, apareceu,
 * concluiu — com as duas saídas.
 */
export const SITUACOES_PARTICIPANTE = [
  { valor: 'inscrito', rotulo: 'Inscrito' },
  { valor: 'presente', rotulo: 'Presente' },
  { valor: 'concluido', rotulo: 'Concluiu' },
  { valor: 'faltou', rotulo: 'Faltou' },
  { valor: 'cancelado', rotulo: 'Cancelou' },
] as const;

export function useTreinamentos(incluirInativos = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['treinamentos', tenantId, incluirInativos],
    enabled: !!tenantId,
    queryFn: async (): Promise<Treinamento[]> => {
      let q = supabase.from('trainings').select('*').order('title');
      if (!incluirInativos) q = q.eq('is_active', true);
      return unwrap(await q);
    },
  });
}

export interface TreinamentoInput {
  id?: string;
  title: string;
  description?: string | null;
  audience: string;
  hours?: number | null;
  is_active?: boolean;
}

export function useSalvarTreinamento() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TreinamentoInput) => {
      const payload = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        audience: input.audience,
        hours: input.hours ?? null,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('trainings').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'o treinamento',
        );
      }
      return expectRows(
        await supabase.from('trainings')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'o treinamento',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treinamentos', tenantId] });
      toast.success('Treinamento salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** As turmas de um treinamento, ou as da empresa inteira quando não se diz qual. */
export function useTurmas(treinamentoId?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['treinamento-turmas', tenantId, treinamentoId ?? 'todas'],
    enabled: !!tenantId,
    queryFn: async (): Promise<Turma[]> => {
      let q = supabase.from('training_sessions').select('*')
        .order('starts_at', { ascending: false });
      if (treinamentoId) q = q.eq('training_id', treinamentoId);
      return unwrap(await q);
    },
  });
}

export interface TurmaInput {
  id?: string;
  training_id: string;
  starts_at: string;
  ends_at?: string | null;
  modality: string;
  location?: string | null;
  capacity?: number | null;
  instructor_id?: string | null;
  status?: string;
  notes?: string | null;
}

export function useSalvarTurma() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TurmaInput) => {
      const payload = {
        training_id: input.training_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at || null,
        modality: input.modality,
        location: input.location?.trim() || null,
        capacity: input.capacity ?? null,
        instructor_id: input.instructor_id || null,
        status: input.status ?? 'agendada',
        notes: input.notes?.trim() || null,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('training_sessions').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'a turma',
        );
      }
      return expectRows(
        await supabase.from('training_sessions')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'a turma',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treinamento-turmas', tenantId] });
      toast.success('Turma salva.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useParticipantes(turmaId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['treinamento-participantes', tenantId, turmaId],
    enabled: !!tenantId && !!turmaId,
    queryFn: async (): Promise<Participante[]> =>
      unwrap(
        await supabase.from('training_enrollments').select('*')
          .eq('session_id', turmaId!).order('created_at'),
      ),
  });
}

/**
 * Inscrever passa pela função do banco, e não por um `insert` daqui.
 *
 * Uma pessoa tem **uma linha por turma**, e cancelar é um estado dela — é isso
 * que preserva o histórico de quem entrou e saiu. A consequência é que inscrever
 * de novo quem já esteve na turma bate no índice único; a função resolve isso
 * (quem cancelou volta, quem já concluiu fica como está) e o `insert` daqui
 * mostraria um "duplicate key" do Postgres na cara de quem só queria clicar.
 */
export function useInscrever(turmaId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quem: { profile_id?: string; customer_profile_id?: string }) =>
      unwrap(await supabase.rpc('training_inscrever', {
        p_session: turmaId,
        p_profile: quem.profile_id ?? undefined,
        p_customer: quem.customer_profile_id ?? undefined,
      })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treinamento-participantes', tenantId, turmaId] });
      toast.success('Inscrito na turma.');
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 10000 }),
  });
}

export function useSituacaoParticipante(turmaId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      expectRows(
        await supabase.from('training_enrollments').update({ status })
          .eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'o participante',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treinamento-participantes', tenantId, turmaId] });
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 10000 }),
  });
}

/**
 * Quantas vagas a turma ainda tem. `null` = turma sem limite.
 *
 * Quem decide de verdade é o banco, com trava na turma — dois cliques ao mesmo
 * tempo veriam o mesmo número aqui e os dois passariam. Isto serve para mostrar
 * e para desabilitar o botão, não para garantir.
 */
export function vagasRestantes(turma: Turma, participantes: Participante[]): number | null {
  if (turma.capacity == null) return null;
  const ocupadas = participantes.filter(p => p.status !== 'cancelado').length;
  return Math.max(0, turma.capacity - ocupadas);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
