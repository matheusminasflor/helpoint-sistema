import { useQueryState } from '@/hooks/useQueryState';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { competenciaAtual, lerCompetencia } from '@/lib/competencia-comercial';

/** O "período" padrão das telas por competência: um mês, o do seletor de competência. */
export const UM_MES = 'mes' as const;

/**
 * O recorte das telas que eram SÓ por competência (Comercial › Indicadores e Diretoria ›
 * Indicadores dos setores): o mês de sempre (`?competencia=`) ou, desde 2026-10-03, um
 * período — "Este mês", "Este trimestre", "Este ano" ou "Personalizado" (`?periodo=&de=&ate=`,
 * de `usePeriodoNaUrl`). Os dois na URL, o link copiado abre no mesmo recorte.
 *
 * `intervalo` é `null` no modo "um mês": aí a tela chama o banco só com a competência, como
 * antes. Com intervalo, a competência continua indo junto (o banco a ignora) — e é dela que o
 * "Personalizado" parte ao ser aberto.
 */
export function usePeriodoDaCompetencia() {
  const [bruta, setCompetencia] = useQueryState('competencia', competenciaAtual());
  const competencia = lerCompetencia(bruta) ?? competenciaAtual();
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<typeof UM_MES>(UM_MES);
  return { competencia, setCompetencia, periodo, intervalo, escolher, definirIntervalo };
}

export type PeriodoDaCompetencia = ReturnType<typeof usePeriodoDaCompetencia>;
