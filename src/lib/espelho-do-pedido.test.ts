// O leitor do espelho contra as linhas que o PDF real produz (2026-09-29: pedidos 11309, 11310,
// 11313 e 11384 do Forteplus, layout Pedido IV). Nome, endereço e contato do cliente foram trocados;
// códigos, quantidades e valores são os do arquivo.
//
// Para conferir contra os PDFs de verdade (ficam fora do repositório — têm dado de cliente):
//   ESPELHOS="pasta/com/os/pdfs" npx vitest run src/lib/espelho-do-pedido
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contarColorimetria, lerEspelho, linhasDoPdf, problemaDoEspelho, type TextoNaPagina,
} from './espelho-do-pedido';

const CABECALHO_INBRAS = [
  'CNPJ: 07.025.603/0001-97',
  'INBRAS - INDUSTRIA BRASILEIRA DE',
  'COSMETICOS LTDA',
  'Pedido de venda Data e Hora: 29/09/2026 15:28:25 Página:1/1',
  'PEDIDO Nº: 11309 Nº ID: Vendedor: 1990 - VENDEDORA TESTE',
  'Cliente: 1179 - CLIENTE TESTE Ordem Compra: Data Emissão: 24/09/2026',
  // A equipe escreve o tipo do pedido no endereço: "VENDA MF" aparece em pedido da INBRAS.
  'Endereço: Rua Teste, 110 - VENDA MF',
  'Cód. Barra Produto Fabricante Lote Vencimento Qnt. Vlr. unitário Desconto Total',
];

const VENDA_INBRAS_COM_DESCONTO = [
  ...CABECALHO_INBRAS,
  '49 RESGAT - CONDICIONADOR 2L MINASFL 2,000 R$43,85 R$0,00 R$87,70',
  'OR',
  '700 STYLO - MODELADOR E COND 500ML MINASFL 3,000 R$48,61 R$0,00 R$145,83',
  'OR',
  '653 7 EM 1 MULTIFUNCIONAL BB CREAM MINASFL 3,000 R$88,01 R$0,00 R$264,03',
  'HAIR 500 mL OR',
  '502 KERADVANCE - QUERATINA E CISTEINA MINASFL 3,000 R$83,08 R$0,00 R$249,24',
  'OR',
  'EM GEL 500ML',
  '495 KERATIN - MASCARA MASSA CAPILAR MINASFL 3,000 R$63,38 R$0,00 R$190,14',
  'QUERATINA 1KG OR',
  '460 RESGAT - SHAMPOO 2L MINASFL 3,000 R$43,85 R$0,00 R$131,55',
  'OR',
  'MINASFL',
  // Fabricante quebrado para a linha de cima: a linha do item vem sem "MINASFL".
  '240 STYLO - PRIMER DEFRIZANTE 250 ML 3,000 R$42,26 R$0,00 R$126,78',
  'OR',
  '233 STYLO - REPARADOR DE PONTAS 45 MINASFL 6,000 R$30,03 R$0,00 R$180,18',
  'ML OR',
  'OBSERVAÇÃO',
  'TRANSPORTADORA RODONAVES. PAGAMENTO PIX',
  'TOTAL: R$1.375,45',
  '(-) DESCONTO: R$23,13',
  'Recebemos as mercadorias constantes neste pedido.',
  'TOTAL LÍQUIDO: R$1.352,32',
  '_________________________________________, _____/_____/_____. (+) IPI: 0,00 (+) VALOR ST: R$0,00',
  'TOTAL DO PEDIDO: R$1.352,32',
];

const VENDA_MF = [
  'CNPJ: 08.319.138/0001-60',
  'MF COMERCIO DISTRIBUIDOR DE',
  'COSMETICOS LTDA',
  'PEDIDO Nº: 11310 Nº ID: Vendedor: 1990 - VENDEDORA TESTE',
  'Cliente: 1179 - CLIENTE TESTE Ordem Compra: Data Emissão: 24/09/2026',
  '1144 METAL OFF - SHAMPOO 1L MINASFL 3,000 R$91,00 R$0,00 R$273,00',
  '654 OJON + 7 - HC MASCARA MINASFL 3,000 R$38,28 R$0,00 R$114,84',
  '630 OJON +7 - HC. SH RECONSTRUÇÃO MINASFL 3,000 R$35,74 R$0,00 R$107,22',
  '655 OJON +7 MASCARA RECONSTRUÇÃO MINASFL 3,000 R$78,63 R$0,00 R$235,89',
  'TOTAL: R$730,95',
  '(-) DESCONTO: R$0,00',
  'TOTAL LÍQUIDO: R$730,95',
  '(+) IPI: 0,00 (+) VALOR ST: R$0,00',
];

