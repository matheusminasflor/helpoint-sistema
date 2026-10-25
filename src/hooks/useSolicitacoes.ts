// Solicitações (etapa 4b; migration 20270201010000). Quem vê cada uma é a policy; quem age é `solicitacao_agir`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { abrirAnexoDoBalde, enviarAnexo } from '@/lib/anexos-no-storage';
import type { EtapaDaSolicitacao, SetorDaSolicitacao, TipoDeSolicitacao } from '@/config/solicitacoes';

export const BALDE_DAS_SOLICITACOES = 'solicitacoes';

export interface Solicitacao {
  id: string;
  numero: number;
  tenant_id: string;
  tipo: TipoDeSolicitacao;
  setor: SetorDaSolicitacao;
  solicitante_id: string;
  para_id: string;
  titulo: string;
  detalhes: string | null;
  dados: Record<string, unknown>;
  valor: number | null;
  preciso_ate: string | null;
  etapa: EtapaDaSolicitacao;
  motivo_recusa: string | null;
  atualizada_em: string;
  created_at: string;
  solicitante?: { full_name: string | null } | null;
  para?: { full_name: string | null } | null;
}

export interface EventoDaSolicitacao { id: string; acao: string; etapa: EtapaDaSolicitacao; texto: string | null; created_at: string; pessoa?: { full_name: string | null } | null }
export interface AnexoDaSolicitacao { id: string; nome: string; caminho: string; momento: 'pedido' | 'entrega' | 'prestacao'; created_at: string }

const tabela = () => supabase.from('solicitacoes' as never);
const COLUNAS = '*, solicitante:profiles!solicitacoes_solicitante_id_fkey(full_name), para:profiles!solicitacoes_para_id_fkey(full_name)';

/** As que eu pedi, ou que são para mim. */
export function useMinhasSolicitacoes() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['solicitacoes', 'minhas', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => (unwrap(await tabela().select(COLUNAS)
      .or(`solicitante_id.eq.${user!.id},para_id.eq.${user!.id}`)
      .order('created_at', { ascending: false }).limit(200)) ?? []) as unknown as Solicitacao[],
  });
}

/** As do setor (quem vê é a policy: "Ver" em Solicitações do setor). */
export function useSolicitacoesDoSetor(setor: SetorDaSolicitacao) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['solicitacoes', 'setor', tenantId, setor],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await tabela().select(COLUNAS).eq('setor', setor)
      .order('created_at', { ascending: false }).limit(500)) ?? []) as unknown as Solicitacao[],
  });
}

/** As que esperam a minha aprovação como gestor: etapa "pedido", dos tipos que pedem gestor, de outra pessoa. */
export function useParaEuAprovar() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['solicitacoes', 'para-aprovar', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => {
      const linhas = (unwrap(await tabela().select(COLUNAS).eq('etapa', 'pedido')
        .in('tipo', ['acesso', 'reembolso', 'adiantamento']).neq('para_id', user!.id)
        .order('created_at')) ?? []) as unknown as Solicitacao[];
      // A policy também mostra ao setor; aprovar é só do gestor da pessoa (a mesma pergunta do banco).
      const pessoas = [...new Set(linhas.map((l) => l.para_id))];
      const sou = new Map<string, boolean>();
      await Promise.all(pessoas.map(async (p) => {
        sou.set(p, !!unwrap(await supabase.rpc('sou_gestor_de' as never, { p_user: p } as never)));
      }));
      return linhas.filter((l) => sou.get(l.para_id));
    },
  });
}

export function useSolicitacao(id: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['solicitacoes', 'uma', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async () => {
      const [s, eventos, anexos] = await Promise.all([
        tabela().select(COLUNAS).eq('id', id!).maybeSingle(),
        supabase.from('solicitacoes_eventos' as never)
          .select('id, acao, etapa, texto, created_at, pessoa:profiles!solicitacoes_eventos_quem_fkey(full_name)')
          .eq('solicitacao_id', id!).order('created_at'),
        supabase.from('solicitacoes_anexos' as never).select('id, nome, caminho, momento, created_at')
          .eq('solicitacao_id', id!).order('created_at'),
      ]);
      return {
        solicitacao: unwrap(s) as unknown as Solicitacao | null,
        eventos: (unwrap(eventos) ?? []) as unknown as EventoDaSolicitacao[],
        anexos: (unwrap(anexos) ?? []) as unknown as AnexoDaSolicitacao[],
      };
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['solicitacoes'] });
}

export interface NovaSolicitacao {
  tipo: TipoDeSolicitacao;
  titulo: string;
  detalhes: string;
  valor?: number | null;
  preciso_ate?: string | null;
  para_id?: string | null;
  dados?: Record<string, unknown>;
  anexos: File[];
}

async function anexar(tenantId: string, solicitacaoId: string, arquivo: File, momento: AnexoDaSolicitacao['momento']) {
  await enviarAnexo(BALDE_DAS_SOLICITACOES, `${tenantId}/${solicitacaoId}`, arquivo, (caminho) =>
    supabase.from('solicitacoes_anexos' as never)
      .insert({ solicitacao_id: solicitacaoId, nome: arquivo.name, caminho, tamanho: arquivo.size, momento } as never)
      .select('id') as never);
}

/** Pede: grava, e depois sobe os anexos do pedido (o arquivo mora na pasta da solicitação). */
export function usePedir() {
  const { tenantId, user } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (n: NovaSolicitacao) => {
      const [nova] = expectRows(await tabela().insert({
        tipo: n.tipo, titulo: n.titulo.trim(), detalhes: n.detalhes.trim() || null,
        valor: n.valor ?? null, preciso_ate: n.preciso_ate || null, para_id: n.para_id || user!.id, dados: n.dados ?? {},
      } as never).select('id, numero') as never, 'o pedido') as unknown as { id: string; numero: number }[];
      for (const a of n.anexos) await anexar(tenantId!, nova.id, a, 'pedido');
      return nova;
    },
    onSuccess: (nova) => { invalidar(); toast.success(`Pedido #${nova.numero} enviado.`); },
    onError: (e) => toast.error('Não enviou o pedido', { description: mensagemDeErro(e) }),
  });
}

export function useAnexarNaSolicitacao() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, arquivos, momento }: { id: string; arquivos: File[]; momento: AnexoDaSolicitacao['momento'] }) => {
      for (const a of arquivos) await anexar(tenantId!, id, a, momento);
    },
    onSuccess: () => invalidar(),
    onError: (e) => toast.error('Não anexou', { description: mensagemDeErro(e) }),
  });
}

export function useAgirNaSolicitacao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, acao, texto, dados }: { id: string; acao: string; texto?: string; dados?: Record<string, unknown> }) =>
      unwrap(await supabase.rpc('solicitacao_agir' as never, { p_id: id, p_acao: acao, p_texto: texto ?? null, p_dados: dados ?? null } as never)) as unknown as EtapaDaSolicitacao,
    onSuccess: () => invalidar(),
    onError: (e) => toast.error('Não gravou', { description: mensagemDeErro(e) }),
  });
}

export const abrirAnexoDaSolicitacao = (caminho: string) => abrirAnexoDoBalde(BALDE_DAS_SOLICITACOES, caminho);
