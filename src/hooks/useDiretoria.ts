import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

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

export interface ResumoSetor {
  modulo: string;
  rotulo: string;
  abertos: number;
  resolvidos: number;
  /** Quantos dos resolvidos saíram dentro do prazo. `null` = nenhum tinha prazo. */
  noPrazo: number | null;
  /** Percentual de SLA cumprido, ou `null` quando não há base para dizer. */
  sla: number | null;
  /** Horas, do abrir ao resolver. `null` = nada resolvido no período. */
  horasMedias: number | null;
  /** Abertos cujo prazo já passou — é o número que faz alguém agir hoje. */
  estourados: number;
}

export type PeriodoDiretoria = '7d' | '30d' | '90d';

const DIAS: Record<PeriodoDiretoria, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Chamados por setor no período.
 *
 * Uma consulta só, e a conta em JavaScript: sete consultas (uma por setor)
 * seriam sete idas ao banco para somar o que cabe numa. E chamar um hook dentro
 * de um laço por setor é o que as regras do React proíbem.
 */
export function useChamadosPorSetor(periodo: PeriodoDiretoria = '30d') {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretoria-chamados', tenantId, periodo],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumoSetor[]> => {
      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS[periodo]);

      const linhas = unwrap(
        await supabase.from('tickets')
          .select('module, status, created_at, resolved_at, sla_due_at')
          .gte('created_at', desde.toISOString()),
      );

      const agora = Date.now();
      return SETORES_COM_CHAMADO.map(({ modulo, rotulo }) => {
        const doSetor = linhas.filter(t => t.module === modulo);
        const abertos = doSetor.filter(t => t.status !== 'resolved' && t.status !== 'closed');
        const resolvidos = doSetor.filter(t => !!t.resolved_at);

        // SLA só se mede em quem tinha prazo: contar "sem prazo" como cumprido
        // inflaria o número, e contar como estourado puniria o setor por uma
        // política que ninguém configurou.
        const comPrazo = resolvidos.filter(t => !!t.sla_due_at);
        const noPrazo = comPrazo.length
          ? comPrazo.filter(t => new Date(t.resolved_at!) <= new Date(t.sla_due_at!)).length
          : null;

        const horas = resolvidos.map(t =>
          (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3_600_000);

        return {
          modulo,
          rotulo,
          abertos: abertos.length,
          resolvidos: resolvidos.length,
          noPrazo,
          sla: noPrazo === null ? null : Math.round((noPrazo / comPrazo.length) * 100),
          horasMedias: horas.length
            ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10
            : null,
          estourados: abertos.filter(t => t.sla_due_at && new Date(t.sla_due_at).getTime() < agora).length,
        };
      });
    },
  });
}
