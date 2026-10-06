// A PRIMEIRA RESPOSTA DO CHAMADO (decisão do dono, 2026-10-06): o segundo relógio, ao lado do de
// resolução. O banco grava `first_response_at` na primeira resposta pública da equipe (ou ao assumir)
// e calcula `first_response_due_at` em minutos úteis (migration 20261207010000). Aqui mora a leitura
// — um lugar só para o chamado e para os Indicadores.
import { format } from 'date-fns';
import { getSLATimeRemaining } from '@/types/helpdesk';

export interface ChamadoComPrimeiraResposta {
  status?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  first_response_at?: string | null;
  first_response_due_at?: string | null;
}

const PARADO = ['resolved', 'closed', 'cancelled', 'rejected'];

const duracao = (ms: number) => {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? `${min}min` : min < 1440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`;
};

/**
 * O veredito para os Indicadores. Sem prazo: `null` (fica fora da conta). Encerrado sem resposta: a
 * entrega vale como resposta (resolver É responder); cancelado sem nada não tem veredito.
 */
export function primeiraRespostaDoChamado(
  t: ChamadoComPrimeiraResposta, agora: Date,
): { cumpriu: boolean; estourado: boolean } | null {
  if (!t.first_response_due_at) return null;
  const prazo = new Date(t.first_response_due_at);
  const marco = t.first_response_at ?? t.resolved_at ?? null;
  if (marco) return { cumpriu: new Date(marco) <= prazo, estourado: false };
  if (PARADO.includes(t.status ?? 'open')) return null;
  return { cumpriu: agora <= prazo, estourado: agora > prazo };
}

/** O texto da linha "1ª resposta" no chamado. */
export function rotuloDaPrimeiraResposta(t: ChamadoComPrimeiraResposta): { texto: string; atrasada: boolean } | null {
  if (!t.first_response_due_at) return null;
  const prazo = new Date(t.first_response_due_at);
  const marco = t.first_response_at ?? null;
  if (marco) {
    const quando = new Date(marco);
    const atraso = quando.getTime() - prazo.getTime();
    return {
      texto: `respondida às ${format(quando, 'HH:mm')}${atraso > 0 ? ` (com atraso de ${duracao(atraso)})` : ' (no prazo)'}`,
      atrasada: atraso > 0,
    };
  }
  if (PARADO.includes(t.status ?? 'open')) return { texto: 'sem resposta registrada', atrasada: false };
  // Correndo: o mesmo texto do prazo de resolução ("2h restantes", "40min em atraso").
  const s = getSLATimeRemaining(t.first_response_due_at, { status: 'open', created_at: t.created_at });
  return { texto: s.label, atrasada: s.isOverdue };
}
