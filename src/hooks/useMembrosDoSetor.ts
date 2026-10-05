// Quem atende um setor: as pessoas com a concessão do módulo (decisão do dono, 2026-10-02). É a
// lista do filtro "colaborador" e do gráfico "por atendente" dos Indicadores — antes listava a
// empresa inteira. A regra de quem pode ler mora no banco (`membros_do_setor`).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface MembroDoSetor { id: string; full_name: string | null; email: string }

/** A concessão do setor a partir do módulo do chamado ('tickets' é a TI). */
export const concessaoDoModulo = (modulo: string) => (modulo === 'tickets' ? 'ti' : modulo);

export function useMembrosDoSetor(setor: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['membros-do-setor', tenantId, setor],
    enabled: !!setor,
    queryFn: async (): Promise<MembroDoSetor[]> =>
      unwrap(await supabase.rpc('membros_do_setor', { p_setor: setor! })) ?? [],
  });
}
