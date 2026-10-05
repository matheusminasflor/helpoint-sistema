import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { toLocalISODate } from '@/lib/dates';
import { intervaloEmDatas, type IntervaloDeDias } from '@/lib/period';
import { contaComoResolvido, statusVisivel } from '@/lib/status-do-chamado';

/**
 * Um chamado do período, com o que a lista do "passar o mouse" mostra. Vem da MESMA consulta que
 * fez os números (decisão do dono, 2026-10-04: em cada número da Análise detalhada, ver QUAIS
 * chamados estão por trás dele) — então a lista nunca discorda da contagem ao lado.
 */
export interface ChamadoDoPeriodo {
  id: string;
  ticket_number: number;
  title: string;
  /** Já como a tela mostra: o `closed` antigo vem como `resolved`. */
  status: string;
  priority: string | null;
  category: string;
  created_at: string;
  assignee?: { full_name?: string | null; email?: string | null } | null;
  /** Em aberto e com o prazo já vencido — a mesma conta do "SLA violados" (`slaDoChamado`). */
  sla_estourado: boolean;
}

export interface TicketMetrics {
  total: number;
  open: number;
  inProgress: number;
  /**
   * Resolvidos entre os chamados ABERTOS no período (o recorte é por `created_at`, como todo
   * número desta tela). Inclui o `closed` antigo: até 2026-10-04 ele ia para uma casa "Fechados"
   * à parte e a TI mostrava "Resolvidos = 0" com 7 chamados entregues.
   */
  resolved: number;
  /** Os chamados por trás dos números (ver `ChamadoDoPeriodo`). */
  chamados: ChamadoDoPeriodo[];
  slaCompliance: number;
  avgResolutionTime: number;
  /**
   * Horas, em média, entre abrir o chamado e a primeira resposta (`first_response_at`), entre os
   * que já foram respondidos. A tabela do RH mostrava "1ª resposta média" lendo este campo, que não
   * existia — ficava sempre "—" (achado de 2026-10-04).
   */
  avgFirstResponseTime: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byCategoryAndStatus: Record<string, Record<string, number>>;
  // SLA violation metrics
  slaViolated: number;
  slaViolationRate: number;
  avgOverdueTime: number;
  violatedByPriority: Record<string, number>;
  violatedByCategory: Record<string, number>;
}

export interface TicketTrend {
  date: string;
  opened: number;
  resolved: number;
}

/** Status em que o relógio do SLA parou de correr. */
const SLA_PARADO = ['resolved', 'closed', 'cancelled', 'rejected'];

/**
 * O SLA de UM chamado, por uma regra só.
 *
 * POR QUE ISTO EXISTE (2026-09-27). A aderência do período atual e a do período
 * anterior eram calculadas por **regras diferentes**, nos dois lados da mesma
 * seta de "vs. período anterior": o atual contava como cumprido tanto o resolvido
 * no prazo quanto o que ainda estava correndo dentro dele; o anterior contava só
 * o resolvido no prazo. Comparar os dois é comparar coisas diferentes, e a seta
 * dizia "melhorou" ou "piorou" a partir disso.
 *
 * E o **denominador** era `metrics.total`, que inclui chamado cancelado,
 * reprovado e chamado **sem SLA nenhum** — todos contados como "não cumpriu".
 * Empresa que configura política de SLA para um setor só teria a aderência
 * diluída por todos os outros. Agora o denominador é quem tem prazo.
 *
 * Devolve `null` para chamado sem `sla_due_at`: ele não entra em nenhum dos dois
 * lados da conta, em vez de entrar como falha.
 */
function slaDoChamado(
  ticket: { sla_due_at?: string | null; resolved_at?: string | null; status?: string | null },
  agora: Date,
): { cumpriu: boolean; estourado: boolean } | null {
  if (!ticket.sla_due_at) return null;

  const prazo = new Date(ticket.sla_due_at);
  // Marco final do SLA = resolved_at. Nunca closed_at/updated_at.
  const resolvido = ticket.resolved_at ? new Date(ticket.resolved_at) : null;
  const correndo = !SLA_PARADO.includes(ticket.status ?? 'open');

  if (resolvido) return { cumpriu: resolvido <= prazo, estourado: false };
  // Sem resolução: só o que ainda corre tem veredito. Cancelado e reprovado sem
  // resolução não cumpriram nem violaram — o relógio parou sem entrega.
  if (!correndo) return { cumpriu: false, estourado: false };
  return { cumpriu: agora <= prazo, estourado: agora > prazo };
}

