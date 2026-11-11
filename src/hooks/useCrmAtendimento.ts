import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import type { AtendimentoDoCrm } from '@/lib/crm-atendimento';

/**
 * O Atendimento do CRM de `de` a `ate` (`crm_atendimento`). O banco recorta por quem pergunta: o gestor vê todas as
 * atendentes, a atendente só o dela — por isso a chave leva a pessoa.
 */
export function useCrmAtendimento(de: string, ate: string) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['crm_atendimento', tenantId, user?.id, de, ate],
    enabled: !!tenantId && !!user?.id && !!de && !!ate,
    queryFn: async (): Promise<AtendimentoDoCrm> =>
      unwrap(await supabase.rpc('crm_atendimento' as never, { p_de: de, p_ate: ate } as never)) as unknown as AtendimentoDoCrm,
  });
}

/** A hora da última leitura do Kommo: conversas (de 10 em 10 minutos) e vendas (de hora em hora). */
export function useCrmAtualizadoEm() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm_atualizado_em', tenantId],
    enabled: !!tenantId,
    refetchInterval: 5 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.rpc('crm_atualizado_em' as never)) as unknown as { conversas?: string | null; vendas?: string | null },
  });
}
