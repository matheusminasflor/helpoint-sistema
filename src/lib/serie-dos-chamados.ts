// A linha das últimas semanas (Indicadores da TI, rodada 2, 2026-11-02). Cada número do topo ganha a linha dos últimos
// períodos do MESMO tamanho do filtro (na "Semana passada", as 8 semanas que acabam nela). As contas são as de
// `useTicketMetrics` — `slaDoChamado`, `primeiraRespostaDoChamado`, tempo médio da abertura à resolução —, então o
// último ponto é o número do cartão. A busca no banco é `useSerieDosChamados`.
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { primeiraRespostaDoChamado } from '@/lib/primeira-resposta';
import { slaDoChamado } from '@/lib/sla-do-chamado';
import { contaComoResolvido } from '@/lib/status-do-chamado';

export interface ChamadoDaSerie {
  created_at: string;
  resolved_at: string | null;
  status: string | null;
  sla_due_at: string | null;
  agendou_vencido?: boolean | null;
  first_response_at?: string | null;
  first_response_due_at?: string | null;
}

export interface PontoDaSerie { total: number; sla: number | null; primeira: number | null; tempo: number | null; resolvidos: number }

/** `inicios` em ordem; cada período vai do seu início ao início do próximo (o último, até `fim`). */
export function serieDosChamados(chamados: ChamadoDaSerie[], inicios: Date[], fim: Date, agora: Date): PontoDaSerie[] {
  return inicios.map((de, i) => {
    const ate = inicios[i + 1] ?? fim;
    const doPeriodo = chamados.filter((c) => { const t = new Date(c.created_at); return t >= de && t < ate; });
    const sla = doPeriodo.map((c) => slaDoChamado(c, agora)).filter((s): s is NonNullable<typeof s> => !!s);
    const resposta = doPeriodo.map((c) => primeiraRespostaDoChamado(c, agora)).filter((s): s is NonNullable<typeof s> => !!s);
    const resolvidos = doPeriodo.filter((c) => c.resolved_at);
    const horas = resolvidos.reduce((a, c) => a + (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 3_600_000, 0);
    return {
      total: doPeriodo.length,
      sla: sla.length ? Math.round((sla.filter((s) => s.cumpriu).length / sla.length) * 100) : null,
      primeira: resposta.length ? Math.round((resposta.filter((s) => s.cumpriu).length / resposta.length) * 100) : null,
      tempo: resolvidos.length ? Math.round((horas / resolvidos.length) * 10) / 10 : null,
      resolvidos: doPeriodo.filter((c) => contaComoResolvido(c.status)).length,
    };
  });
}

/** Os inícios dos `n` períodos do tamanho do recorte da tela, o último sendo o dele; `fim` é exclusivo. */
export function iniciosDaSerie({ startDate, endDate }: { startDate: Date; endDate: Date }, n: number): { inicios: Date[]; fim: Date } {
  const dias = Math.round((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / 86_400_000);
  const inicios = Array.from({ length: n }, (_, i) => startOfDay(subDays(startDate, dias * (n - 1 - i))));
  return { inicios, fim: new Date(endOfDay(endDate).getTime() + 1) };
}
