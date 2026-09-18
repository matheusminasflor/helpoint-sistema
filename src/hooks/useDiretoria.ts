import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { getDateRangeFromPeriod, type MetricsFilter } from './useHelpdeskMetrics';

/**
 * Diretoria (L5) — a **visão** do diretor, não um módulo com fila própria
 * (decisão D6). Ela não tem tabela nenhuma: lê o que os outros módulos já
 * guardam. Os objetivos da empresa vêm de `useMetas`; o que está aqui é o
 * resumo de chamados por setor.
 */

/** Os módulos que têm fila de chamados — é o CHECK de `tickets.module`. */
export const SETORES_COM_CHAMADO = [
  { modulo: 'tickets', rotulo: 'TI' },
  { modulo: 'marketing', rotulo: 'Marketing' },
  { modulo: 'qualidade', rotulo: 'Qualidade' },
  { modulo: 'rh', rotulo: 'RH' },
  { modulo: 'financeiro', rotulo: 'Financeiro' },
  { modulo: 'comercial', rotulo: 'Comercial' },
  { modulo: 'educacional', rotulo: 'Educacional' },
] as const;

/**
 * "Acabou" tem **uma** definição, e é esta — a mesma de `useHelpdeskMetrics` e
 * do `DailyCuration`. Contar só `resolved` e `closed` fazia chamado cancelado
 * aparecer como aberto, e entrar na conta de atrasados que a tela apresenta
 * como "o número que pede alguma coisa hoje". Ninguém tira de lá um chamado que
 * já foi cancelado.
 */
const ENCERRADOS = ['resolved', 'closed', 'cancelled', 'rejected'];

const estaAberto = (status: string) => !ENCERRADOS.includes(status);

/**
 * Resolvido é quem **está** resolvido ou fechado. `resolved_at` sozinho não
 * serve: há chamado com status `resolved` e a data nula (existe um no banco de
 * teste), que sumia das duas colunas sem deixar rastro; e o trigger
 * `tarefa_fecha_chamado` grava `resolved_at` mesmo ao **cancelar**, o que fazia
 * a mesma linha contar como aberta e como resolvida ao mesmo tempo.
 */
const estaResolvido = (status: string) => status === 'resolved' || status === 'closed';

export interface ResumoSetor {
  modulo: string;
  rotulo: string;
  /** Abertos **hoje**, não no período: fila é uma fotografia do agora. */
  abertos: number;
  /** Resolvidos dentro do período escolhido. */
  resolvidos: number;
  /** Percentual de SLA cumprido, ou `null` quando não há base para dizer. */
  sla: number | null;
  /** Horas, do abrir ao resolver. `null` = nada resolvido no período. */
  horasMedias: number | null;
  /** Abertos cujo prazo já passou — também do agora, e não do período. */
  estourados: number;
}

export type PeriodoDiretoria = '7d' | '30d' | '90d';

/**
 * Chamados por setor.
 *
 * **Duas leituras diferentes na mesma tabela**, e confundi-las foi o defeito que
 * a auditoria pegou: "resolvidos", "no prazo" e "tempo médio" são do **período**
 * escolhido; "abertos" e "atrasados" são do **agora**. Quando os dois recortes
 * eram o mesmo, um chamado vencido há três meses sumia do painel — e em
 * "últimos 7 dias" a tela chegava a dizer "nenhum chamado no período" com sete
 * vencidos em aberto na empresa.
 *
 * Uma consulta só, e a conta em JavaScript: sete consultas (uma por setor)
 * seriam sete idas ao banco para somar o que cabe numa. E chamar um hook dentro
 * de um laço por setor é o que as regras do React proíbem.
 *
 * ponytail: teto conhecido — sem `limit`, o PostgREST corta em 1000 linhas e
 * todas as colunas encolhem **sem erro** (é a armadilha já catalogada no
 * Financeiro: número errado, não página lenta). Com ~11 chamados por dia a
 * janela de 90 dias encosta nisso. Saída: quando o volume chegar perto, a conta
 * vira uma função SQL que agrega no banco e devolve sete linhas.
 */
export function useChamadosPorSetor(periodo: PeriodoDiretoria = '30d') {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretoria-chamados', tenantId, periodo],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumoSetor[]> => {
      // A mesma conta de janela das outras telas: "últimos 7 dias" aqui tinha
      // virado uma janela rolante de 168 h enquanto no resto do sistema é do
      // começo do dia D-7. Mesmo rótulo, números diferentes.
      const { startDate } = getDateRangeFromPeriod({ period: periodo } as MetricsFilter);

      // Duas listas porque são duas perguntas: o que aconteceu no período, e o
      // que está em aberto agora — inclusive o que foi aberto antes da janela.
      const [doPeriodo, emAberto] = await Promise.all([
        (async () => unwrap(
          await supabase.from('tickets')
            .select('module, status, created_at, resolved_at, sla_due_at')
            .gte('created_at', startDate.toISOString()),
        ))(),
        (async () => unwrap(
          await supabase.from('tickets')
            .select('module, status, sla_due_at')
            .not('status', 'in', `(${ENCERRADOS.join(',')})`),
        ))(),
      ]);

      const agora = Date.now();
      return SETORES_COM_CHAMADO.map(({ modulo, rotulo }) => {
        const abertos = emAberto.filter(t => t.module === modulo && estaAberto(t.status));
        const resolvidos = doPeriodo.filter(
          t => t.module === modulo && estaResolvido(t.status) && !!t.resolved_at);

        // SLA só se mede em quem tinha prazo: contar "sem prazo" como cumprido
        // inflaria o número, e contar como estourado puniria o setor por uma
        // política que ninguém configurou.
        const comPrazo = resolvidos.filter(t => !!t.sla_due_at);
        const noPrazo = comPrazo.filter(
          t => new Date(t.resolved_at!) <= new Date(t.sla_due_at!)).length;

        const horas = resolvidos.map(t =>
          (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3_600_000);

        return {
          modulo,
          rotulo,
          abertos: abertos.length,
          resolvidos: resolvidos.length,
          sla: comPrazo.length ? Math.round((noPrazo / comPrazo.length) * 100) : null,
          horasMedias: horas.length
            ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10
            : null,
          estourados: abertos.filter(
            t => t.sla_due_at && new Date(t.sla_due_at).getTime() < agora).length,
        };
      });
    },
  });
}
