// O prazo em horas de expediente (dono, 2026-11-06, #337). A conta é do banco, a mesma que grava o vencimento; a tela só
// pergunta uma vez por lista e atualiza a cada minuto.
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import type { TempoUtil } from '@/types/helpdesk';

export async function lerTempoUtil(ids: string[]) {
  const linhas = unwrap(await supabase.rpc('chamados_tempo_util' as never, { p_ids: ids } as never)) as unknown as (TempoUtil & { ticket_id: string })[] | null;
  return new Map((linhas ?? []).map((l) => [l.ticket_id, l]));
}

export function useTempoUtil(ids: string[]) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chamados-tempo-util', tenantId, ids],
    enabled: !!tenantId && ids.length > 0,
    refetchInterval: 60_000,
    queryFn: () => lerTempoUtil(ids),
  });
}
