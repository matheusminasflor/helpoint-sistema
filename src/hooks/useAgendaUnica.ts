import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { SLA_STOPPED_STATUSES } from '@/types/helpdesk';
import type { ChamadoDaAgenda, FeriasDaAgenda } from '@/lib/agenda-unica';

/**
 * O que a Agenda única mostra além dos eventos (etapa 4, 2026-10-25): os MEUS chamados (sou o atendente) agendados ou
 * com prazo no intervalo, e as férias aprovadas de quem é do meu setor (`ferias_do_meu_setor`, decisão do dono:
 * nome e datas, nada mais).
 */
export function useAgendaUnica(de: string, ate: string) {
  const { user, tenantId } = useAuth();
  // O dia `ate` inteiro, no fuso de quem olha: o filtro é por instante, e o prazo das 22h do último dia conta.
  const inicio = new Date(`${de}T00:00:00`).toISOString();
  const fim = new Date(`${ate}T23:59:59.999`).toISOString();
  const chamados = useQuery({
    queryKey: ['agenda-unica', 'chamados', tenantId, user?.id, de, ate],
    enabled: !!user?.id && !!tenantId,
    queryFn: async (): Promise<ChamadoDaAgenda[]> => unwrap(await supabase
      .from('tickets')
      .select('id, ticket_number, title, status, sla_due_at, agendado_para')
      .eq('assigned_to', user!.id)
      .not('status', 'in', `(${SLA_STOPPED_STATUSES.join(',')})`)
      .or(`and(sla_due_at.gte.${inicio},sla_due_at.lte.${fim}),and(agendado_para.gte.${inicio},agendado_para.lte.${fim})`)
      .limit(500)) as ChamadoDaAgenda[],
  });
  const ferias = useQuery({
    queryKey: ['agenda-unica', 'ferias', tenantId, user?.id, de, ate],
    enabled: !!user?.id && !!tenantId,
    queryFn: async (): Promise<FeriasDaAgenda[]> =>
      (unwrap(await supabase.rpc('ferias_do_meu_setor' as never, { p_de: de, p_ate: ate } as never)) ?? []) as FeriasDaAgenda[],
  });
  return { chamados, ferias };
}

/**
 * Os chamados abertos de um setor com prazo ou agendamento no intervalo — no calendário do Marketing, os pedidos de
 * arte e de evento ao lado dos posts (etapa 4, 2026-10-25). Quem lê é a policy de `tickets`: cada um vê o que já via na fila.
 */
export function useChamadosDoSetorNoIntervalo(modulo: string, de: string, ate: string) {
  const { tenantId } = useAuth();
  const inicio = new Date(`${de}T00:00:00`).toISOString();
  const fim = new Date(`${ate}T23:59:59.999`).toISOString();
  return useQuery({
    queryKey: ['agenda-unica', 'chamados-do-setor', tenantId, modulo, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<ChamadoDaAgenda[]> => unwrap(await supabase
      .from('tickets')
      .select('id, ticket_number, title, status, sla_due_at, agendado_para, category')
      .eq('module', modulo)
      .not('status', 'in', `(${SLA_STOPPED_STATUSES.join(',')})`)
      .or(`and(sla_due_at.gte.${inicio},sla_due_at.lte.${fim}),and(agendado_para.gte.${inicio},agendado_para.lte.${fim})`)
      .limit(300)) as ChamadoDaAgenda[],
  });
}
