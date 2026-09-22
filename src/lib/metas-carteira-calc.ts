// Peso e cobertura por carteira (docs/instrucoes-painel-comercial.md §15 —
// "carteiras mês a mês ... peso de cada carteira ... linha de cobertura").
// Divisão de dois números JÁ LIDOS de `metas_carteira`/`metas_ano` — nunca
// agregação. A regra "a conta mora no banco" existe contra SOMAR linha que
// o PostgREST pode cortar; aqui não há linha para cortar, os dois lados já
// vieram inteiros do SELECT, no mesmo espírito de `src/lib/simulador-
// metas.ts` (calcularCobertura) e `src/lib/comparativoAnos.ts`. Módulo sem
// dependência — nada de `@/integrations/supabase` (regra 9 do CLAUDE.md).
//
// Regra desta leva inteira, sem exceção aqui: denominador nulo ou zero
// devolve NULO, nunca `Infinity` nem `0%`. E como `realizado` de
// `metas_carteira` é dado IMPORTADO (pode genuinamente faltar, não é soma
// que sempre existe), numerador nulo também devolve NULO — "sem dado"
// nunca se lê como "vendeu/cobriu zero".

/**
 * Peso da carteira no mês: `realizado` da carteira ÷ `total_realizado` do
 * mês (metas_ano). Nulo quando falta qualquer um dos dois lados, ou quando
 * o total do mês é zero.
 */
export function calcularPeso(realizadoCarteira: number | null, totalRealizadoMes: number | null): number | null {
  if (realizadoCarteira == null || totalRealizadoMes == null || totalRealizadoMes === 0) return null;
  return realizadoCarteira / totalRealizadoMes;
}

/**
 * Cobertura: `realizado` ÷ `meta` (de `com_metas`, por carteira, ou de
 * `metas_ano.meta`/`meta_total`, no total). Nula quando a meta é nula ou
 * zero, ou quando o realizado ainda não foi importado para aquele mês.
 */
export function calcularCobertura(realizado: number | null, meta: number | null): number | null {
  if (meta == null || meta === 0 || realizado == null) return null;
  return realizado / meta;
}