export interface MetricsFilter {
  period: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: Date;
  endDate?: Date;
  technicianId?: string;
  module?: string;
}

export function getPreviousPeriodRange(filter: MetricsFilter): { startDate: Date; endDate: Date } {
  const currentRange = getDateRangeFromPeriod(filter);
  const durationMs = currentRange.endDate.getTime() - currentRange.startDate.getTime();
  
  const previousEndDate = new Date(currentRange.startDate.getTime() - 1); // 1ms before current start
  const previousStartDate = new Date(previousEndDate.getTime() - durationMs);
  
  return { startDate: previousStartDate, endDate: previousEndDate };
}

/**
 * O período escolhido na tela → filtro das métricas. Rápido ("este mês"…) e
 * personalizado chegam como `intervalo` (dias locais) e viram `custom`; os
 * presets de antes ('today', '7d'…) passam como estavam.
 */
export function filtroDoPeriodo(periodo: string, intervalo: IntervaloDeDias | null): MetricsFilter {
  if (intervalo) {
    const { inicio, fim } = intervaloEmDatas(intervalo);
    return { period: 'custom', startDate: inicio, endDate: fim };
  }
  return { period: periodo as MetricsFilter['period'] };
}

/** O recorte em dias que um filtro de métricas cobre — para abrir o "Personalizado" onde a tela estava. */
export function intervaloDoFiltro(filter: MetricsFilter): IntervaloDeDias {
  const { startDate, endDate } = getDateRangeFromPeriod(filter);
  return { de: toLocalISODate(startDate), ate: toLocalISODate(endDate) };
}

export function getDateRangeFromPeriod(filter: MetricsFilter): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate = endOfDay(now);

  switch (filter.period) {
    case 'today':
      startDate = startOfDay(now);
      break;
    case '7d':
      startDate = startOfDay(subDays(now, 7));
      break;
    case '30d':
      startDate = startOfDay(subDays(now, 30));
      break;
    case '90d':
      startDate = startOfDay(subDays(now, 90));
      break;
    case 'custom':
      startDate = filter.startDate ? startOfDay(filter.startDate) : startOfDay(subDays(now, 30));
      endDate = filter.endDate ? endOfDay(filter.endDate) : endOfDay(now);
      break;
    default:
      startDate = startOfDay(subDays(now, 30));
  }

  return { startDate, endDate };
}

