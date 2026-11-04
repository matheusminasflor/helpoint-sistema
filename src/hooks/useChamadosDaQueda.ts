import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

interface ChamadoDaQueda {
  id: string;
  ticket_number: number;
  status: string;
  created_at: string;
}

const ENCERRADOS = ['resolved', 'closed', 'cancelled', 'rejected'];

/** Os chamados da mesma queda. A tela pergunta "voltou às" só quando este é o último aberto. */
export function useChamadosDaQueda(interrupcaoId: string | null | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['chamados-da-queda', tenantId, interrupcaoId],
    enabled: !!tenantId && !!interrupcaoId,
    queryFn: async () => (unwrap(await supabase.from('tickets')
      .select('id, ticket_number, status, created_at').eq('interrupcao_id' as never, interrupcaoId as never)
      .order('created_at')) ?? []) as unknown as ChamadoDaQueda[],
  });
}

export const outrosAbertos = (chamados: ChamadoDaQueda[], ticketId: string) =>
  chamados.filter((c) => c.id !== ticketId && !ENCERRADOS.includes(c.status));
