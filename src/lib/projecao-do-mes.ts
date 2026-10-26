// A projeção do fechamento do mês (rodada 2, R6; decisões do dono de 2026-10-26): no ritmo de hoje, onde o mês termina
// contra a meta. O ritmo é o realizado dividido pelos DIAS ÚTEIS que já passaram até o último dado (a última nota
// importada ou lançada), vezes os dias úteis do mês (`com_ritmo_do_mes`). O realizado é o que a tela já mostra —
// nenhuma conta de venda é refeita aqui.

export interface RitmoDoMes { dias_uteis_mes: number; dias_uteis_ate: number; ultimo_dado: string | null }
export interface Projecao { valor: number; pctMeta: number | null; fechado: boolean }

/** `null` sem dado no mês (nenhum dia útil passou): não há ritmo para projetar. */
export function projecaoDoMes(realizado: number | null, meta: number | null, ritmo: RitmoDoMes | null | undefined): Projecao | null {
  if (realizado == null || !ritmo || ritmo.dias_uteis_ate <= 0 || ritmo.dias_uteis_mes <= 0) return null;
  const fechado = ritmo.dias_uteis_ate >= ritmo.dias_uteis_mes;
  const valor = fechado ? realizado : (realizado / ritmo.dias_uteis_ate) * ritmo.dias_uteis_mes;
  return { valor, pctMeta: meta && meta > 0 ? (valor / meta) * 100 : null, fechado };
}