export function useTicketMetrics(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['ticket-metrics', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId, filter?.module ?? 'todos'],
    queryFn: async (): Promise<TicketMetrics> => {
      let query = supabase
        .from('tickets')
        .select('*, assignee:profiles!tickets_assigned_to_fkey(full_name, email)')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const metrics: TicketMetrics = {
        total: tickets?.length || 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        chamados: [],
        slaCompliance: 0,
        avgResolutionTime: 0,
        avgFirstResponseTime: 0,
        byCategory: {},
        byPriority: {},
        byCategoryAndStatus: {},
        slaViolated: 0,
        slaViolationRate: 0,
        avgOverdueTime: 0,
        violatedByPriority: {},
        violatedByCategory: {},
      };

      if (!tickets || tickets.length === 0) return metrics;

      let slaMetCount = 0;
      let comSlaCount = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      let totalOverdueTime = 0;
      let totalFirstResponse = 0;
      let respondedCount = 0;
      const now = new Date();

      tickets.forEach((ticket) => {
        // Count by status — `closed` antigo é Resolvido (ver `@/lib/status-do-chamado`).
        if (ticket.status === 'open') metrics.open++;
        else if (ticket.status === 'in_progress') metrics.inProgress++;
        else if (contaComoResolvido(ticket.status)) metrics.resolved++;

        // Count by category
        const category = ticket.category || 'Sem categoria';
        metrics.byCategory[category] = (metrics.byCategory[category] || 0) + 1;

        // Count by category and status
        if (!metrics.byCategoryAndStatus[category]) {
          metrics.byCategoryAndStatus[category] = {};
        }
        const status = statusVisivel(ticket.status || 'open');
        metrics.byCategoryAndStatus[category][status] = (metrics.byCategoryAndStatus[category][status] || 0) + 1;

        // Count by priority
        const priority = ticket.priority || 'medium';
        metrics.byPriority[priority] = (metrics.byPriority[priority] || 0) + 1;

        // SLA: uma regra só, a mesma do período anterior. Ver `slaDoChamado`.
        const sla = slaDoChamado(ticket, now);

        metrics.chamados.push({
          id: ticket.id, ticket_number: ticket.ticket_number, title: ticket.title, status,
          priority: ticket.priority, category, created_at: ticket.created_at, assignee: ticket.assignee,
          sla_estourado: !!sla?.estourado,
        });
        if (sla) {
          comSlaCount++;
          if (sla.cumpriu) slaMetCount++;
          if (sla.estourado) {
            metrics.slaViolated++;
            totalOverdueTime += (now.getTime() - new Date(ticket.sla_due_at!).getTime()) / (1000 * 60 * 60);
            metrics.violatedByPriority[priority] = (metrics.violatedByPriority[priority] || 0) + 1;
            metrics.violatedByCategory[category] = (metrics.violatedByCategory[category] || 0) + 1;
          }
        }

        // Resolution time
        if (ticket.resolved_at && ticket.created_at) {
          const created = new Date(ticket.created_at);
          const resolved = new Date(ticket.resolved_at);
          totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          resolvedCount++;
        }

        if (ticket.first_response_at && ticket.created_at) {
          totalFirstResponse += (new Date(ticket.first_response_at).getTime() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60);
          respondedCount++;
        }
      });

      // Denominador = quem TEM prazo. Ver `slaDoChamado`: com `metrics.total`,
      // chamado sem SLA e cancelado entravam como "não cumpriu".
      metrics.slaCompliance = comSlaCount > 0 ? Math.round((slaMetCount / comSlaCount) * 100) : 0;
      metrics.avgResolutionTime = resolvedCount > 0 ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 : 0;
      metrics.avgFirstResponseTime = respondedCount > 0 ? Math.round((totalFirstResponse / respondedCount) * 10) / 10 : 0;
      metrics.slaViolationRate = comSlaCount > 0 ? Math.round((metrics.slaViolated / comSlaCount) * 100) : 0;
      metrics.avgOverdueTime = metrics.slaViolated > 0 ? Math.round((totalOverdueTime / metrics.slaViolated) * 10) / 10 : 0;

      return metrics;
    },
  });
}

