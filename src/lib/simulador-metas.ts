// A conta do simulador de metas (§15 do docs/instrucoes-painel-comercial.md,
// "Simulador de metas"). Ver .scratch/plano-l6e-simulador-e-tendencia.md
// §1.2/§1.3/§1.4.
//
// Mora aqui, e NUNCA dentro do componente, apesar de ser o único lugar desta
// sequência de levas em que a conta fica legitimamente no navegador: é
// aritmética sobre doze valores que o diretor está digitando, ainda não
// salvos — não agregação de linhas do banco. Mas ainda é regra, e regra tem
// teste (Vitest). Módulo sem import — nada de `@/integrations/supabase` —
// para o CI (sem `.env`) não morrer em "supabaseUrl is required" (regra 9 do
// CLAUDE.md, mesmo motivo de `src/lib/acesso-diretoria.ts`).
//
// `fechados[i]` vem de `mesesFechados` (`@/lib/comparativoAnos`) — quem
// chama já tem essa função; não duplicamos aqui.

/** As cinco projeções do §15, mais o total anual (que o documento lista junto, mas é soma, não projeção). */
export interface ProjecoesSimulador {
  /** M — a soma dos doze campos simulados. */
  metaDoAno: number;
  /** M − R. Pode ser negativo — significa que já passou da meta; mostra-se o negativo, nunca zerado. */
  quantoFalta: number;
  /** (M − R) / A. Nulo quando A = 0 (ano fechado) — nunca divisão por zero. */
  necessarioPorMesAbertos: number | null;
  /** necessarioPorMesAbertos / (R / F). Nulo quando F = 0 ou R = 0. 1,0 = manter o ritmo; 1,5 = vender 50% a mais por mês. */
  esforcoSobreMediaRealizada: number | null;
  /** (R / F) × 12. Nulo quando F = 0 (ano inteiro aberto, sem realizado para projetar). */
  projecaoRitmoAtual: number | null;
  /** R + a soma do realizado do ano anterior nos meses que aqui estão abertos. */
  projecaoRepetindoAnoAnterior: number;
}

/**
 * Calcula as cinco projeções + o total anual sobre os doze valores
 * simulados (`metas`) e o realizado real do ano atual e do ano anterior.
 * Os quatro arrays têm 12 posições (índice 0 = janeiro).
 */
export function calcularProjecoes(
  metas: number[],
  realizadoAnoAtual: number[],
  realizadoAnoAnterior: number[],
  fechados: boolean[],
): ProjecoesSimulador {
  const metaDoAno = metas.reduce((soma, v) => soma + v, 0);

  let realizadoAcumulado = 0;
  let mesesFechadosCount = 0;
  let mesesAbertosCount = 0;
  for (let mes = 0; mes < 12; mes++) {
    if (fechados[mes]) {
      realizadoAcumulado += realizadoAnoAtual[mes] ?? 0;
      mesesFechadosCount++;
    } else {
      mesesAbertosCount++;
    }
  }

  const quantoFalta = metaDoAno - realizadoAcumulado;
  const necessarioPorMesAbertos = mesesAbertosCount === 0 ? null : quantoFalta / mesesAbertosCount;
  const mediaRealizada = mesesFechadosCount === 0 ? null : realizadoAcumulado / mesesFechadosCount;
  const esforcoSobreMediaRealizada =
    necessarioPorMesAbertos === null || mediaRealizada === null || mediaRealizada === 0
      ? null
      : necessarioPorMesAbertos / mediaRealizada;
  const projecaoRitmoAtual = mediaRealizada === null ? null : mediaRealizada * 12;

  let projecaoRepetindoAnoAnterior = realizadoAcumulado;
  for (let mes = 0; mes < 12; mes++) {
    if (!fechados[mes]) projecaoRepetindoAnoAnterior += realizadoAnoAnterior[mes] ?? 0;
  }

  return {
    metaDoAno,
    quantoFalta,
    necessarioPorMesAbertos,
    esforcoSobreMediaRealizada,
    projecaoRitmoAtual,
    projecaoRepetindoAnoAnterior,
  };
}

/**
 * Distribui um total anual pelos meses ABERTOS, preservando o que já está
 * nos meses fechados (§1.4): cada mês aberto recebe
 * `(total − metas dos meses fechados) / meses abertos`. Em CENTAVOS, com a
 * sobra no ÚLTIMO mês aberto — a soma dos doze bate exatamente com o total
 * pedido, sem centavo perdido por ponto flutuante.
 *
 * `null` quando não há mês aberto (ano fechado) ou quando o total pedido já
 * foi alcançado (ou superado) só com os meses fechados — quem chamou avisa
 * o diretor, esta função nunca distribui um valor negativo.
 */
export function distribuirMetaAnual(
  totalAnual: number,
  metasAtuais: number[],
  fechados: boolean[],
): number[] | null {
  const somaFechados = metasAtuais.reduce((soma, valor, i) => soma + (fechados[i] ? valor : 0), 0);
  const restante = totalAnual - somaFechados;
  const indicesAbertos = fechados.reduce<number[]>((acc, fechado, i) => (fechado ? acc : [...acc, i]), []);

  if (indicesAbertos.length === 0 || restante <= 0) return null;

  const restanteCentavos = Math.round(restante * 100);
  const porMesCentavos = Math.floor(restanteCentavos / indicesAbertos.length);
  const sobraCentavos = restanteCentavos - porMesCentavos * indicesAbertos.length;
  const ultimoAberto = indicesAbertos[indicesAbertos.length - 1];

  return metasAtuais.map((valorAtual, i) => {
    if (fechados[i]) return valorAtual;
    const centavos = porMesCentavos + (i === ultimoAberto ? sobraCentavos : 0);
    return centavos / 100;
  });
}

/**
 * Cobertura do §15 ("linha de cobertura"): realizado ÷ meta — a MESMA
 * definição de `com_metas_x_realizado`/`com_metas_x_realizado_ano` no banco
 * (migration 20261017040000), nunca uma segunda regra em TypeScript. Aqui é
 * sobre a meta SIMULADA (`valores`, ainda não salva), não a gravada.
 */
export interface CoberturaSimulador {
  /** Mês a mês (índice 0 = janeiro). Nula no mês sem meta simulada (campo zerado) — nunca divisão por zero. */
  mensal: (number | null)[];
  /** Acumulada no ano: soma do realizado ÷ meta do ano. Nula quando a meta do ano é zero. Pode passar de 100% — aparece, nunca truncada. */
  acumulada: number | null;
}

export function calcularCobertura(metas: number[], realizado: number[]): CoberturaSimulador {
  const mensal = metas.map((meta, i) => (meta === 0 ? null : (realizado[i] ?? 0) / meta));
  const metaDoAno = metas.reduce((soma, v) => soma + v, 0);
  const realizadoAcumulado = realizado.reduce((soma, v) => soma + (v ?? 0), 0);
  return {
    mensal,
    acumulada: metaDoAno === 0 ? null : realizadoAcumulado / metaDoAno,
  };
}
