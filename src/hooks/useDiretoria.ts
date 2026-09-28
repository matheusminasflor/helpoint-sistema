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

/**
 * Rótulo de cada `tickets.module`. A LISTA de setores não mora aqui: vem do banco
 * (`dir_chamados_por_setor`), que devolve uma linha por módulo do CHECK — foi assim
 * que Compras, que faltava nesta lista, passou a aparecer.
 */
const ROTULO_DO_SETOR: Record<string, string> = {
  tickets: 'TI',
  compras: 'Compras',
  marketing: 'Marketing',
  qualidade: 'Qualidade',
  rh: 'RH',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  educacional: 'Educacional',
};

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
 * Chamados por setor, contados no banco (`dir_chamados_por_setor`, LEVA O parte 4).
 *
 * **Duas leituras diferentes na mesma tabela**: "resolvidos", "no prazo" e "tempo
 * médio" são do **período** escolhido; "abertos" e "atrasados" são do **agora**. As
 * definições (o que é encerrado, o que é resolvido, SLA só de quem tinha prazo) estão
 * comentadas na função.
 *
 * Era uma soma no navegador sobre `tickets` sem `limit`: o PostgREST corta em 1.000
 * linhas sem erro e todas as colunas encolhiam juntas. E a conta via só os chamados
 * que o RLS mostrava a quem olhava; a função, com a porta em `has_diretoria_access`,
 * conta a empresa inteira — que é a pergunta da Diretoria.
 */
export function useChamadosPorSetor(periodo: PeriodoDiretoria = '30d') {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretoria-chamados', tenantId, periodo],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumoSetor[]> => {
      // A mesma conta de janela das outras telas: do começo do dia D-7, não 168 h.
      const { startDate } = getDateRangeFromPeriod({ period: periodo } as MetricsFilter);
      const linhas = unwrap(await supabase.rpc('dir_chamados_por_setor', {
        p_inicio: startDate.toISOString(),
      }));
      return (linhas ?? []).map((l) => ({
        modulo: l.modulo,
        rotulo: ROTULO_DO_SETOR[l.modulo] ?? l.modulo,
        abertos: Number(l.abertos),
        resolvidos: Number(l.resolvidos),
        sla: l.sla,
        horasMedias: l.horas_medias === null ? null : Number(l.horas_medias),
        estourados: Number(l.estourados),
      }));
    },
  });
}

export interface IndicadorDeSetor {
  setor: 'financeiro' | 'rh' | 'compras' | 'sac' | 'marketing';
  ordem: number;
  indicador: string;
  rotulo: string;
  valor: number | null;
  formato: 'moeda' | 'numero' | 'percentual' | 'horas';
}

/**
 * Os totais de cada setor no mês (`dir_indicadores_dos_setores`). Decisão do dono,
 * 2026-09-28: "Todos, só em totais" — a função só devolve agregado, e quem tem só o
 * módulo Diretoria continua sem ler `fin_entries` e a folha linha a linha.
 */
export function useIndicadoresDosSetores(competencia: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['diretoria-indicadores-setores', tenantId, competencia],
    enabled: !!tenantId,
    queryFn: async (): Promise<IndicadorDeSetor[]> => {
      const linhas = unwrap(await supabase.rpc('dir_indicadores_dos_setores', {
        p_competencia: competencia,
      }));
      return (linhas ?? []).map((l) => ({
        setor: l.setor as IndicadorDeSetor['setor'],
        ordem: l.ordem,
        indicador: l.indicador,
        rotulo: l.rotulo,
        valor: l.valor === null ? null : Number(l.valor),
        formato: l.formato as IndicadorDeSetor['formato'],
      }));
    },
  });
}
