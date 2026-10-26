// Leitura dos relatórios da etapa 5 (migration 20270202010000). Cada função do banco confere quem pode ver; o mesmo
// relatório é lido duas vezes, no período e no anterior, para a comparação.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import type { Intervalo } from '@/lib/periodo-do-relatorio';

export function useFuncaoDoRelatorio<T>(funcao: string, args: Record<string, unknown>, ligado = true) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['relatorio', funcao, tenantId, args],
    enabled: !!tenantId && ligado,
    queryFn: async () => (unwrap(await supabase.rpc(funcao as never, args as never)) ?? []) as unknown as T[],
  });
}

/** O relatório no período e no anterior. */
export function useRelatorioNosDoisPeriodos<T>(funcao: string, atual: Intervalo, anterior: Intervalo, extra: Record<string, unknown> = {}) {
  const agora = useFuncaoDoRelatorio<T>(funcao, { p_de: atual.de, p_ate: atual.ate, ...extra });
  const antes = useFuncaoDoRelatorio<T>(funcao, { p_de: anterior.de, p_ate: anterior.ate, ...extra });
  return { linhas: agora.data ?? [], antes: antes.data ?? [], carregando: agora.isLoading, erro: agora.error };
}

export interface CicloDaCompra {
  id: string; numero: number | null; produto: string; setor: string | null; caixinha: boolean; pedida_em: string;
  aprovador: string | null; dias_ate_aprovar: number | null; dias_ate_pagar: number | null; dias_ate_nota: number | null;
  etapa: string; parada_ha: number | null;
}
export interface EconomiaNaCotacao {
  id: string; numero: number | null; produto: string; setor: string | null; aprovada_em: string; orcamentos: number;
  escolhido: number; mais_barato: number; mais_caro: number; economia: number; fornecedor: string | null;
}
export interface GastoPorFornecedor { mes: string; fornecedor: string; setor: string; categoria: string; valor: number; contas: number }
export interface ReembolsoOuAdiantamento {
  id: string; numero: number; tipo: 'reembolso' | 'adiantamento'; pessoa: string; titulo: string; valor: number | null;
  gasto: number | null; sobra: number | null; etapa: string; pedido_em: string; pago_em: string | null;
}
export interface ConsumoDoEstoque { produto_id: string; produto: string; unidade: string; pessoa: string; quantidade: number; retiradas: number; ultima: string }
export interface SemanaDoCaixa { semana: string; entra: number; sai: number; entra_vencido: number; sai_vencido: number }
export interface VendaPorFamilia { familia: string; estado: string; cidade: string; venda: number; devolucao: number; clientes: number }
export interface Ausencia { user_id: string; nome: string; tipo: string; de: string; ate: string }
