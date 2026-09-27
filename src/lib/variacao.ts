/**
 * A variação percentual contra um período anterior — quando o valor comparado
 * **pode ser negativo**.
 *
 * POR QUE EXISTE (2026-09-27). O Financeiro calculava isto dividindo pelo
 * anterior **com sinal**. Saldo realizado é recebido menos pago, então um mês de
 * prejuízo é negativo, e sair de −1.000 para +500 devolvia **−150%**: seta para
 * baixo, vermelho, "piorou" — para uma empresa que acabou de sair do prejuízo
 * para o lucro. O número não estava só feio; estava com o sinal trocado, que é a
 * única coisa que alguém lê num indicador.
 *
 * A correção é dividir pelo **módulo** do anterior. A distância continua a mesma;
 * o sinal passa a dizer a direção, que é o que a seta promete.
 *
 * `IndicatorsView.tsx` tem uma conta parecida e **não** usa esta função, de
 * propósito: lá os valores são contagens de chamado, que não ficam negativas, e
 * as duas discordam sobre anterior igual a zero — aqui isso é "sem base
 * anterior" (nulo), lá é 100%. Unificar as duas mudaria a tela de TI sem pedido.
 */
export function variacaoPercentual(atual: number, anterior: number | undefined | null): number | null {
  if (anterior === undefined || anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
}