export function useTicketTrends(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const dateRange = filter ? getDateRangeFromPeriod(filter) : getDateRangeFromPeriod({ period: '30d' });

  return useQuery({
    queryKey: ['ticket-trends', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId, filter?.module ?? 'todos'],
    queryFn: async (): Promise<TicketTrend[]> => {
      let query = supabase
        .from('tickets')
        .select('created_at, resolved_at, status')
        .gte('created_at', dateRange.startDate.toISOString())
        .lte('created_at', dateRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const trendMap: Record<string, TicketTrend> = {};

      // Initialize all dates in the range
      const currentDate = new Date(dateRange.startDate);
      while (currentDate <= dateRange.endDate) {
        const dateStr = toLocalISODate(currentDate);
        trendMap[dateStr] = { date: dateStr, opened: 0, resolved: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      tickets?.forEach((ticket) => {
        // Count opened
        if (ticket.created_at) {
          const openedDate = ticket.created_at.split('T')[0];
          if (trendMap[openedDate]) {
            trendMap[openedDate].opened++;
          }
        }

        // Count resolved
        if (ticket.resolved_at) {
          const resolvedDate = ticket.resolved_at.split('T')[0];
          if (trendMap[resolvedDate]) {
            trendMap[resolvedDate].resolved++;
          }
        }
      });

      const trends = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

      return trends;
    },
  });
}

export function usePreviousMetrics(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  const previousRange = filter ? getPreviousPeriodRange(filter) : getPreviousPeriodRange({ period: '30d' });

  return useQuery({
    // `module` na chave: sem ele, TI, RH e Marketing dividiam o mesmo cache do
    // período anterior, e a seta de um módulo comparava com o número de outro.
    queryKey: ['ticket-metrics-previous', tenantId, filter?.period, filter?.startDate?.toISOString(), filter?.endDate?.toISOString(), filter?.technicianId, filter?.module ?? 'todos'],
    queryFn: async (): Promise<TicketMetrics> => {
      let query = supabase
        .from('tickets')
        .select('*')
        .gte('created_at', previousRange.startDate.toISOString())
        .lte('created_at', previousRange.endDate.toISOString());

      if (filter?.technicianId) {
        query = query.eq('assigned_to', filter.technicianId);
      }
      if (filter?.module) {
        query = query.eq('module', filter.module);
      }

      const { data: tickets, error } = await query;

      if (error) throw error;

      const metrics: TicketMetrics = {
        total: tickets?.length || 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        chamados: [],
        slaCompliance: 0,
        avgResolutionTime: 0,
        avgFirstResponseTime: 0,
        byCategory: {},
        byPriority: {},
        byCategoryAndStatus: {},
        slaViolated: 0,
        slaViolationRate: 0,
        avgOverdueTime: 0,
        violatedByPriority: {},
        violatedByCategory: {},
      };

      if (!tickets || tickets.length === 0) return metrics;

      let slaMetCount = 0;
      let comSlaCount = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      // O "agora" do período ANTERIOR é o fim dele, não o relógio de hoje: um
      // chamado que naquela janela ainda estava correndo dentro do prazo cumpriu
      // o SLA daquele período. Com `new Date()` ele apareceria estourado hoje e a
      // comparação castigaria o passado por ter envelhecido.
      const fimDoPeriodo = previousRange.endDate;

      tickets.forEach((ticket) => {
        // A mesma conta do período atual: `closed` antigo é Resolvido.
        if (ticket.status === 'open') metrics.open++;
        else if (ticket.status === 'in_progress') metrics.inProgress++;
        else if (contaComoResolvido(ticket.status)) metrics.resolved++;

        const category = ticket.category || 'Sem categoria';
        metrics.byCategory[category] = (metrics.byCategory[category] || 0) + 1;

        if (!metrics.byCategoryAndStatus[category]) {
          metrics.byCategoryAndStatus[category] = {};
        }
        const status = statusVisivel(ticket.status || 'open');
        metrics.byCategoryAndStatus[category][status] = (metrics.byCategoryAndStatus[category][status] || 0) + 1;

        const priority = ticket.priority || 'medium';
        metrics.byPriority[priority] = (metrics.byPriority[priority] || 0) + 1;

        // A MESMA regra do período atual, com o relógio parado no fim desta
        // janela. Antes daqui o atual contava "ainda correndo no prazo" como
        // cumprido e este lado não, então a seta comparava regras diferentes.
        const sla = slaDoChamado(ticket, fimDoPeriodo);
        if (sla) {
          comSlaCount++;
          if (sla.cumpriu) slaMetCount++;
        }

        if (ticket.resolved_at && ticket.created_at) {
          const created = new Date(ticket.created_at);
          const resolved = new Date(ticket.resolved_at);
          totalResolutionTime += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          resolvedCount++;
        }
      });

      // Mesmo denominador do período atual: quem tem prazo.
      metrics.slaCompliance = comSlaCount > 0 ? Math.round((slaMetCount / comSlaCount) * 100) : 0;
      metrics.avgResolutionTime = resolvedCount > 0 ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 : 0;

      return metrics;
    },
  });
}

/**
 * A lista "SLA violado" do painel.
 *
 * DUAS CORREÇÕES EM 2026-09-27, as duas por a lista discordar do cartão que fica
 * ao lado dela na mesma tela:
 *
 * 1. **Cancelado e reprovado saíram.** A consulta excluía só `resolved` e
 *    `closed`, então chamado cancelado com prazo vencido entrava na lista de
 *    violações — enquanto `useTicketMetrics`, que alimenta o cartão "SLA
 *    violado", já os tratava como relógio parado. Mesma tela, dois números.
 * 2. **A lista passou a aceitar o filtro de módulo.** Ela não recebia `filter`
 *    nenhum: com o painel do RH aberto, a lista mostrava chamado de TI.
 */
export function useViolatedSlaTickets(filter?: MetricsFilter) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tickets', tenantId, 'sla-violated', filter?.module ?? 'todos'],
    queryFn: async () => {
      const now = new Date().toISOString();

      let query = supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email),
          assigned:profiles!tickets_assigned_to_fkey(id, full_name, email)
        `)
        .lt('sla_due_at', now)
        .not('status', 'in', '("resolved","closed","cancelled","rejected")');

      if (filter?.module) query = query.eq('module', filter.module);

      const { data, error } = await query.order('sla_due_at');

      if (error) throw error;
      return data || [];
    },
  });
}

// `useTicketsByStatusList` saiu em 2026-10-04: as listas do "passar o mouse" vêm de
// `TicketMetrics.chamados`, a mesma consulta que fez os números. A consulta à parte trazia só os 10
// últimos e não sabia que `closed` antigo é Resolvido — a lista podia discordar do número ao lado.
