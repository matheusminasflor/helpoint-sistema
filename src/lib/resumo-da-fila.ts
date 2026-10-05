// O RESUMO NO TOPO DA FILA DE CHAMADOS (decisão do dono, 2026-10-04).
//
// Antes dizia a qualquer pessoa "Você tem 2 chamados pendentes, sendo 1 crítico" contando a fila do
// SETOR inteiro — o dono, gestor do Marketing, lia como se os chamados da Gislene e da Merilyn
// fossem dele. Agora são duas falas:
//   * quem GERE a fila (pode transferir chamado para outra pessoa no perfil do setor; dono e
//     administrador também) vê o setor: quantos pendentes, críticos, com prazo vencido e sem
//     responsável — e quantos são dele;
//   * quem ATENDE vê só o que está com ele (revisão de 2026-10-05: nada da fila sem dono).
// O "comece por" é o mais urgente do que a pessoa olha (`ordenarPorUrgencia`). O gestor recebe a
// fila do SETOR inteira, não o recorte da aba aberta.
import { getSLATimeRemaining, type TicketWithDetails } from '@/types/helpdesk';
import { ordenarPorUrgencia } from '@/lib/fila-de-chamados';

export interface ResumoDaFila {
  pendentes: number;
  criticos: number;
  vencidos: number;
  semResponsavel: number;
  meus: number;
  meusCriticos: number;
  meusVencidos: number;
  /** O chamado para começar: o mais urgente do setor (gestor) ou dos meus. */
  comecePor: TicketWithDetails | null;
  comecePorVencido: boolean;
}

const vencido = (t: TicketWithDetails) => {
  const s = getSLATimeRemaining(t.sla_due_at, t);
  return s.isOverdue && !s.isFrozen;
};

export function resumoDaFila(chamados: TicketWithDetails[], meuId: string | undefined, gestor: boolean): ResumoDaFila {
  const meus = chamados.filter(t => !!meuId && t.assigned_to === meuId);
  const semResponsavel = chamados.filter(t => !t.assigned_to);
  const olhando = gestor ? chamados : meus;
  const comecePor = ordenarPorUrgencia(olhando)[0] ?? null;
  return {
    pendentes: chamados.length,
    criticos: chamados.filter(t => t.priority === 'critical').length,
    vencidos: chamados.filter(vencido).length,
    semResponsavel: semResponsavel.length,
    meus: meus.length,
    meusCriticos: meus.filter(t => t.priority === 'critical').length,
    meusVencidos: meus.filter(vencido).length,
    comecePor,
    comecePorVencido: !!comecePor && vencido(comecePor),
  };
}

/** "1 chamado" / "2 chamados" — o resumo fala com gente. */
export const contagem = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
