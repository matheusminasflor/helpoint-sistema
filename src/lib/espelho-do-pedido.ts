// O leitor do espelho do pedido do Forteplus (LEVA S, parte 4) — o `espelho.js` do sistema antigo
// (`docs/manual-checklist-pedidos.md`, §9), portado e testado. Esta é a parte PURA: recebe o texto
// do PDF com as posições e devolve o pedido. Abrir o PDF é `espelho-pdf.ts`.
//
// O que o manual exige, e mora aqui:
//   * duas conferências independentes, as duas obrigatórias, com tolerância de R$ 0,02 — a soma dos
//     itens bate com o TOTAL (bruto), e o bruto menos o desconto bate com o TOTAL LÍQUIDO. Se uma
//     falha, NADA é importado: "importar valor errado é pior do que digitar à mão" (§9.5);
//   * a soma dos itens é comparada com o BRUTO, nunca com o líquido — o erro histórico do §9.5;
//   * espelho de outro cliente é recusado, nomeando os dois códigos (§9.7).
//
// Medido em 2026-09-29 com 4 espelhos reais (venda MF, venda INBRAS com desconto, publicidade e
// bonificação): todos no layout "Pedido IV" (Cód · Produto · Fabricante · Qnt · Vlr. unitário ·
// Desconto · Total), quantidade com três casas ("4,000"), a descrição às vezes quebrando para a
// linha de baixo. O "Pedido I" (com NCM) vem do sistema antigo e não tinha arquivo real para provar.

export interface TextoNaPagina {
  str: string;
  x: number;
  y: number;
  /** Largura do trecho, quando o PDF informa. */
  w?: number;
}

export interface ItemDoEspelho {
  codigo: string;
  descricao: string;
  qtd: number;
  unit: number;
  desconto: number;
  total: number;
}

export interface LeituraDoEspelho {
  itens: ItemDoEspelho[];
  soma: number;
  bruto: number | null;
  desconto: number;
  liquido: number | null;
  st: number;
  pedido: string | null;
  cliente: string | null;
  filial: 'MF' | 'INBRAS' | null;
  somaBate: boolean;
  descontoBate: boolean;
}

/**
 * Reconstrói as linhas: agrupa os trechos por altura (`y / 3`), de cima para baixo, e junta cada
 * linha da esquerda para a direita com espaço duplo onde há um vão — é o vão que separa as colunas.
 */
export function linhasDoPdf(paginas: TextoNaPagina[][]): string[] {
  const linhas: string[] = [];
  for (const itens of paginas) {
    const porY = new Map<number, TextoNaPagina[]>();
    for (const it of itens) {
      if (!it.str.trim()) continue;
      const chave = Math.round(it.y / 3);
      porY.set(chave, [...(porY.get(chave) ?? []), it]);
    }
    for (const [, grupo] of [...porY].sort((a, b) => b[0] - a[0])) {
      grupo.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim: number | null = null;
      for (const it of grupo) {
        if (fim !== null && it.x - fim > 4) texto += '  ';
        texto += it.str;
        fim = it.x + (it.w ?? 0);
      }
      linhas.push(texto.replace(/\s+/g, ' ').trim());
    }
  }
  return linhas;
}

/** "1.375,45" → 1375.45; "4,000" → 4. */
const numero = (t: string) => Number.parseFloat(t.replace(/\./g, '').replace(',', '.'));
const centavos = (n: number) => Math.round(n * 100) / 100;

// Pedido I: Cód · Produto · NCM · %ICMS · Quant · UN · Vlr.unit · Total
const PEDIDO_I = /^(\d{1,6})\s+(.+?)\s+(\d{8})\s+[\d.,]+\s+([\d.,]+)\s+UN\s+([\d.,]+)\s+([\d.,]+)/;
// Pedido IV: Cód · Produto · [MINASFL…] · Qnt · R$ unit · R$ desconto · R$ total
const PEDIDO_IV = /^(\d{1,6})\s+(.+?)\s+(?:MINASFL\w*\s+)?([\d.,]+)\s+R\$\s?([\d.,]+)\s+R\$\s?([\d.,]+)\s+R\$\s?([\d.,]+)/;

