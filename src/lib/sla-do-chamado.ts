// O SLA de um chamado — saiu de `useHelpdeskMetrics` (2026-11-02) para a linha das últimas semanas usar a mesma
// regra e poder ser testada sem a conexão com o banco.
import { SLA_PAUSED_STATUSES } from '@/types/helpdesk';

/** Status em que o relógio do SLA parou de correr. */
export const SLA_PARADO = ['resolved', 'closed', 'cancelled', 'rejected'];

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
export function slaDoChamado(
  ticket: { sla_due_at?: string | null; resolved_at?: string | null; status?: string | null; agendou_vencido?: boolean | null },
  agora: Date,
): { cumpriu: boolean; estourado: boolean } | null {
  if (!ticket.sla_due_at) return null;

  const prazo = new Date(ticket.sla_due_at);
  // Marco final do SLA = resolved_at. Nunca closed_at/updated_at.
  const resolvido = ticket.resolved_at ? new Date(ticket.resolved_at) : null;
  const correndo = !SLA_PARADO.includes(ticket.status ?? 'open');

  if (resolvido) return { cumpriu: resolvido <= prazo, estourado: false };
  // Pendente = prazo pausado esperando o solicitante (dono, 2026-10-06): não estoura enquanto
  // espera; ao sair, o banco empurra o vencimento pelo tempo útil parado (20261210010000).
  // Agendado (2026-10-07) é a mesma pausa, até a data marcada.
  // Exceção (2026-10-15; 20270115010000): agendado com o prazo JÁ vencido continua atrasado — agendar não apaga o atraso.
  if (ticket.status === 'scheduled' && ticket.agendou_vencido) return { cumpriu: false, estourado: agora > prazo };
  if ((SLA_PAUSED_STATUSES as readonly string[]).includes(ticket.status ?? '')) return { cumpriu: true, estourado: false };
  // Sem resolução: só o que ainda corre tem veredito. Cancelado e reprovado sem
  // resolução não cumpriram nem violaram — o relógio parou sem entrega.
  if (!correndo) return { cumpriu: false, estourado: false };
  return { cumpriu: agora <= prazo, estourado: agora > prazo };
}
