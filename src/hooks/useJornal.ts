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

/**
 * Para quem a notícia vai (dono, 2026-10-15): INBRAS = Produção, Qualidade e Expedição; MF = os demais setores.
 * 'setores' (2026-10-19): só quem tem um dos `setores` escolhidos — o banco esconde dos outros (20270128030000).
 */
export type PublicoDaNoticia = 'todos' | 'INBRAS' | 'MF' | 'setores';

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
  /** A repetição (dono, 2026-10-13; 20261226010000): cada vez sai uma cópia publicada, feita pelo banco. */
  repetir: Repeticao | null;
  repetir_ate: string | null;
  /** Para quem (2026-10-15): todos, ou só a filial INBRAS ou MF. */
  publico?: PublicoDaNoticia;
  setores?: string[] | null;
  /** Ao publicar pela 1ª vez, manda mensagem direta no chat a cada pessoa dos setores. */
  avisar_no_chat?: boolean;
  proxima_repeticao: string | null;
  /** Nas cópias: a original — é dela que vêm os anexos. */
  repeticao_de: string | null;
  autor: { full_name: string | null } | null;
}

export type Repeticao = 'semanal' | 'mensal' | 'anual';
export const ROTULO_DA_REPETICAO: Record<Repeticao, string> = { semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' };

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

/**
 * As atualizações do sistema publicadas que a pessoa ainda não leu (dono, 2026-10-14: "no Jornal aparecer
 * notificação em azul para ler"). O menu e a aba mostram a contagem; cada uma ganha o selo "Nova".
 */
export function useAtualizacoesNaoLidas() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['jornal-nao-lidas', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<Set<string>> => {
      const [publicadas, lidas] = await Promise.all([
        supabase.from('jornal_noticias').select('id').eq('tipo', 'atualizacao_sistema').eq('status', 'publicada'),
        supabase.from('jornal_lidas' as never).select('noticia_id'),
      ]);
      const jaLidas = new Set(((unwrap(lidas) ?? []) as unknown as { noticia_id: string }[]).map((l) => l.noticia_id));
      return new Set(((unwrap(publicadas) ?? []) as { id: string }[]).map((n) => n.id).filter((id) => !jaLidas.has(id)));
    },
  });
}

