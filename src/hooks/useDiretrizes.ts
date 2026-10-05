// As diretrizes de cada setor (decisão do dono, 2026-10-04; migration 20261204010000).
// Quem lê o quê, quem publica e quem apaga é o banco que decide; aqui só se pede e se confere que
// gravou (regras 1 e 2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { abrirAnexoDoBalde, enviarAnexo, tirarDoBalde } from '@/lib/anexos-no-storage';
import type { StatusDaDiretriz, VisibilidadeDaDiretriz } from '@/config/diretrizes';

export interface Diretriz {
  id: string;
  setor: string;
  titulo: string;
  conteudo: string;
  responsavel_id: string | null;
  responsavel: { full_name: string | null } | null;
  status: StatusDaDiretriz;
  exige_ciencia: boolean;
  visibilidade: VisibilidadeDaDiretriz;
  setores_visiveis: string[];
  versao_atual: number;
  publicada_em: string | null;
  updated_at: string;
}

export interface VersaoDaDiretriz {
  id: string;
  numero: number;
  titulo: string;
  conteudo: string;
  resumo: string | null;
  publicada_em: string;
  autor: { full_name: string | null } | null;
}

export interface AnexoDaDiretriz { id: string; nome: string; caminho: string; tamanho: number | null }
export interface CienciaDaDiretriz { id: string; versao: number; user_id: string; ciente_em: string; pessoa: { full_name: string | null } | null }

const BALDE = 'diretrizes';

/** As diretrizes que a pessoa enxerga — de um setor, ou de todos (Início e Diretoria). */
export function useDiretrizes(setor?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretrizes', tenantId, setor ?? 'todas'],
    enabled: !!tenantId,
    queryFn: async (): Promise<Diretriz[]> => {
      let q = supabase
        .from('diretrizes')
        .select('*, responsavel:profiles!diretrizes_responsavel_id_fkey(full_name)')
        .order('titulo');
      if (setor) q = q.eq('setor', setor);
      return (unwrap(await q) ?? []) as unknown as Diretriz[];
    },
  });
}

/** Versões, anexos e ciências de uma diretriz. */
export function useDetalheDaDiretriz(id: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretriz-detalhe', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async () => {
      const [versoes, anexos, ciencias] = await Promise.all([
        supabase.from('diretrizes_versoes')
          .select('id, numero, titulo, conteudo, resumo, publicada_em, autor:profiles!diretrizes_versoes_publicada_por_fkey(full_name)')
          .eq('diretriz_id', id!).order('numero', { ascending: false }),
        supabase.from('diretrizes_anexos').select('id, nome, caminho, tamanho').eq('diretriz_id', id!).order('created_at'),
        supabase.from('diretrizes_ciencias')
          .select('id, versao, user_id, ciente_em, pessoa:profiles!diretrizes_ciencias_user_id_fkey(full_name)')
          .eq('diretriz_id', id!).order('ciente_em', { ascending: false }),
      ]);
      return {
        versoes: (unwrap(versoes) ?? []) as unknown as VersaoDaDiretriz[],
        anexos: (unwrap(anexos) ?? []) as AnexoDaDiretriz[],
        ciencias: (unwrap(ciencias) ?? []) as unknown as CienciaDaDiretriz[],
      };
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['diretrizes'] });
    void qc.invalidateQueries({ queryKey: ['diretriz-detalhe'] });
  };
}

export interface FormularioDeDiretriz {
  setor: string;
  titulo: string;
  conteudo: string;
  responsavel_id: string | null;
  exige_ciencia: boolean;
  visibilidade: VisibilidadeDaDiretriz;
  setores_visiveis: string[];
}

/** Cria (rascunho) ou altera a cópia de trabalho. Devolve o id. */
export function useSalvarDiretriz() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, ...f }: FormularioDeDiretriz & { id?: string }) => {
      const campos = {
        titulo: f.titulo.trim(),
        conteudo: f.conteudo,
        responsavel_id: f.responsavel_id,
        exige_ciencia: f.exige_ciencia,
        visibilidade: f.visibilidade,
        setores_visiveis: f.visibilidade === 'setores' ? f.setores_visiveis : [],
      };
      const linhas = id
        ? expectRows(await supabase.from('diretrizes').update(campos).eq('id', id).select('id'), 'salvar a diretriz')
        : expectRows(await supabase.from('diretrizes').insert({ ...campos, setor: f.setor }).select('id'), 'criar a diretriz');
      return linhas[0].id as string;
    },
    onSuccess: invalidar,
  });
}

export function usePublicarDiretriz() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, resumo }: { id: string; resumo?: string }) =>
      unwrap(await supabase.rpc('diretriz_publicar', { p_diretriz: id, p_resumo: resumo || undefined })),
    onSuccess: invalidar,
  });
}

export function useArquivarDiretriz() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => { unwrap(await supabase.rpc('diretriz_arquivar', { p_diretriz: id })); },
    onSuccess: invalidar,
  });
}

export function useApagarDiretriz() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('diretrizes').delete().eq('id', id).select('id'), 'apagar o rascunho');
    },
    onSuccess: invalidar,
  });
}

/** Sobe o arquivo para `<empresa>/<diretriz>/…` e registra o anexo; se o registro falhar, o arquivo sai. */
export function useAnexarNaDiretriz() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ diretrizId, arquivo }: { diretrizId: string; arquivo: File }) =>
      enviarAnexo(BALDE, `${tenantId}/${diretrizId}`, arquivo, (caminho) => supabase.from('diretrizes_anexos')
        .insert({ diretriz_id: diretrizId, nome: arquivo.name, caminho, tamanho: arquivo.size, tipo: arquivo.type || null })
        .select('id')),
    onSuccess: invalidar,
  });
}

export function useRemoverAnexoDaDiretriz() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (anexo: AnexoDaDiretriz) => {
      expectRows(await supabase.from('diretrizes_anexos').delete().eq('id', anexo.id).select('id'), 'remover o anexo');
      await tirarDoBalde(BALDE, [anexo.caminho]);
    },
    onSuccess: invalidar,
  });
}

/** Abre o anexo numa aba nova, por link de 10 minutos (o balde é privado). */
export const abrirAnexo = (caminho: string) => abrirAnexoDoBalde(BALDE, caminho);

export function useDarCiencia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ diretrizId, versao }: { diretrizId: string; versao: number }) => {
      expectRows(await supabase.from('diretrizes_ciencias').insert({ diretriz_id: diretrizId, versao }).select('id'), 'registrar a ciência');
    },
    onSuccess: invalidar,
  });
}