export function lerEspelho(linhas: string[]): LeituraDoEspelho {
  const itens: ItemDoEspelho[] = [];

  for (let k = 0; k < linhas.length; k++) {
    const l = linhas[k];
    let m = PEDIDO_I.exec(l);
    if (m) {
      const [, codigo, descricao, , qtd, unit, total] = m;
      itens.push({ codigo, descricao: descricao.trim(), qtd: numero(qtd), unit: numero(unit), desconto: 0, total: numero(total) });
      continue;
    }
    m = PEDIDO_IV.exec(l);
    if (m) {
      const [, codigo, descricao, qtd, unit, desconto, total] = m;
      let q = numero(qtd);
      // Defeito conhecido do Pedido IV (§9.3): a quantidade às vezes quebra — "10,00" numa linha e
      // "0" na seguinte. Com duas casas, olha até duas linhas adiante.
      if (/^\d+,\d{2}$/.test(qtd)) {
        for (const seguinte of [linhas[k + 1], linhas[k + 2]]) {
          if (!seguinte) continue;
          const m2 = /^(?:OR\s*)?(\d{1,3})$/.exec(seguinte.trim());
          if (m2) { q = numero(qtd + m2[1]); break; }
          if (!/^OR$/.test(seguinte.trim())) break;
        }
      }
      itens.push({ codigo, descricao: descricao.trim(), qtd: q, unit: numero(unit), desconto: numero(desconto), total: numero(total) });
    }
  }

  const texto = linhas.join('\n');
  const pega = (re: RegExp) => re.exec(texto)?.[1] ?? null;

  // "TOTAL:" só com R$ logo depois — "PESO TOTAL:" não tem cifrão (§9.4).
  const brutoTxt = pega(/\bTOTAL:\s*R\$\s?([\d.,]+)/i);
  const descontoTxt = pega(/\(-\)\s*DESCONTO:\s*R\$\s?([\d.,]+)/i);
  const liquidoTxt = pega(/TOTAL L[IÍ]QUIDO:\s*R\$\s?([\d.,]+)/i) ?? brutoTxt;
  const stTxt = pega(/VALOR ST:\s*R\$\s?([\d.,]+)/i);

  const soma = centavos(itens.reduce((s, i) => s + i.total, 0));
  const liquido = liquidoTxt ? numero(liquidoTxt) : null;
  const bruto = brutoTxt ? numero(brutoTxt) : liquido;
  const desconto = descontoTxt ? numero(descontoTxt) : 0;

  // A filial pelo emitente do cabeçalho, e não pelo endereço: a equipe escreve "VENDA MF" no
  // campo de endereço de pedido da INBRAS também (medido nos espelhos reais).
  const filial = /MF COMERCIO/i.test(texto) ? 'MF' : /INBRAS/i.test(texto) ? 'INBRAS' : null;

  return {
    itens,
    soma,
    bruto,
    desconto,
    liquido,
    st: stTxt ? numero(stTxt) : 0,
    pedido: pega(/PEDIDO N[ºO°]?\s*:?\s*(\d{3,8})/i) ?? pega(/\bVenda\s+(\d{3,8})\b/i),
    cliente: pega(/Cliente:\s*(\d{2,6})\b/i),
    filial,
    somaBate: bruto !== null && Math.abs(soma - bruto) < 0.02,
    descontoBate: bruto !== null && liquido !== null && Math.abs(bruto - desconto - liquido) < 0.02,
  };
}

const moeda = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O que impede a importação, em frase — ou `null` quando pode importar (§9.7). `cliente` é o código
 * do cliente do lançamento.
 */
export function problemaDoEspelho(e: LeituraDoEspelho, cliente: string | null): string | null {
  if (e.itens.length === 0) {
    return 'Este PDF não é um espelho de pedido que o sistema conheça (Pedido I ou Pedido IV do Forteplus).';
  }
  if (!e.somaBate) {
    return `A soma dos itens (R$ ${moeda(e.soma)}) não bate com o TOTAL do espelho (R$ ${moeda(e.bruto ?? 0)}). Nada foi importado — confira o PDF ou digite à mão.`;
  }
  if (!e.descontoBate) {
    return `O TOTAL menos o DESCONTO (R$ ${moeda((e.bruto ?? 0) - e.desconto)}) não dá o TOTAL LÍQUIDO (R$ ${moeda(e.liquido ?? 0)}). Nada foi importado.`;
  }
  if (cliente && e.cliente && e.cliente !== cliente) {
    return `Este espelho é do cliente ${e.cliente}, e o lançamento é do cliente ${cliente}.`;
  }
  return null;
}

export type CategoriaDeColorimetria = 'Coloração' | 'Tonalizante';

/** Quantas unidades de coloração e de tonalizante o pedido tem, pelo catálogo de colorimetria. */
export function contarColorimetria(itens: ItemDoEspelho[], catalogo: Map<string, CategoriaDeColorimetria>) {
  let coloracao = 0;
  let tonalizante = 0;
  for (const i of itens) {
    const categoria = catalogo.get(i.codigo);
    if (categoria === 'Coloração') coloracao += i.qtd;
    else if (categoria === 'Tonalizante') tonalizante += i.qtd;
  }
  return { coloracao: Math.round(coloracao), tonalizante: Math.round(tonalizante) };
}
