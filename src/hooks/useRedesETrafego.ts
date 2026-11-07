// As semanas de Redes sociais e Tráfego pago (`mkt_redes_semana`, `mkt_trafego_semana`) que a Visão Geral do Marketing
// usa: o período, o anterior, a semana antes dele (base do saldo de seguidores) e as últimas 5 semanas dos gráficos.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { somarDias } from '@/lib/ti-equipe';
import type { Intervalo, LinhaRedes, LinhaTrafego } from '@/lib/redes-e-trafego';
import type { LinhaPublico } from '@/lib/publico-do-instagram';
import type { LinhaKommo, LinhaPerda } from '@/lib/leads-e-vendas';

export const CHAVE_DAS_SEMANAS = 'mkt-semanal';

function useSemanas<T>(tabela: 'mkt_redes_semana' | 'mkt_trafego_semana', de: string, ate: string, ligado = true) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE_DAS_SEMANAS, tabela, tenantId, de, ate],
    enabled: !!tenantId && ligado && !!de && !!ate,
    queryFn: async (): Promise<T[]> =>
      (unwrap(await supabase.from(tabela as never).select('*').gte('semana', de).lte('semana', ate).order('semana')) ?? []) as unknown as T[],
  });
}

export function useRedesETrafego(atual: Intervalo, anterior: Intervalo, fimDoGrafico = atual.ate) {
  // A semana antes do anterior dá a base do saldo; 6 semanas antes do fim do gráfico cobrem os 5 domingos dele.
  const de = [somarDias(anterior.de, -7), somarDias(fimDoGrafico, -42)].sort()[0];
  const ate = somarDias(atual.ate, 6);
  const redes = useSemanas<LinhaRedes>('mkt_redes_semana', de, ate);
  const trafego = useSemanas<LinhaTrafego>('mkt_trafego_semana', de, ate);
  return { redes: redes.data ?? [], trafego: trafego.data ?? [], carregando: redes.isLoading || trafego.isLoading };
}

/** Quem segue cada conta (`mkt_publico_ig`): até o mês do fim do período, do mais novo para o mais velho; a tela usa o
 *  primeiro de cada conta (36 linhas = 12 meses das 3 contas, folga para um mês sem coleta). */
export function usePublicoDoInstagram(ate: string) {
  const { tenantId } = useAuth();
  const mes = `${ate.slice(0, 7)}-01`;
  return useQuery({
    queryKey: [CHAVE_DAS_SEMANAS, 'mkt_publico_ig', tenantId, mes],
    enabled: !!tenantId && !!ate,
    queryFn: async (): Promise<LinhaPublico[]> =>
      (unwrap(await supabase.from('mkt_publico_ig' as never).select('conta, mes, genero, idade, paises, cidades, online, coletado_em')
        .lte('mes', mes).order('mes', { ascending: false }).limit(36)) ?? []) as unknown as LinhaPublico[],
  });
}

/** As linhas de uma semana e da anterior a ela, para o formulário de lançamento. */
export function useSemanaParaLancar(domingo: string) {
  const anterior = domingo ? somarDias(domingo, -7) : '';
  const redes = useSemanas<LinhaRedes>('mkt_redes_semana', anterior, domingo, !!domingo);
  const trafego = useSemanas<LinhaTrafego>('mkt_trafego_semana', anterior, domingo, !!domingo);
  return { redes: redes.data ?? [], trafego: trafego.data ?? [], carregando: redes.isLoading || trafego.isLoading, anterior };
}

/** O último dia do mês de `mes` (AAAA-MM-01). */
const fimDoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes.slice(0, 8)}${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};

/**
 * Os meses inteiros da Meta (`mkt_redes_mes`, `mkt_trafego_mes`, 20270212660000), no formato das semanas: a "semana" de
 * cada linha é o último dia do mês, então as contas de `lib/redes-e-trafego` servem sem mudar. `de` e `ate` são dias 1.
 */
export function useMesesDaMeta(de: string, ate: string, ligado: boolean) {
  const { tenantId } = useAuth();
  const ler = <T,>(tabela: 'mkt_redes_mes' | 'mkt_trafego_mes') => ({
    queryKey: [CHAVE_DAS_SEMANAS, tabela, tenantId, de, ate],
    enabled: !!tenantId && ligado && !!de && !!ate,
    queryFn: async (): Promise<T[]> =>
      ((unwrap(await supabase.from(tabela as never).select('*').gte('mes', de).lte('mes', ate).order('mes')) ?? []) as unknown as ({ mes: string } & T)[])
        .map((l) => ({ ...l, semana: fimDoMes(l.mes) })),
  });
  const redes = useQuery(ler<LinhaRedes>('mkt_redes_mes'));
  const trafego = useQuery(ler<LinhaTrafego>('mkt_trafego_mes'));
  return { redes: redes.data ?? [], trafego: trafego.data ?? [] };
}

/** Os dias do Kommo (`mkt_kommo_dia`) e as perdas com motivo (`mkt_kommo_perdas`) entre `de` e `ate`. */
export function useKommo(de: string, ate: string) {
  const { tenantId } = useAuth();
  const linhas = useQuery({
    queryKey: [CHAVE_DAS_SEMANAS, 'mkt_kommo_dia', tenantId, de, ate],
    enabled: !!tenantId && !!de && !!ate,
    queryFn: async (): Promise<LinhaKommo[]> =>
      (unwrap(await supabase.from('mkt_kommo_dia' as never).select('dia, funil, chegaram, ganhas, perdidas, valor_ganho')
        .gte('dia', de).lte('dia', ate).limit(5000)) ?? []) as unknown as LinhaKommo[],
  });
  const perdas = useQuery({
    queryKey: [CHAVE_DAS_SEMANAS, 'mkt_kommo_perdas', tenantId, de, ate],
    enabled: !!tenantId && !!de && !!ate,
    queryFn: async (): Promise<LinhaPerda[]> =>
      (unwrap(await supabase.from('mkt_kommo_perdas' as never).select('dia, funil, motivo, quantos')
        .gte('dia', de).lte('dia', ate).limit(5000)) ?? []) as unknown as LinhaPerda[],
  });
  return { linhas: linhas.data ?? [], perdas: perdas.data ?? [] };
}
