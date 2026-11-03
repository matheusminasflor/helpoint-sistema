// Pedidos de arte, estoque e Benefício de sexta no período, para os Indicadores do Marketing: os blocos e a faixa
// "Atenção agora" (2026-11-03) leem daqui. Os mesmos ganchos das telas de cada um; a conta é `indicadoresDoMarketing`.
import { useMovimentosMkt, useProdutosMkt } from '@/hooks/useEstoqueMkt';
import { useSolicitacoesDoSetor } from '@/hooks/useSolicitacoes';
import { useRetiradas } from '@/hooks/useBeneficioDeSexta';
import { indicadoresDoMarketing, type IndicadoresDoMarketing } from '@/lib/indicadores-do-marketing';
import { todayISO } from '@/lib/dates';

export function useIndicadoresDoMarketing(de: string, ate: string): IndicadoresDoMarketing {
  const { data: produtos = [] } = useProdutosMkt();
  const { data: movimentos = [] } = useMovimentosMkt();
  const { data: pedidos = [] } = useSolicitacoesDoSetor('marketing');
  const { data: retiradas = [] } = useRetiradas();
  return indicadoresDoMarketing({ produtos, movimentos, pedidos: pedidos.filter((p) => p.tipo === 'arte'), retiradas, de, ate, hoje: todayISO() });
}
