import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MetricsFilter, getDateRangeFromPeriod } from './useHelpdeskMetrics';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { concessaoDoModulo } from './useMembrosDoSetor';
import type { ChamadoNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';

export interface TechnicianMetrics {
  id: string;
  name: string;
  email: string;
  ticketsResolved: number;
  avgResolutionTime: number; // in hours
  slaCompliance: number; // percentage
  avgSatisfaction: number; // 1-5
  activeTickets: number;
  totalAssigned: number;
  /** Os chamados por trás de "Resolvidos" e "Ativos" — o hover da tabela (dono, 2026-10-04). */
  chamadosResolvidos: ChamadoNoHover[];
  chamadosAtivos: ChamadoNoHover[];
  /** Chamados do período que ele atendeu e que foram agendados com o prazo já vencido (dono, 2026-10-15). */
  chamadosAgendouVencido: ChamadoNoHover[];
}

export function useTechnicianPerformance(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['technician-performance', tenantId, filter?.module ?? 'todos', filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString()],
    queryFn: async (): Promise<TechnicianMetrics[]> => {
      // Get all tickets assigned in the period.
      //
      // `MetricsFilter.module` existia e **nunca era lido aqui**: a tela do RH
      // mostrava o desempenho de quem atende chamado de TI junto, e ninguem
      // notava porque a soma continuava plausivel. O filtro entra na consulta e
      // na chave do cache — sem os dois, trocar de modulo na tela mostraria o
      // numero do modulo anterior ate o proximo refetch.
      let q = supabase
        .from('tickets')
        .select('*')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString())
        .not('assigned_to', 'is', null);
      if (filter?.module) q = q.eq('module', filter.module);
      const { data: tickets, error: ticketError } = await q;

      if (ticketError) throw ticketError;

      // Quem atendeu junto (dono, 2026-10-13): o chamado conta inteiro para cada um.
      const juntoRows = tickets?.length
        ? ((unwrap(await supabase.from('ticket_participantes' as never).select('ticket_id, user_id')
            .in('ticket_id', tickets.map(t => t.id))) ?? []) as unknown as { ticket_id: string; user_id: string }[])
        : [];
      const juntoDe = new Map<string, string[]>();
      juntoRows.forEach(r => juntoDe.set(r.ticket_id, [...(juntoDe.get(r.ticket_id) ?? []), r.user_id]));
      const quemAtendeu = (t: { id: string; assigned_to: string | null }) =>
        [...new Set([t.assigned_to, ...(juntoDe.get(t.id) ?? [])].filter(Boolean) as string[])];

      // Extract unique assignee IDs
      let assigneeIds = [...new Set((tickets ?? []).flatMap(quemAtendeu))];
      // Só quem atende o setor entra no "por atendente" (decisão do dono, 2026-10-02): alguém de
      // outro setor que pegou um chamado daqui aparecia como atendente.
      if (filter?.module) {
        const membros = unwrap(await supabase.rpc('membros_do_setor',
          { p_setor: concessaoDoModulo(filter.module) })) ?? [];
        const doSetor = new Set(membros.map((m) => m.id));
        assigneeIds = assigneeIds.filter((id) => doSetor.has(id));
      }
      if (assigneeIds.length === 0) return [];

      // Fetch profiles for those assignees
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', assigneeIds);

      if (profileError) throw profileError;

      // A satisfação vem do registro SIGILOSO (dono, 2026-10-09; 20261223010000): o banco só devolve as
      // avaliações a quem pode ver (gestor do setor, Diretoria, administrador). Para o atendente a lista vem
      // vazia e a coluna some da tela — ele não vê nem a própria média.
      let qa = supabase.from('avaliacoes_do_atendimento' as 'profiles')
        .select('atendente_id, tambem_atenderam, nota')
        .gte('created_at' as 'id', dateRange.startDate.toISOString())
        .lte('created_at' as 'id', dateRange.endDate.toISOString());
      if (filter?.module) qa = qa.eq('module' as 'id', filter.module);
      const avaliacoes = (unwrap(await qa) ?? []) as unknown as { atendente_id: string | null; tambem_atenderam: string[] | null; nota: number }[];

      // Build metrics map from profiles
      const metricsMap: Record<string, TechnicianMetrics> = {};

      (profiles || []).forEach(p => {
        metricsMap[p.id] = {
          id: p.id,
          name: p.full_name || '',
          email: p.email,
          ticketsResolved: 0,
          avgResolutionTime: 0,
          slaCompliance: 0,
          avgSatisfaction: 0,
          activeTickets: 0,
          totalAssigned: 0,
          chamadosResolvidos: [],
          chamadosAtivos: [],
          chamadosAgendouVencido: [],
        };
      });

      // Group tickets by technician
      const techTickets: Record<string, typeof tickets> = {};
      
      tickets?.forEach(ticket => {
        quemAtendeu(ticket).forEach(quem => {
          if (!metricsMap[quem]) return;
          (techTickets[quem] ??= []).push(ticket);
        });
      });

      // Calculate metrics
      Object.entries(techTickets).forEach(([techId, techTicketList]) => {
        const metrics = metricsMap[techId];
        if (!metrics || !techTicketList) return;

        let resolvedCount = 0;
        let totalResolutionTime = 0;
        let slaMetCount = 0;
        let comSlaCount = 0;
        // A nota vale para o atendente e para quem atendeu junto (dono, 2026-10-13).
        const notas = avaliacoes.filter((a) => a.atendente_id === techId || (a.tambem_atenderam ?? []).includes(techId)).map((a) => a.nota);
        const satisfactionSum = notas.reduce((s, n) => s + n, 0);
        const satisfactionCount = notas.length;

        techTicketList.forEach(ticket => {
          metrics.totalAssigned++;
          const noHover: ChamadoNoHover = {
            id: ticket.id, ticket_number: ticket.ticket_number, title: ticket.title, created_at: ticket.created_at,
            assignee: { full_name: metrics.name || null, email: metrics.email },
          };

          // Coluna nova, ainda fora dos tipos gerados.
          if ((ticket as { agendou_vencido?: boolean }).agendou_vencido === true) metrics.chamadosAgendouVencido.push(noHover);

          // Count resolved
          if (ticket.status === 'resolved' || ticket.status === 'closed') {
            resolvedCount++;
            metrics.chamadosResolvidos.push(noHover);

            // Resolution time
            if (ticket.resolved_at && ticket.created_at) {
              const created = new Date(ticket.created_at);
              const resolved = new Date(ticket.resolved_at);
              totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
            }

            // SLA: só entra na conta quem TINHA prazo. O denominador era
            // `resolvedCount`, que conta todo resolvido — inclusive o de setor
            // sem política de SLA configurada, que nunca pode "cumprir". O
            // técnico aparecia com aderência menor do que a real, e piorava
            // justamente por atender onde ninguém definiu prazo.
            if (ticket.sla_due_at) {
              comSlaCount++;
              if (ticket.resolved_at && new Date(ticket.resolved_at) <= new Date(ticket.sla_due_at)) {
                slaMetCount++;
              }
            }
          }

          // Active tickets
          if (['open', 'in_progress', 'waiting_user', 'waiting_parts', 'scheduled'].includes(ticket.status)) {
            metrics.activeTickets++;
            metrics.chamadosAtivos.push(noHover);
          }
        });

        metrics.ticketsResolved = resolvedCount;
        metrics.avgResolutionTime = resolvedCount > 0 
          ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 
          : 0;
        metrics.slaCompliance = comSlaCount > 0
          ? Math.round((slaMetCount / comSlaCount) * 100)
          : 0;
        metrics.avgSatisfaction = satisfactionCount > 0 
          ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 
          : 0;
      });

      // Return only technicians who have at least one assigned ticket
      return Object.values(metricsMap)
        .filter(m => m.totalAssigned > 0)
        .sort((a, b) => b.ticketsResolved - a.ticketsResolved);
    },
  });
}
