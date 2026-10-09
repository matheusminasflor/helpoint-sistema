// As avaliações do atendimento, sigilosas (dono, 2026-10-09; 20261223010000): o atendente não vê — só o
// gestor do setor, a Diretoria e o administrador. Quem pode, o banco decide (`ve_avaliacoes_do_setor` e a
// policy de `avaliacoes_do_atendimento`); a tela só pergunta para não mostrar um bloco vazio.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { getDateRangeFromPeriod, type MetricsFilter } from '@/hooks/useHelpdeskMetrics';

export interface AvaliacaoDoAtendimento {
  ticket_id: string;
  atendente_id: string | null;
  nota: number;
  comentario: string | null;
  created_at: string;
}

export function useVeAvaliacoes(module: string | undefined) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['ve-avaliacoes', tenantId, user?.id, module],
    enabled: !!tenantId && !!module,
    queryFn: async () => !!unwrap(await supabase.rpc('ve_avaliacoes_do_setor' as never, { p_module: module } as never)),
  });
}

export function useAvaliacoesDoSetor(module: string | undefined, filter: MetricsFilter, habilitado: boolean) {
  const { tenantId } = useAuth();
  const { startDate, endDate } = getDateRangeFromPeriod(filter);
  return useQuery({
    queryKey: ['avaliacoes-do-setor', tenantId, module, startDate.toISOString(), endDate.toISOString()],
    enabled: !!tenantId && !!module && habilitado,
    queryFn: async () => (unwrap(await supabase.from('avaliacoes_do_atendimento' as 'profiles')
      .select('ticket_id, atendente_id, nota, comentario, created_at')
      .eq('module' as 'id', module!)
      .gte('created_at' as 'id', startDate.toISOString())
      .lte('created_at' as 'id', endDate.toISOString())
      .order('created_at' as 'id', { ascending: false })) ?? []) as unknown as AvaliacaoDoAtendimento[],
  });
}
