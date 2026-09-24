// A conta do simulador de metas (§15 do docs/instrucoes-painel-comercial.md,
// "Simulador de metas"). Ver .scratch/plano-l6e-simulador-e-tendencia.md
// §1.2/§1.3/§1.4.
//
// Mora aqui, e NUNCA dentro do componente, apesar de ser o único lugar desta
// sequência de levas em que a conta fica legitimamente no navegador: é
// aritmética sobre doze valores que o diretor está digitando, ainda não
// salvos — não agregação de linhas do banco. Mas ainda é regra, e regra tem
// teste (Vitest). Sem import de `@/integrations/supabase` — para o CI (sem
// `.env`) não morrer em "supabaseUrl is required" (regra 9 do CLAUDE.md,
// mesmo motivo de `src/lib/acesso-diretoria.ts`). `./metas-carteira-calc` é
// seguro de importar aqui: também não tem dependência nenhuma.
//
// `fechados[i]` vem de `mesesFechados` (`@/lib/comparativoAnos`) — quem
// chama já tem essa função; não duplicamos aqui.
import { calcularCobertura as calcularCoberturaEscalar } from './metas-carteira-calc';

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
  realizadoAnoAtual: Array<number | null>,
  realizadoAnoAnterior: Array<number | null>,
  fechados: boolean[],
): ProjecoesSimulador {
  const metaDoAno = metas.reduce((soma, v) => soma + v, 0);

  let realizadoAcumulado = 0;
  let mesesFechadosCount = 0;
  let mesesAbertosCount = 0;
  for (let mes = 0; mes < 12; mes++) {
    if (fechados[mes]) {
      // Correção da auditoria (achado GRAVE, 2026-09-22): mês fechado SEM
      // DADO sai da conta e do divisor — com `?? 0` a média realizada caía
      // de 425.394,98 para 372.220,60 com o JSON real (agosto/2026 fechado,
      // mas ainda sem dado no HISTORICO_METAS.json).
      const valor = realizadoAnoAtual[mes];
      if (valor != null) {
        realizadoAcumulado += valor;
        mesesFechadosCount++;
      }
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
    if (!fechados[mes]) {
      const valor = realizadoAnoAnterior[mes];
      if (valor != null) projecaoRepetindoAnoAnterior += valor;
    }
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
 * Cobertura do §15 ("linha de cobertura"): realizado ÷ meta. Aqui é sobre a
 * meta SIMULADA (`metas`, ainda não salva) mês a mês e no ano, não a
 * gravada — mas a REGRA da divisão (nulo quando falta um dos dois lados ou
 * quando a meta é zero) é uma só, `calcularCobertura` de
 * `src/lib/metas-carteira-calc.ts`, chamada aqui por dentro. Item 6.1 da
 * correção da auditoria de 2026-09-22: antes da correção do achado GRAVE
 * (item 1), esta função tinha sua PRÓPRIA cópia da regra com `?? 0` — as
 * duas só passaram a tratar `null` do mesmo jeito depois daquela correção,
 * e é aí que copiar deixa de ser seguro (a próxima pessoa que mudar uma
 * esquece da outra). Renomeada para não colidir com a de `metas-carteira-
 * calc.ts` — os nomes iguais, com formas diferentes (array × escalar), já
 * causaram confusão.
 */
export interface CoberturaSimulador {
  /** Mês a mês (índice 0 = janeiro). Nula no mês sem meta simulada (campo zerado) — nunca divisão por zero. */
  mensal: (number | null)[];
  /** Acumulada no ano: soma do realizado ÷ meta do ano. Nula quando a meta do ano é zero. Pode passar de 100% — aparece, nunca truncada. */
  acumulada: number | null;
}

export function calcularCoberturaSimulada(metas: number[], realizado: Array<number | null>): CoberturaSimulador {
  const mensal = metas.map((meta, i) => calcularCoberturaEscalar(realizado[i], meta));
  const metaDoAno = metas.reduce((soma, v) => soma + v, 0);
  const realizadoAcumulado = realizado.reduce<number | null>(
    (soma, v) => (v == null ? soma : (soma ?? 0) + v),
    null,
  );
  return {
    mensal,
    acumulada: calcularCoberturaEscalar(realizadoAcumulado, metaDoAno),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Frente 7b (.scratch/plano-frente7b-metas-reais-e-simulador.md §2 e §3): o
// simulador passa a simular carteira a carteira, e a meta pode ser definida
// por PERCENTUAL — o diretor diz "120%" e o sistema aplica sobre o realizado
// da MESMA carteira no MESMO mês do ano anterior (nunca o ano dividido por
// doze: a sazonalidade da Minasflor é forte demais para isso). As duas
// funções abaixo são as regras puras dessa leva — sem acesso a banco, como
// todo o resto deste arquivo.
// ═══════════════════════════════════════════════════════════════════════════

/** O resultado de aplicar um percentual sobre o realizado do ano anterior, mês a mês. */
export interface MetaPorPercentualResultado {
  /** 12 posições (índice 0 = janeiro). Nulo no mês sem base — nunca zero, nunca inventada. */
  metas: Array<number | null>;
  /** Quantos dos 12 meses ficaram sem base (para a tela avisar o diretor). */
  mesesSemBase: number;
}

/**
 * `percentual` já na escala "120" (não "1.20"): a tela mostra e o diretor
 * digita em pontos percentuais. Mês sem realizado no ano anterior (`null`)
 * fica NULO aqui também — `?? 0` inventaria uma base que não existe, e é
 * exatamente essa a leitura errada que a mutação abaixo prova.
 */
export function calcularMetaPorPercentual(
  percentual: number,
  realizadoAnoAnterior: Array<number | null>,
): MetaPorPercentualResultado {
  let mesesSemBase = 0;
  const metas = realizadoAnoAnterior.map((base) => {
    if (base == null) {
      mesesSemBase++;
      return null;
    }
    return base * (percentual / 100);
  });
  return { metas, mesesSemBase };
}

/** Uma carteira (ou o total da empresa, `carteira: null`) entrando no resumo do que vai ser gravado. */
export interface ItemResumoAtualizacao {
  carteira: string | null;
  /** A meta hoje salva em `com_metas`, mês a mês — 0 no mês sem linha (nunca grava, nunca diverge do que já era 0 lido). */
  atuais: number[];
  /** A meta proposta pela simulação, mês a mês. Nulo onde a simulação não tem valor para propor (percentual sem base) — mês que fica como estava. */
  propostos: Array<number | null>;
}

/** O tamanho do que vai ser gravado, para mostrar ANTES do diretor confirmar (§3: "48 escritas" precisa aparecer, não só acontecer). */
export interface ResumoAtualizacao {
  /** Quantas células (carteira × mês) realmente vão mudar — não conta mês cujo valor proposto é igual ao já salvo. */
  meses: number;
  /** Nomes das carteiras ("Total da empresa" para `carteira: null`) que têm ao menos um mês mudando. */
  carteiras: string[];
  /** Soma dos doze meses de cada carteira afetada, hoje. */
  totalAntes: number;
  /** A mesma soma, depois da gravação proposta. */
  totalDepois: number;
}

export function calcularResumoAtualizacao(itens: ItemResumoAtualizacao[]): ResumoAtualizacao {
  let meses = 0;
  const carteiras: string[] = [];
  let totalAntes = 0;
  let totalDepois = 0;

  for (const item of itens) {
    let algumMesMudou = false;
    for (let i = 0; i < 12; i++) {
      const atual = item.atuais[i];
      const proposto = item.propostos[i];
      totalAntes += atual;
      const muda = proposto != null && proposto !== atual;
      if (muda) {
        meses++;
        algumMesMudou = true;
        totalDepois += proposto;
      } else {
        totalDepois += atual;
      }
    }
    if (algumMesMudou) carteiras.push(item.carteira ?? 'Total da empresa');
  }

  return { meses, carteiras, totalAntes, totalDepois };
}
