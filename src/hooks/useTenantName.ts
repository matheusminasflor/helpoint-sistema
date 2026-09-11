import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

/** O nome da empresa logada — para textos que saem em nome dela (a mensagem da proposta, CRM-1c). */
export function useTenantName() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tenant-name', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string> =>
      unwrap(await supabase.from('tenants').select('name').eq('id', tenantId!).single()).name,
  });
}