describe('lerEspelho — Pedido IV, como o Forteplus emite hoje', () => {
  it('venda INBRAS com desconto: 8 itens, as duas contas batem, a filial vem do emitente', () => {
    const e = lerEspelho(VENDA_INBRAS_COM_DESCONTO);
    expect(e.itens).toHaveLength(8);
    expect(e.itens.map((i) => i.qtd)).toEqual([2, 3, 3, 3, 3, 3, 3, 6]);
    expect(e).toMatchObject({
      soma: 1375.45, bruto: 1375.45, desconto: 23.13, liquido: 1352.32, st: 0,
      pedido: '11309', cliente: '1179', filial: 'INBRAS', somaBate: true, descontoBate: true,
    });
    expect(problemaDoEspelho(e, '1179')).toBeNull();
  });

  it('venda MF: a filial é MF', () => {
    expect(lerEspelho(VENDA_MF)).toMatchObject({ pedido: '11310', filial: 'MF', liquido: 730.95, somaBate: true });
  });

  it('a soma dos itens é comparada com o BRUTO, não com o líquido (erro histórico do manual, §9.5)', () => {
    // Com desconto, soma ≠ líquido. Se comparasse com o líquido, este pedido real seria recusado.
    const e = lerEspelho(VENDA_INBRAS_COM_DESCONTO);
    expect(e.soma).not.toBe(e.liquido);
    expect(problemaDoEspelho(e, '1179')).toBeNull();
  });
});

describe('problemaDoEspelho — nada é importado quando não fecha', () => {
  it('item faltando: a soma não bate com o TOTAL', () => {
    const sem = VENDA_MF.filter((l) => !l.startsWith('655 '));
    expect(problemaDoEspelho(lerEspelho(sem), '1179')).toMatch(/^A soma dos itens \(R\$ 495,06\) não bate com o TOTAL/);
  });

  it('desconto que não fecha com o líquido', () => {
    const errado = VENDA_INBRAS_COM_DESCONTO.map((l) => (l.startsWith('(-) DESCONTO') ? '(-) DESCONTO: R$20,00' : l));
    expect(problemaDoEspelho(lerEspelho(errado), '1179')).toMatch(/não dá o TOTAL LÍQUIDO/);
  });

  it('espelho de outro cliente é recusado, com os dois códigos', () => {
    expect(problemaDoEspelho(lerEspelho(VENDA_MF), '1203')).toBe('Este espelho é do cliente 1179, e o lançamento é do cliente 1203.');
  });

  it('PDF que não é espelho', () => {
    expect(problemaDoEspelho(lerEspelho(['Nota fiscal', 'TOTAL: R$10,00']), null)).toMatch(/não é um espelho/);
  });
});

describe('quantidade quebrada do Pedido IV (§9.3)', () => {
  // A quantidade tem três casas ("4,000"). Quando quebra, a terceira casa cai na linha de baixo
  // (às vezes depois de um "OR" solto): "1,23" + "4" é 1,234.
  it('a casa que caiu na linha de baixo volta para a quantidade', () => {
    const e = lerEspelho(['1 PRODUTO MINASFL 1,23 R$1,00 R$0,00 R$1,23', 'OR', '4', 'TOTAL: R$1,23']);
    expect(e.itens[0].qtd).toBe(1.234);
  });
});

describe('linhasDoPdf', () => {
  it('junta os trechos por altura, de cima para baixo, com espaço onde há vão', () => {
    const pagina: TextoNaPagina[] = [
      { str: 'TOTAL:', x: 10, y: 99, w: 20 },
      { str: 'R$10,00', x: 40, y: 100, w: 20 },
      { str: 'PEDIDO Nº: 1', x: 10, y: 300, w: 50 },
    ];
    expect(linhasDoPdf([pagina])).toEqual(['PEDIDO Nº: 1', 'TOTAL: R$10,00']);
  });
});

describe('contarColorimetria', () => {
  it('soma as quantidades pela categoria do catálogo; o que não está no catálogo não conta', () => {
    const itens = lerEspelho(['10 COR 7.0 MINASFL 5,000 R$10,00 R$0,00 R$50,00', '11 TON MINASFL 2,000 R$10,00 R$0,00 R$20,00',
      '12 SHAMPOO MINASFL 1,000 R$10,00 R$0,00 R$10,00', 'TOTAL: R$80,00']).itens;
    expect(contarColorimetria(itens, new Map([['10', 'Coloração'], ['11', 'Tonalizante']]))).toEqual({ coloracao: 5, tonalizante: 2 });
  });
});

describe.runIf(!!process.env.ESPELHOS)('os PDFs reais (ESPELHOS)', () => {
  it('todo espelho da pasta é lido e as duas contas batem', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pasta = process.env.ESPELHOS!;
    for (const nome of readdirSync(pasta).filter((n) => n.toLowerCase().endsWith('.pdf'))) {
      const doc = await getDocument({ data: new Uint8Array(readFileSync(join(pasta, nome))) }).promise;
      const paginas: TextoNaPagina[][] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const c = await (await doc.getPage(p)).getTextContent();
        paginas.push(c.items.filter((it) => 'str' in it)
          .map((it) => { const t = it as { str: string; transform: number[]; width: number }; return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width }; }));
      }
      const e = lerEspelho(linhasDoPdf(paginas));
      console.log(nome, JSON.stringify({ pedido: e.pedido, filial: e.filial, cliente: e.cliente, itens: e.itens.length, bruto: e.bruto, desconto: e.desconto, liquido: e.liquido, st: e.st }));
      expect(problemaDoEspelho(e, e.cliente), nome).toBeNull();
    }
  });
});
