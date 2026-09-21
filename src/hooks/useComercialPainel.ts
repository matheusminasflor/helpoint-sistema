// Leitura do Painel Comercial (L6a). Um hook por função SQL — a conta mora
// no banco (§4.7): nenhuma tela lê `com_vendas_itens` direto, o PostgREST
// corta em 1000 linhas em silêncio, e aqui são dezenas de milhares por ano.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { buscarComTeto } from '@/lib/listas';
import { useAuth } from '@/contexts/AuthContext';
import type { CfopForaDaCurva, FaturamentoMensal, Filial, RankingCliente, Serie } from '@/types/comercial';

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

/** A última importação de cada tipo — para o rodapé fixo (§3.9): de qual importação os números vêm. */
export interface ComercialImportacao {
  id: string;
  tipo: 'vendas' | 'clientes' | 'metas';
  filial: Filial | null;
  file_name: string;
  linhas_lidas: number;
  itens_gravados: number;
  created_at: string;
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
