// O Jornal da empresa (decisão do dono, 2026-10-04; migration 20261204020000). Ler é de todos (só o
// publicado); escrever é da seção Jornal do perfil do Marketing — o banco confere as duas coisas.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';
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

/** O que a pessoa pode fazer no Jornal — a mesma conta de `pode_no_jornal` no banco. */
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
    queryKey: ['jornal-capas', tenantId, chave],
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
    queryKey: ['jornal-anexos', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<AnexoDaNoticia[]> =>
      (unwrap(await supabase.from('jornal_anexos').select('id, nome, caminho').eq('noticia_id', id!).order('created_at')) ?? []) as AnexoDaNoticia[],
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['jornal'] });
    void qc.invalidateQueries({ queryKey: ['jornal-anexos'] });
    void qc.invalidateQueries({ queryKey: ['jornal-capas'] });
  };
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

const limpar = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

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
        capa_caminho = `${tenantId}/${noticiaId}/capa-${crypto.randomUUID()}-${limpar(capa.name)}`;
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
      if (capa && capaAtual) await supabase.storage.from(BALDE).remove([capaAtual]);
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
      const arquivos = [...anexos.map((a) => a.caminho), ...(noticia.capa_caminho ? [noticia.capa_caminho] : [])];
      if (arquivos.length) {
        const { error } = await supabase.storage.from(BALDE).remove(arquivos);
        if (error) console.error(error);
      }
    },
    onSuccess: invalidar,
  });
}

export function useAnexarNaNoticia() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ noticiaId, arquivo }: { noticiaId: string; arquivo: File }) => {
      const caminho = `${tenantId}/${noticiaId}/${crypto.randomUUID()}-${limpar(arquivo.name)}`;
      const { error: erroUpload } = await supabase.storage.from(BALDE).upload(caminho, arquivo);
      if (erroUpload) throw erroUpload;
      const { data, error } = await supabase.from('jornal_anexos')
        .insert({ noticia_id: noticiaId, nome: arquivo.name, caminho, tamanho: arquivo.size, tipo: arquivo.type || null })
        .select('id');
      if (error || !data?.length) {
        await supabase.storage.from(BALDE).remove([caminho]);
        expectRows({ data, error }, 'anexar o arquivo');
      }
    },
    onSuccess: invalidar,
  });
}

export function useRemoverAnexoDaNoticia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (anexo: AnexoDaNoticia) => {
      expectRows(await supabase.from('jornal_anexos').delete().eq('id', anexo.id).select('id'), 'remover o anexo');
      const { error } = await supabase.storage.from(BALDE).remove([anexo.caminho]);
      if (error) console.error(error);
    },
    onSuccess: invalidar,
  });
}

/** Abre o anexo numa aba nova, por link de 10 minutos. */
export async function abrirAnexoDoJornal(caminho: string) {
  const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(caminho, 600);
  if (error) {
    toast.error(`Não foi possível abrir o anexo: ${mensagemDeErro(error)}`);
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}
