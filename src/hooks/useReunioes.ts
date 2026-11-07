// As reuniões do Google no Chat (dono, 2026-11-07, migration 20270212570000). Só leitura: quem grava é `google-reunioes`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { invokeEdge } from '@/lib/edge-function';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';

export interface SerieDeReuniao { id: string; titulo: string; avulsa: boolean; canal_id: string }

export interface Reuniao {
  id: string; serie_id: string; titulo: string; inicio: string; fim: string | null; pauta: string | null;
  link_documento: string | null; link_gravacao: string | null; lista_google: string | null; link_meet: string | null;
}

export interface PresencaNaReuniao {
  id: string; nome: string; user_id: string | null; convidado: boolean; entrou: boolean;
  entrada: string | null; saida: string | null;
}

export interface AssuntoDaLeitura { assunto: string; datas: string[] }
export interface LeituraDaSerie {
  ate_reuniao: string | null;
  gerado_em: string;
  conteudo: { resumo: string; avancou: AssuntoDaLeitura[]; voltou: AssuntoDaLeitura[]; sem_definicao: AssuntoDaLeitura[] };
}

export function useLeituraDaSerie(serieId: string) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reuniao-leitura', tenantId, user?.id, serieId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('reuniao_leituras' as never)
      .select('ate_reuniao, gerado_em, conteudo').eq('serie_id', serieId).maybeSingle()) as unknown as LeituraDaSerie | null,
  });
}

export function useGerarLeitura(serieId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invokeEdge('reuniao-leitura', { serie_id: serieId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reuniao-leitura'] }),
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useSeriesDeReuniao() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reuniao-series', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => (unwrap(await supabase.from('reuniao_series' as never)
      .select('id, titulo, avulsa, canal_id').order('titulo')) ?? []) as unknown as SerieDeReuniao[],
  });
}

/** Da mais recente para a mais antiga. */
export function useReunioesDaSerie(serieId: string | null) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reunioes', tenantId, user?.id, serieId],
    enabled: !!tenantId && !!serieId,
    queryFn: async () => (unwrap(await supabase.from('reunioes' as never)
      .select('id, serie_id, titulo, inicio, fim, pauta, link_documento, link_gravacao, lista_google, link_meet')
      .eq('serie_id', serieId!).order('inicio', { ascending: false })) ?? []) as unknown as Reuniao[],
  });
}

/** `null`: a pessoa entrou no canal depois deste encontro, ou o encontro não teve transcrição. */
export function useTranscricao(reuniaoId: string | null) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reuniao-transcricao', tenantId, user?.id, reuniaoId],
    enabled: !!tenantId && !!reuniaoId,
    queryFn: async () => {
      const linha = unwrap(await supabase.from('reuniao_transcricoes' as never)
        .select('texto').eq('reuniao_id', reuniaoId!).maybeSingle()) as unknown as { texto: string } | null;
      return linha?.texto ?? null;
    },
  });
}

export function usePresenca(reuniaoId: string | null) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reuniao-presenca', tenantId, user?.id, reuniaoId],
    enabled: !!tenantId && !!reuniaoId,
    queryFn: async () => (unwrap(await supabase.from('reuniao_presencas' as never)
      .select('id, nome, user_id, convidado, entrou, entrada, saida')
      .eq('reuniao_id', reuniaoId!).order('nome')) ?? []) as unknown as PresencaNaReuniao[],
  });
}

/** Os nomes do Google ainda sem pessoa. O RLS devolve lista vazia a quem não é administrador. */
export function useNomesSemPessoa() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['reuniao-nomes', tenantId, user?.id],
    enabled: !!tenantId,
    queryFn: async () => {
      const linhas = (unwrap(await supabase.from('reuniao_nomes' as never)
        .select('nome_google').is('user_id', null).eq('ignorar', false).order('nome_google')) ?? []) as unknown as { nome_google: string }[];
      return linhas.map((l) => l.nome_google);
    },
  });
}

export function useLigarNome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, pessoa }: { nome: string; pessoa: string | null }) => {
      unwrap(await supabase.rpc('reuniao_ligar_nome' as never, { p_nome: nome, p_user: pessoa } as never));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reuniao-nomes'] });
      qc.invalidateQueries({ queryKey: ['reuniao-presenca'] });
      qc.invalidateQueries({ queryKey: ['reuniao-series'] });
      toast.success('Nome ligado.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}
