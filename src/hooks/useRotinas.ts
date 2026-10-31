// Rotinas do dia (dono, 2026-10-30; migration 20270212120000). A lista de hoje sai do banco (`rotinas_de_hoje`), que
// já tira férias, feriado e fim de semana; marcar e pular passam por função, que confere se a rotina é da minha lista.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { sanitizeFileName } from '@/lib/utils';
import type { LinhaDaEquipe, Pede, Periodo, Repeticao } from '@/lib/rotinas';

const BALDE = 'rotinas';

export interface RotinaDeHoje {
  rotina_id: string;
  pessoa_id: string;
  /** Preenchido só quando a rotina é de outra pessoa (estou substituindo nas férias dela). */
  pessoa_nome: string | null;
  titulo: string;
  como_fazer: string | null;
  periodo: Periodo;
  pede: Pede;
  situacao: 'feita' | 'pulada' | null;
  motivo: string | null;
  observacao: string | null;
  anexo_path: string | null;
  feita_em: string | null;
  feita_por_nome: string | null;
}

export interface Rotina {
  id: string;
  setor: string;
  titulo: string;
  como_fazer: string | null;
  periodo: Periodo;
  repeticao: Repeticao;
  dias_da_semana: number[] | null;
  dia_do_mes: number | null;
  pede: Pede;
  passa_ao_substituto: boolean;
  pessoas: string[];
  criada_por: string;
  ativa: boolean;
}

export type RotinaNova = Omit<Rotina, 'id' | 'criada_por' | 'ativa'>;

export function useRotinasDeHoje() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['rotinas-hoje', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => ((unwrap(await supabase.rpc('rotinas_de_hoje' as never)) ?? []) as unknown as RotinaDeHoje[]),
  });
}

/** O almoço da pessoa e o fim do expediente do setor dela: é o que divide manhã, tarde e fim do dia. */
export function useMeusHorarios() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['rotina-horarios', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => ((unwrap(await supabase.rpc('rotina_meus_horarios' as never)) ?? []) as unknown as
      { inicio_almoco: string | null; fim_almoco: string | null; fim_expediente: string | null }[])[0] ?? null,
  });
}

function useInvalidarHoje() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['rotinas-hoje', tenantId, user?.id] });
}

export function useMarcarRotina() {
  const { tenantId, user } = useAuth();
  const invalidar = useInvalidarHoje();
  return useMutation({
    mutationFn: async (v: { rotina: RotinaDeHoje; situacao: 'feita' | 'pulada'; motivo?: string; observacao?: string; arquivo?: File }) => {
      let caminho: string | null = null;
      if (v.arquivo) {
        // A pasta é de quem marca (<empresa>/<eu>/…): a policy do balde só deixa gravar lá.
        caminho = `${tenantId}/${user!.id}/${crypto.randomUUID()}-${sanitizeFileName(v.arquivo.name)}`;
        const { error } = await supabase.storage.from(BALDE).upload(caminho, v.arquivo, { upsert: false });
        if (error) throw error;
      }
      const { error } = await supabase.rpc('rotina_marcar' as never, {
        p_rotina: v.rotina.rotina_id, p_pessoa: v.rotina.pessoa_id, p_situacao: v.situacao,
        p_motivo: v.motivo ?? null, p_observacao: v.observacao ?? null, p_anexo: caminho,
      } as never);
      if (error) {
        if (caminho) await supabase.storage.from(BALDE).remove([caminho]);
        throw error;
      }
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não marcou: ${e.message}`),
  });
}

export function useDesmarcarRotina() {
  const invalidar = useInvalidarHoje();
  return useMutation({
    mutationFn: async (r: RotinaDeHoje) => {
      unwrap(await supabase.rpc('rotina_desmarcar' as never, { p_rotina: r.rotina_id, p_pessoa: r.pessoa_id } as never));
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não desmarcou: ${e.message}`),
  });
}

/** As rotinas que eu vejo para cadastrar: as minhas, as que criei e, sendo gestor, as do setor. */
export function useRotinasCadastradas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['rotinas', tenantId],
    enabled: !!tenantId,
    queryFn: async () => ((unwrap(await supabase.from('rotinas' as never).select('*').eq('ativa', true)
      .order('titulo')) ?? []) as unknown as Rotina[]),
  });
}

/** Os setores em que trabalho (rotina só minha) e em quais sou gestor (rotina para a equipe). */
export function useSetoresDaRotina() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['rotina-setores', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => ((unwrap(await supabase.rpc('rotina_setores' as never)) ?? []) as unknown as { setor: string; gerencio: boolean }[]),
  });
}

function useInvalidarCadastro() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const invalidarHoje = useInvalidarHoje();
  return () => { qc.invalidateQueries({ queryKey: ['rotinas', tenantId] }); invalidarHoje(); };
}

export function useSalvarRotina() {
  const invalidar = useInvalidarCadastro();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: RotinaNova }) => {
      const consulta = id
        ? supabase.from('rotinas' as never).update(dados as never).eq('id', id).select('id')
        : supabase.from('rotinas' as never).insert(dados as never).select('id');
      expectRows(await consulta, 'a rotina');
    },
    onSuccess: (_d, v) => { invalidar(); toast.success(v.id ? 'Rotina salva.' : 'Rotina criada. Ela aparece no Início nos dias em que vale.'); },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });
}

/** "Excluir" tira a rotina do dia a dia; o que já foi marcado continua no histórico. */
export function useExcluirRotina() {
  const invalidar = useInvalidarCadastro();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('rotinas' as never).update({ ativa: false } as never).eq('id', id).select('id'), 'a rotina');
    },
    onSuccess: () => { invalidar(); toast.success('Rotina excluída. O que já foi marcado fica no histórico.'); },
    onError: (e: Error) => toast.error(`Não excluiu: ${e.message}`),
  });
}

// ─── Etapa 2: o gestor vê a equipe (migration 20270212130000) ────────────────────────────────

/** Os setores cujas rotinas da equipe eu vejo (caixinha "Ver as rotinas da equipe"). */
export function useSetoresQueVejo() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['rotina-setores-que-vejo', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => ((unwrap(await supabase.rpc('rotina_setores_que_vejo' as never)) ?? []) as unknown as string[]),
  });
}

/** Cada rotina de cada pessoa em cada dia útil do período, com a situação (o banco calcula). */
export function useRotinasDaEquipe(de: string, ate: string, ligado = true) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['rotinas-equipe', tenantId, user?.id, de, ate],
    enabled: !!tenantId && !!user?.id && ligado,
    queryFn: async () => ((unwrap(await supabase.rpc('rotinas_da_equipe' as never, { p_de: de, p_ate: ate } as never)) ?? []) as unknown as LinhaDaEquipe[]),
  });
}
