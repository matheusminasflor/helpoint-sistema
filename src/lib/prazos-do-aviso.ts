// O aviso que abre ao entrar no sistema ou atualizar a página (dono, 2026-10-15: "abrir POP-UP quando o usuário
// logar ou atualizar a página quando tiver chamados pendentes com SLA prestes a vencer ou vencido; aparecer apenas
// para quem tem; mensagem clara e objetiva"). Função pura: dos chamados que a pessoa atende, os que pedem atenção.
//   * vencido: o prazo de resolução já passou;
//   * vence logo: vence nas próximas 24 horas;
//   * 1ª resposta: ainda sem 1ª resposta e o prazo dela passou ou vence nas próximas 24 horas.
// Prazo pausado (Pendente, Aguardando aprovação, Agendado) e chamado encerrado não entram — exceto o agendado com o
// prazo já vencido, que continua atrasado (2026-10-15).

export interface ChamadoDoAviso {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  sla_due_at: string | null;
  first_response_due_at: string | null;
  first_response_at: string | null;
  /** Agendado com o prazo já vencido: o atraso continua contando (20270115010000). */
  agendou_vencido?: boolean;
}

export type Motivo = 'vencido' | 'vence_logo' | 'primeira_resposta';
export interface ItemDoAviso { chamado: ChamadoDoAviso; motivo: Motivo; quando: Date }

const PAUSADO_OU_FECHADO = new Set(['waiting_user', 'waiting_parts', 'scheduled', 'resolved', 'closed', 'cancelled', 'rejected']);
const DIA = 24 * 60 * 60 * 1000;

export function prazosQuePedemAtencao(chamados: ChamadoDoAviso[], agora: Date): ItemDoAviso[] {
  const itens: ItemDoAviso[] = [];
  for (const c of chamados) {
    if (PAUSADO_OU_FECHADO.has(c.status) && !(c.status === 'scheduled' && c.agendou_vencido)) continue;
    const prazo = c.sla_due_at ? new Date(c.sla_due_at) : null;
    const resposta = !c.first_response_at && c.first_response_due_at ? new Date(c.first_response_due_at) : null;
    if (prazo && prazo <= agora) itens.push({ chamado: c, motivo: 'vencido', quando: prazo });
    else if (resposta && resposta.getTime() - agora.getTime() <= DIA) itens.push({ chamado: c, motivo: 'primeira_resposta', quando: resposta });
    else if (prazo && prazo.getTime() - agora.getTime() <= DIA) itens.push({ chamado: c, motivo: 'vence_logo', quando: prazo });
  }
  const ordem: Record<Motivo, number> = { vencido: 0, primeira_resposta: 1, vence_logo: 2 };
  return itens.sort((a, b) => ordem[a.motivo] - ordem[b.motivo] || a.quando.getTime() - b.quando.getTime());
}
