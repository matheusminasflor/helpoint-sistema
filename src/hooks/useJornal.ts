// O Jornal da empresa (decisão do dono, 2026-10-04; migration 20261204020000). Ler é de todos (só o
// publicado); escrever é da seção Jornal do perfil do Marketing — o banco confere as duas coisas.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { abrirAnexoDoBalde, enviarAnexo, tirarDoBalde } from '@/lib/anexos-no-storage';
import { sanitizeFileName } from '@/lib/utils';
import type { TipoDeNoticia } from '@/lib/jornal';

export interface Noticia {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoDeNoticia;
  data_noticia: string;
  exibir_de: string | null;
  exibir_ate: string | null;
  destaque: boolean;
  status: 'rascunho' | 'publicada' | 'despublicada';
  capa_caminho: string | null;
  publicada_em: string | null;
  autor: { full_name: string | null } | null;
}

export interface AnexoDaNoticia { id: string; nome: string; caminho: string }

const BALDE = 'jornal';

/** O que a pessoa pode fazer no Jornal — a mesma conta do banco (`pode_no_setor('marketing', 'jornal', …)`). */
export function usePodeNoJornal() {
  const { canComoOBanco, isLoading } = useDepartmentPermissions('marketing');
  return {
    isLoading,
    editar: canComoOBanco('jornal', 'edit'),
    publicar: canComoOBanco('jornal', 'publish'),
    excluir: canComoOBanco('jornal', 'delete'),
  };
}

/** Todas as notícias que a pessoa enxerga (a empresa: só as publicadas). */
export function useNoticias() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['jornal', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Noticia[]> =>
      (unwrap(await supabase
        .from('jornal_noticias')
        .select('*, autor:profiles!jornal_noticias_autor_id_fkey(full_name)')
        .order('data_noticia', { ascending: false })
        .order('publicada_em', { ascending: false, nullsFirst: false })) ?? []) as unknown as Noticia[],
  });
}

/** Links de 1 hora para as capas (o balde é privado). */
export function useCapas(caminhos: string[]) {
  const { tenantId } = useAuth();
  const chave = [...caminhos].sort();
  return useQuery({
    queryKey: ['jornal', tenantId, 'capas', chave],
    enabled: !!tenantId && chave.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BALDE).createSignedUrls(chave, 3600);
      if (error) throw error;
      return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? '', d.signedUrl]));
    },
  });
}

export function useAnexosDaNoticia(id: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['jornal', tenantId, 'anexos', id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<AnexoDaNoticia[]> =>
      (unwrap(await supabase.from('jornal_anexos').select('id, nome, caminho').eq('noticia_id', id!).order('created_at')) ?? []) as AnexoDaNoticia[],
  });
}

/** Notícias, capas e anexos moram todos sob `['jornal', …]`: uma invalidação só. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['jornal'] });
}

export interface FormularioDeNoticia {
  titulo: string;
  texto: string;
  tipo: TipoDeNoticia;
  data_noticia: string;
  exibir_de: string | null;
  exibir_ate: string | null;
  destaque: boolean;
}

/**
 * Cria (rascunho) ou altera. A notícia nova nasce com o id gerado aqui, para a capa já ir para a
 * pasta dela (`<empresa>/<notícia>/…`) no mesmo salvar.
 */
export function useSalvarNoticia() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, capa, capaAtual, ...f }: FormularioDeNoticia & { id?: string; capa?: File | null; capaAtual?: string | null }) => {
      const noticiaId = id ?? crypto.randomUUID();
      let capa_caminho = capaAtual ?? null;
      if (capa) {
        capa_caminho = `${tenantId}/${noticiaId}/capa-${crypto.randomUUID()}-${sanitizeFileName(capa.name)}`;
        const { error } = await supabase.storage.from(BALDE).upload(capa_caminho, capa);
        if (error) throw error;
      }
      const campos = {
        titulo: f.titulo.trim(), texto: f.texto, tipo: f.tipo, data_noticia: f.data_noticia,
        exibir_de: f.exibir_de || null, exibir_ate: f.exibir_ate || null, destaque: f.destaque, capa_caminho,
      };
      if (id) {
        expectRows(await supabase.from('jornal_noticias').update(campos).eq('id', id).select('id'), 'salvar a notícia');
      } else {
        expectRows(await supabase.from('jornal_noticias').insert({ id: noticiaId, ...campos }).select('id'), 'criar a notícia');
      }
      if (capa && capaAtual) await tirarDoBalde(BALDE, [capaAtual]);
      return { id: noticiaId, capa_caminho };
    },
    onSuccess: invalidar,
  });
}

export function useMudarStatusDaNoticia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'publicada' | 'despublicada' }) => {
      expectRows(await supabase.from('jornal_noticias').update({ status }).eq('id', id).select('id'),
        status === 'publicada' ? 'publicar a notícia' : 'despublicar a notícia');
    },
    onSuccess: invalidar,
  });
}

export function useApagarNoticia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (noticia: Noticia) => {
      const anexos = (unwrap(await supabase.from('jornal_anexos').select('caminho').eq('noticia_id', noticia.id)) ?? []) as { caminho: string }[];
      expectRows(await supabase.from('jornal_noticias').delete().eq('id', noticia.id).select('id'), 'excluir a notícia');
      await tirarDoBalde(BALDE, [...anexos.map((a) => a.caminho), ...(noticia.capa_caminho ? [noticia.capa_caminho] : [])]);
    },
    onSuccess: invalidar,
  });
}

export function useAnexarNaNoticia() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ noticiaId, arquivo }: { noticiaId: string; arquivo: File }) =>
      enviarAnexo(BALDE, `${tenantId}/${noticiaId}`, arquivo, (caminho) => supabase.from('jornal_anexos')
        .insert({ noticia_id: noticiaId, nome: arquivo.name, caminho, tamanho: arquivo.size, tipo: arquivo.type || null })
        .select('id')),
    onSuccess: invalidar,
  });
}

export function useRemoverAnexoDaNoticia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (anexo: AnexoDaNoticia) => {
      expectRows(await supabase.from('jornal_anexos').delete().eq('id', anexo.id).select('id'), 'remover o anexo');
      await tirarDoBalde(BALDE, [anexo.caminho]);
    },
    onSuccess: invalidar,
  });
}

/** Abre o anexo numa aba nova, por link de 10 minutos. */
export const abrirAnexoDoJornal = (caminho: string) => abrirAnexoDoBalde(BALDE, caminho);
