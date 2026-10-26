import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

/** Os setores em que a pessoa trabalha (setor do perfil, acesso, perfil de acesso) — o banco diz (`setores_da_pessoa`). */
export function useMeusSetores() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['meus-setores-de-chamado', tenantId, user?.id],
    queryFn: async () => (unwrap(await supabase.rpc('meus_setores_de_chamado')) ?? []) as string[],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}