/** Marca a atualização como lida — e o aviso dela na "Lyra avisa" junto. */
export function useMarcarComoLida() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noticiaId: string) => {
      // Só é chamada para a que está "Nova" (sem leitura gravada): insert simples, que prova que gravou.
      expectRows(await supabase.from('jornal_lidas' as never)
        .insert({ noticia_id: noticiaId } as never).select('noticia_id'), 'marcar a atualização como lida');
      unwrap(await supabase.from('notifications').update({ is_read: true })
        .eq('reference_id', noticiaId).eq('user_id', user!.id).eq('is_read', false).select('id'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jornal-nao-lidas', tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ['jornal-minhas-lidas', tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ['jornal-leituras', tenantId] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Todas as notícias que eu já abri (etapa 4, 2026-10-25: a leitura de toda notícia é gravada, não só a das atualizações). */
export function useMinhasLidas() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['jornal-minhas-lidas', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<Set<string>> => new Set(((unwrap(await supabase.from('jornal_lidas' as never)
      .select('noticia_id')) ?? []) as unknown as { noticia_id: string }[]).map((l) => l.noticia_id)),
  });
}

/** "Lida por 12 de 30" para quem edita ou publica no Jornal (`jornal_leituras`; para os outros o banco devolve nada). */
export function useLeiturasDoJornal(ativo: boolean) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['jornal-leituras', tenantId],
    enabled: !!tenantId && ativo,
    queryFn: async () => new Map(((unwrap(await supabase.rpc('jornal_leituras' as never)) ?? []) as unknown as
      { noticia_id: string; lidas: number; pessoas: number }[]).map((l) => [l.noticia_id, l])),
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

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;

/**
 * A imagem do destaque (dono, 2026-10-16: o "Sextou!" tinha só a imagem anexada, sem capa, e o mural mostrou só o
 * título). A capa, se houver; senão a primeira imagem anexada — `inteira` diz que ela não foi feita para a capa 16:9 e
 * deve aparecer sem corte.
 */
export function useImagemDoDestaque(noticia: Noticia | null | undefined): { url?: string; inteira: boolean } {
  const semCapa = !!noticia && !noticia.capa_caminho;
  const { data: anexos = [] } = useAnexosDaNoticia(semCapa ? noticia!.id : null, noticia?.repeticao_de);
  const caminho = noticia?.capa_caminho ?? anexos.find((a) => EH_IMAGEM.test(a.nome))?.caminho;
  const { data: urls } = useCapas(caminho ? [caminho] : []);
  return { url: caminho ? urls?.get(caminho) : undefined, inteira: semCapa };
}

/** Os anexos da notícia — e, numa cópia de repetição, os da original (`origem`). */
export function useAnexosDaNoticia(id: string | null, origem?: string | null) {
  const { tenantId } = useAuth();
  const ids = [id, origem].filter((x): x is string => !!x);
  return useQuery({
    queryKey: ['jornal', tenantId, 'anexos', id, origem ?? null],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<AnexoDaNoticia[]> =>
      (unwrap(await supabase.from('jornal_anexos').select('id, nome, caminho').in('noticia_id', ids).order('created_at')) ?? []) as AnexoDaNoticia[],
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
  repetir: Repeticao | null;
  repetir_ate: string | null;
  publico: PublicoDaNoticia;
  setores: string[];
  avisar_no_chat: boolean;
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
        repetir: f.repetir, repetir_ate: f.repetir ? f.repetir_ate || null : null, publico: f.publico,
        setores: f.publico === 'setores' ? f.setores : null,
        avisar_no_chat: f.publico === 'setores' && f.avisar_no_chat,
      };
      if (id) {
        expectRows(await supabase.from('jornal_noticias').update(campos as never).eq('id', id).select('id'), 'salvar a notícia');
      } else {
        expectRows(await supabase.from('jornal_noticias').insert({ id: noticiaId, ...campos } as never).select('id'), 'criar a notícia');
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
      // A capa é a mesma nas repetições (20261226010000): só sai do balde quando ninguém mais a usa.
      let capaSai = !!noticia.capa_caminho;
      if (noticia.capa_caminho) {
        const { count, error } = await supabase.from('jornal_noticias')
          .select('id', { count: 'exact', head: true }).eq('capa_caminho', noticia.capa_caminho);
        if (error) throw error;
        capaSai = count === 0;
      }
      await tirarDoBalde(BALDE, [...anexos.map((a) => a.caminho), ...(capaSai ? [noticia.capa_caminho!] : [])]);
    },
    onSuccess: invalidar,
  });
}

/**
 * Duplicar (dono, 2026-10-13): tudo — título, texto, tipo, capa e anexos — como rascunho com a data de hoje.
 * Os arquivos são copiados de verdade, para a cópia não depender da original. Não leva a repetição.
 */
export function useDuplicarNoticia() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ noticia, hoje }: { noticia: Noticia; hoje: string }): Promise<Noticia> => {
      const novoId = crypto.randomUUID();
      const balde = supabase.storage.from(BALDE);
      const copiar = async (de: string, nome: string) => {
        const para = `${tenantId}/${novoId}/${crypto.randomUUID()}-${sanitizeFileName(nome)}`;
        const { error } = await balde.copy(de, para);
        if (error) throw error;
        return para;
      };
      const capa_caminho = noticia.capa_caminho
        ? await copiar(noticia.capa_caminho, `capa-${noticia.capa_caminho.split('/').pop() ?? 'capa'}`) : null;
      const nova = unwrap(await supabase.from('jornal_noticias').insert({
        id: novoId, titulo: `${noticia.titulo} (cópia)`, texto: noticia.texto, tipo: noticia.tipo,
        data_noticia: hoje, destaque: noticia.destaque, capa_caminho, publico: noticia.publico ?? 'todos',
        setores: noticia.setores ?? null, avisar_no_chat: noticia.avisar_no_chat ?? false,
      } as never).select('*, autor:profiles!jornal_noticias_autor_id_fkey(full_name)').single()) as unknown as Noticia;
      const anexos = (unwrap(await supabase.from('jornal_anexos').select('nome, caminho, tamanho, tipo')
        .in('noticia_id', [noticia.id, ...(noticia.repeticao_de ? [noticia.repeticao_de] : [])])) ?? []) as
        { nome: string; caminho: string; tamanho: number | null; tipo: string | null }[];
      for (const a of anexos) {
        const caminho = await copiar(a.caminho, a.nome);
        expectRows(await supabase.from('jornal_anexos')
          .insert({ noticia_id: novoId, nome: a.nome, caminho, tamanho: a.tamanho, tipo: a.tipo }).select('id'), 'copiar o anexo');
      }
      return nova;
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
