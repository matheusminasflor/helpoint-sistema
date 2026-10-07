// Ajuda a outros setores (decisão do dono, 2026-10-07): os chamados de OUTROS setores atendidos por
// gente deste setor no período. Não pesam na performance de quem ajudou; o chamado continua contando
// nos Indicadores do setor dele. A regra e a permissão moram no banco (`ajuda_a_outros_setores`,
// 20261214020000) — o título só vem para quem pode ver o chamado.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { getDateRangeFromPeriod, type MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import type { ChamadoNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';
import { setorDoModulo } from '@/lib/permissoes';
import { rotuloDoSetor } from '@/lib/setores';

export interface ChamadoDeAjuda {
  id: string;
  ticket_number: number;
  title: string;
  module: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  atendente_id: string;
  atendente_nome: string | null;
}

/** A ajuda como linhas da lista do hover: o setor ajudado aparece em cada uma. */
export function ajudaNoHover(chamados: ChamadoDeAjuda[]): ChamadoNoHover[] {
  return chamados.map((c) => ({
    id: c.id,
    ticket_number: c.ticket_number,
    title: c.title,
    created_at: c.created_at,
    assignee: { full_name: c.atendente_nome },
    modulo: c.module,
    setor: `Ajuda a ${rotuloDoSetor(setorDoModulo(c.module) ?? c.module)}`,
  }));
}

export function useAjudaAOutrosSetores(modulo: string | undefined, filter: MetricsFilter) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ajuda-outros-setores', tenantId, modulo, filter.period, filter.startDate?.toISOString(), filter.endDate?.toISOString()],
    enabled: !!modulo,
    queryFn: async (): Promise<ChamadoDeAjuda[]> => {
      const { startDate, endDate } = getDateRangeFromPeriod(filter);
      return (unwrap(await supabase.rpc('ajuda_a_outros_setores', {
        p_modulo: modulo!, p_de: startDate.toISOString(), p_ate: endDate.toISOString(),
      })) ?? []) as ChamadoDeAjuda[];
    },
  });
}
