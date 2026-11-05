import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface ChamadoDoInicio {
  id: string;
  ticket_number: number;
  title: string;
  priority: string;
  status: string;
  sla_due_at: string | null;
  /** O prazo escolhido por quem abriu (ou pelo fluxo). O SLA é o relógio, não o prazo. */
  due_date: string | null;
  category: string | null;
  /** Em que fila o chamado vive: TI, Comercial, RH… */
  module: string | null;
  created_at: string;
  agendou_vencido: boolean;
  meu: boolean;
  atendente: string | null;
}

/**
 * Os chamados do Início (decisão do dono, 2026-10-06): os que a pessoa ATENDE, os SEM atendente dos setores dela e, de
 * quem gere a fila, o setor inteiro. A regra mora no banco (`chamados_do_meu_resumo`). Não usa IA (dono, 2026-11-04).
 */
export function useChamadosDoInicio() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['chamados-do-inicio', user?.id],
    enabled: !!user?.id,
    queryFn: async () => (unwrap(await supabase.rpc('chamados_do_meu_resumo' as never)) ?? []) as unknown as ChamadoDoInicio[],
  });
}
