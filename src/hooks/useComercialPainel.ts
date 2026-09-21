// Leitura do Painel Comercial (L6a). Um hook por função SQL — a conta mora
// no banco (§4.7): nenhuma tela lê `com_vendas_itens` direto, o PostgREST
// corta em 1000 linhas em silêncio, e aqui são dezenas de milhares por ano.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { buscarComTeto, type ConsultaComLimite } from '@/lib/listas';
import { useAuth } from '@/contexts/AuthContext';
import type {
  BonificacaoCliente, CfopForaDaCurva, ClienteATrabalhar, ComercialImportacao, CriterioCurva, FaturamentoMensal,
  Filial, PainelTotais, PedidoEmCondicao, ProdutoNaCurva, RankingCliente, Serie,
} from '@/types/comercial';

/** O ano mês a mês — o bloco principal do painel. `p_serie` é eixo próprio (§3.8): nunca se mistura com a classe de CFOP. */
export function useFaturamentoMensal(ano: number, filial: Filial | null, serie: Serie | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'faturamento', tenantId, ano, filial, serie],
    enabled: !!tenantId,
    queryFn: async (): Promise<FaturamentoMensal[]> =>
      unwrap(await supabase.rpc('com_faturamento_mensal', { p_ano: ano, p_filial: filial, p_serie: serie })) as unknown as FaturamentoMensal[],
  });
}

/**
 * Os quatro KPIs do topo, numa linha só (achado 1 da auditoria): nenhuma
 * tela deve somar `clientes_ativos`/`skus_vendidos` de `FaturamentoMensal` —
 * `count(distinct …)` não se soma entre grupos de mês/filial/série. A RPC
 * devolve no máximo uma linha; o vazio (nenhuma venda no ano) vira zeros.
 */
export function usePainelTotais(ano: number, filial: Filial | null, serie: Serie | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'painel-totais', tenantId, ano, filial, serie],
    enabled: !!tenantId,
    queryFn: async (): Promise<PainelTotais> => {
      const linhas = unwrap(await supabase.rpc('com_painel_totais', {
        p_ano: ano, p_filial: filial, p_serie: serie,
      })) as unknown as PainelTotais[];
      return linhas[0] ?? {
        venda: 0, devolucao: 0, liquido: 0, bonificacao: 0, unidades: 0, clientes_ativos: 0, skus_vendidos: 0,
      };
    },
  });
}

/**
 * Os anos com venda importada, do mais recente ao mais antigo (pedido do
 * dono, 2026-09-21): o seletor de ano do painel não pode ser uma janela
 * fixa — no go-live a importação vai de 2022 até hoje, e uma janela fixa
 * deixaria 2022/2023 gravados e inalcançáveis na tela.
 */
export function useAnosComVenda() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'anos-com-venda', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<number[]> => {
      const linhas = unwrap(await supabase.rpc('com_anos_com_venda')) as unknown as { ano: number }[];
      return linhas.map((l) => l.ano);
    },
  });
}

/** Maiores compradores do período. */
export function useRankingClientes(de: string, ate: string, filial: Filial | null, serie: Serie | null, limite = 20) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'ranking-clientes', tenantId, de, ate, filial, serie, limite],
    enabled: !!tenantId,
    queryFn: async (): Promise<RankingCliente[]> =>
      unwrap(await supabase.rpc('com_ranking_clientes', {
        p_de: de, p_ate: ate, p_filial: filial, p_serie: serie, p_limite: limite,
      })) as unknown as RankingCliente[],
  });
}

/**
 * O quadro de CFOP fora da lista (§3.2) — some da tela quando não há
 * nenhum. Passa por `buscarComTeto`: é uma lista que cresce (um CFOP novo a
 * cada exportação), e o PostgREST corta em 1000 em silêncio (§4.7).
 */
export function useCfopForaDaCurva(de: string, ate: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cfop-fora-da-curva', tenantId, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: CfopForaDaCurva[]; cortou: boolean }> =>
      buscarComTeto<CfopForaDaCurva>(supabase.rpc('com_cfop_fora_da_curva', { p_de: de, p_ate: ate })),
  });
}

/** Competências já reclamadas por uma filial — para a prévia avisar ANTES de a pessoa confirmar (§4.2). */
export function useCompetenciasImportadas(filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'competencias-importadas', tenantId, filial],
    enabled: !!tenantId && !!filial,
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(await supabase
        .from('com_vendas_competencias')
        .select('competencia')
        .eq('filial', filial!)) as unknown as { competencia: string }[];
      return rows.map((r) => r.competencia);
    },
  });
}

export function useUltimasImportacoes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'importacoes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ComercialImportacao[]> =>
      unwrap(await supabase
        .from('com_vendas_importacoes')
        .select('id, tipo, filial, file_name, linhas_lidas, itens_gravados, created_at')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(20)) as unknown as ComercialImportacao[],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// L6b — curva ABC, clientes a trabalhar, bonificação e pedidos em condição.
// Mesma regra do topo do arquivo: a conta mora no banco, um hook por RPC.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A curva ABC (Pareto) por produto. Passa por `buscarComTeto`: "todos os
 * produtos por faixa" é, por definição, a base inteira do período — cresce
 * com o catálogo, e o PostgREST corta em 1000 em silêncio (§4.7).
 */
export function useCurvaAbc(de: string, ate: string, filial: Filial | null, criterio: CriterioCurva) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'curva-abc', tenantId, de, ate, filial, criterio],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: ProdutoNaCurva[]; cortou: boolean }> =>
      // `faixa` é `'A' | 'B' | 'C' | '-'` aqui e `string` no tipo gerado do
      // Supabase (a RPC devolve texto livre) — o cast é só para casar as
      // duas visões do mesmo dado; o banco é quem garante os quatro valores.
      buscarComTeto<ProdutoNaCurva>(supabase.rpc('com_curva_abc', {
        p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      }) as unknown as ConsultaComLimite<ProdutoNaCurva>),
  });
}

/** Bonificação por cliente e o quanto ela representa do que ele comprou. */
export function useBonificacaoPorCliente(de: string, ate: string, filial: Filial | null, serie: Serie | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'bonificacao-por-cliente', tenantId, de, ate, filial, serie],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: BonificacaoCliente[]; cortou: boolean }> =>
      buscarComTeto<BonificacaoCliente>(supabase.rpc('com_bonificacao_por_cliente', {
        p_de: de, p_ate: ate, p_filial: filial, p_serie: serie,
      })),
  });
}

/** Pedidos em condição: série 75 e cliente `em_condicao`, as duas coisas (§13 do INSTRUCOES v7). */
export function usePedidosEmCondicao(de: string, ate: string, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'pedidos-em-condicao', tenantId, de, ate, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: PedidoEmCondicao[]; cortou: boolean }> =>
      buscarComTeto<PedidoEmCondicao>(supabase.rpc('com_pedidos_em_condicao', {
        p_de: de, p_ate: ate, p_filial: filial,
      })),
  });
}

/** Clientes que compraram e pararam — ver `com_clientes_a_trabalhar` no banco para a regra exata. */
export function useClientesATrabalhar(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'clientes-a-trabalhar', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: ClienteATrabalhar[]; cortou: boolean }> =>
      buscarComTeto<ClienteATrabalhar>(supabase.rpc('com_clientes_a_trabalhar', {
        p_ano: ano, p_filial: filial,
      })),
  });
}
