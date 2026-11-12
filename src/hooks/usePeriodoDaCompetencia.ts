import { useQueryState } from '@/hooks/useQueryState';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { competenciaAtual, lerCompetencia } from '@/lib/competencia-comercial';
import { calcularPeriodoComercial, periodoDoPadrao, type IntervaloDeDias } from '@/lib/period';

/** O "período" padrão das telas por competência: um mês, o do seletor de competência. */
export const UM_MES = 'mes' as const;
/** O ano inteiro da competência escolhida (o "Ano" do padrão de 2026-11-12). */
export const UM_ANO = 'ano' as const;

/**
 * O recorte das telas que eram SÓ por competência (Comercial › Indicadores, Carteira, Políticas e Diretoria ›
 * Indicadores dos setores): o mês de sempre (`?competencia=`) ou um período da lista padrão (`PERIODOS_DO_COMERCIAL`:
 * últimos 3 e 6 meses, este trimestre, o ano da competência ou personalizado — `?periodo=&de=&ate=`, de
 * `usePeriodoNaUrl`). Os dois na URL, o link copiado abre no mesmo recorte.
 *
 * `intervalo` é `null` no modo "Mês": aí a tela chama o banco só com a competência, como antes. Com intervalo, a
 * competência continua indo junto (o banco a ignora) — e é dela que o "Personalizado" parte ao ser aberto.
 */
export function usePeriodoDaCompetencia() {
  const [bruta, setCompetencia] = useQueryState('competencia', competenciaAtual());
  const competencia = lerCompetencia(bruta) ?? competenciaAtual();
  const daUrl = usePeriodoNaUrl<typeof UM_MES | typeof UM_ANO | 'ultimos3' | 'ultimos6'>(UM_MES);
  const periodo = periodoDoPadrao(daUrl.periodo);
  const ano = Number(competencia.slice(0, 4));
  const intervalo: IntervaloDeDias | null = periodo === UM_MES ? null
    : periodo === UM_ANO || periodo === 'ultimos3' || periodo === 'ultimos6'
      ? calcularPeriodoComercial(periodo, ano, Number(competencia.slice(5, 7)))
      : daUrl.intervalo;
  return { competencia, setCompetencia, periodo, intervalo, escolher: daUrl.escolher, definirIntervalo: daUrl.definirIntervalo };
}

export type PeriodoDaCompetencia = ReturnType<typeof usePeriodoDaCompetencia>;
