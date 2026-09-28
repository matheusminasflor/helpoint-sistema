// Leitor posicional dos relatórios de Contas a Pagar e Contas a Receber do Forteplus.
//
// POR QUE ISTO EXISTE. O importador financeiro (`@/lib/finance-import`) é genérico:
// casa CAMPO com COLUNA pelo nome do cabeçalho. Nestes dois relatórios isso não
// funciona, e não funciona em silêncio — medido nos arquivos reais de 2026-09-28
// (`scripts/inspecionar-fin-forteplus.mjs`):
//
//   Contas a Receber: o cabeçalho "Vencimento" está na coluna 9, o DADO na 10.
//                     "Valor Parcela" no 23, o dado no 22. E a coluna 13 diz
//                     "Cliente  Razão Social", mas são DUAS colunas de dado — o
//                     código do cliente na 14 e a razão social na 16.
//   Contas a Pagar:   mesma coisa: "Vencimento" 9 → dado 10, "Valor Parcela" 21 →
//                     dado 19, fornecedor em 14 (código) e 16 (nome).
//
// A causa é célula mesclada: o cabeçalho impresso ocupa um intervalo e o `xlsx`
// entrega o rótulo na primeira coluna do intervalo, enquanto o dado cai onde caiu.
// Consequência prática ANTES desta correção: o formato "Forteplus" no diálogo de
// importação era só um rótulo — nada no código olhava para ele —, e o caminho
// genérico lia a coluna 9 do vencimento, achava vazio, e descartava TODAS as linhas
// com "Vencimento inválido". Importar contas a pagar do Forteplus trazia zero
// lançamentos. Registrado em `docs/nao-funciona.md`.
//
// É o mesmo motivo de `lerRelatorioVendas` (`@/lib/comercial-import`) ler o
// relatório de vendas por posição.
//
// O QUE ESTES RELATÓRIOS NÃO TÊM. Não têm data de pagamento nem coluna de situação:
// são relatórios de TÍTULO ABERTO. O que existe é "Saldo Parcela" — quanto ainda
// falta. Então a situação sai do saldo (saldo zerado = pago) e, quando pago, a data
// que vale é o vencimento, pela mesma razão explicada em `parseStatus`: o trigger do
// banco preencheria com HOJE e jogaria anos de contas pagas no mês corrente.
import * as XLSX from 'xlsx';
import type { FinKind, FinStatus } from '@/types/financeiro';
import { competenceOf, parseAmount, parseDate } from '@/lib/planilha';
// `import type` de propósito: quem escolhe este leitor é `finance-import`, então
// importá-lo de volta em tempo de execução fecharia um ciclo. O tipo é apagado na
// compilação — não há dependência nenhuma no bundle.
import type { ParsedRow } from '@/lib/finance-import';

export type TipoForteplus = 'pagar' | 'receber';

/** As posições medidas no arquivo real. Mudou o relatório? Rode o inspetor antes. */
const COLUNAS: Record<TipoForteplus, Record<string, number>> = {
  receber: {
    cod: 0, documento: 4, parcela: 5, emissao: 7, vencimento: 10, tp: 12,
    contraparteCod: 14, contraparteNome: 16, valor: 22, saldo: 27,
    acrescimo: 33, desconto: 38, total: 43, meioPgto: 47, vendedor: 53,
  },
  pagar: {
    cod: 0, documento: 4, parcela: 6, emissao: 8, vencimento: 10, tp: 12,
    contraparteCod: 14, contraparteNome: 16, valor: 19, saldo: 23,
    acrescimo: 26, desconto: 28, total: 30, planoContas: 35, meioPgto: 40,
  },
};

const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

export interface LinhaForteplus extends ParsedRow {
  /**
   * `forteplus:pagar:963` — o "Cod" do Forteplus, que é único por PARCELA. Grava-se
   * em `fin_entries.external_id` para que reimportar o mesmo relatório não duplique:
   * sem isso, quem exporta o relatório duas vezes (ou exporta um período que
   * encavala com o anterior) fica com a conta contada em dobro no realizado.
   */
  external_id: string;
  /** O código do cliente/fornecedor no Forteplus — a ponte com `com_clientes.codigo`. */
  contraparte_codigo: string | null;
}

export interface LeituraForteplusFin {
  tipo: TipoForteplus;
  linhas: LinhaForteplus[];
  /** Linhas de dado que foram descartadas, com o motivo. */
  descartadas: { linha: number; motivo: string }[];
  competencias: string[];
  total: number;
  /** Quantos códigos de "Cod" vieram repetidos DENTRO do arquivo. */
  repetidos: number;
  /** Só no relatório de receber: os vendedores que aparecem, para o dono conferir. */
  vendedores: string[];
  /** Só no de pagar: os planos de conta, que viram a categoria do lançamento. */
  planosDeConta: string[];
  /**
   * O "Totais:" que o próprio relatório imprime no fim, ou `null` se não achou.
   *
   * É a conferência que importa, e é a mesma de `totalImpressoDoRelatorio` no leitor
   * de vendas: o relatório diz quanto deveria somar, então o leitor NÃO precisa que
   * alguém confira à mão se pulou linha. Foi assim que o filtro errado apareceu em
   * 2026-09-28 — o leitor somava 108.728,88 onde o relatório imprimia 125.983,90,
   * porque exigia número de nota fiscal em conta que não tem.
   */
  totalImpresso: number | null;
}

const texto = (row: unknown[] | undefined, i: number | undefined): string =>
  i === undefined ? '' : String((row ?? [])[i] ?? '').trim();

/** O tipo sai do TÍTULO impresso, não do nome do arquivo: arquivo se renomeia. */
export function tipoDoRelatorio(matriz: unknown[][]): TipoForteplus | null {
  const cabeca = matriz
    .slice(0, 10)
    .flatMap((r) => (r ?? []).map((c) => String(c ?? '')))
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!cabeca.includes('contas a')) return null;
  if (cabeca.includes('contas a receber')) return 'receber';
  if (cabeca.includes('contas a pagar')) return 'pagar';
  return null;
}

/**
 * O "Totais:" do fim do relatório. Nos dois formatos o rótulo está na coluna 2 e o
 * valor na 20 — medido, e a linha de subtotal por data (que não tem o rótulo) não é
 * confundida com ele.
 */
export function totalImpresso(matriz: unknown[][]): number | null {
  for (let i = matriz.length - 1; i >= 0; i--) {
    const row = matriz[i];
    const rotulo = (row ?? []).findIndex((c) => /^totais:?$/i.test(String(c ?? '').trim()));
    if (rotulo < 0) continue;
    for (let j = rotulo + 1; j < (row ?? []).length; j++) {
      const n = parseAmount(String((row ?? [])[j] ?? '').trim());
      if (n !== null) return n;
    }
  }
  return null;
}

export function lerForteplusFin(matriz: unknown[][], tipo: TipoForteplus): LeituraForteplusFin {
  const col = COLUNAS[tipo];
  const linhas: LinhaForteplus[] = [];
  const descartadas: { linha: number; motivo: string }[] = [];
  const competencias = new Set<string>();
  const vendedores = new Set<string>();
  const planosDeConta = new Set<string>();
  const vistos = new Set<string>();
  let repetidos = 0;
  let total = 0;

  for (let i = 0; i < matriz.length; i++) {
    const row = matriz[i];
    const cod = texto(row, col.cod);
    const documento = texto(row, col.documento);
    const vencimentoBr = texto(row, col.vencimento);
    const nome = texto(row, col.contraparteNome);

    // Linha de DADO: tem código, vencimento em data e nome de contraparte. O título,
    // o agrupamento por data de emissão (que põe a data na coluna 0 e nada mais) e a
    // linha de subtotal (que só tem valores) não passam nos três ao mesmo tempo.
    //
    // O NÚMERO DO DOCUMENTO NÃO ENTRA NESTE FILTRO, e isto é a correção de
    // 2026-09-28: exigi-lo derrubava 53 dos 93 títulos do relatório de contas a
    // pagar — todo recibo (RC), DAS (DP), taxa (TXA) e pagamento avulso (PA) vem
    // SEM nota fiscal, e é conta legítima. Com o documento no filtro, o leitor somava
    // 108.728,88 onde o relatório imprime 125.983,90, e a diferença não aparecia em
    // lugar nenhum: as linhas eram puladas antes de virar descarte. Filtro que
    // silencia é pior que filtro que erra.
    if (cod === '' || nome === '' || !DATA_BR.test(vencimentoBr)) continue;

    const due = parseDate(vencimentoBr);
    const valor = parseAmount(texto(row, col.valor));

    if (!due) { descartadas.push({ linha: i + 1, motivo: 'Vencimento inválido' }); continue; }
    if (valor === null) { descartadas.push({ linha: i + 1, motivo: 'Valor inválido' }); continue; }

    const externalId = `forteplus:${tipo}:${cod}`;
    if (vistos.has(externalId)) { repetidos++; continue; }
    vistos.add(externalId);

    // Situação pelo SALDO, porque não existe coluna de situação: saldo zerado (ou
    // ausente) significa que o título foi quitado. Nunca `overdue` — "atrasado" é
    // leitura de `due_date` contra hoje, e `effectiveStatus` decide na tela.
    const saldo = parseAmount(texto(row, col.saldo));
    const status: FinStatus = saldo !== null && Math.abs(saldo) < 0.005 ? 'paid' : 'pending';
    // Conta paga TEM data (CHECK `fin_entries_paga_tem_data`), e o relatório não traz
    // o dia do pagamento. Vale o vencimento — ver o cabeçalho deste arquivo.
    const settled = status === 'paid' ? due : null;

    const tp = texto(row, col.tp);
    const parcela = texto(row, col.parcela);
    const plano = texto(row, col.planoContas);
    const vendedor = texto(row, col.vendedor);
    const contraparteCodigo = texto(row, col.contraparteCod) || null;
    const competence = competenceOf(due);

    if (plano) planosDeConta.add(plano);
    if (vendedor) vendedores.add(vendedor);
    competencias.add(competence);
    total += valor;

    linhas.push({
      // A descrição é o que a pessoa vê na lista: o tipo de documento, o número e a
      // parcela. O nome da contraparte já tem coluna própria — repetir ali deixaria
      // a lista ilegível.
      description: [tp || 'Título', documento, parcela ? `parc. ${parcela}` : null]
        .filter(Boolean).join(' ') + ` — ${nome}`,
      // No de PAGAR o plano de contas do Forteplus é exatamente a categoria do
      // lançamento (9 valores medidos). No de RECEBER não existe plano de contas;
      // a categoria fica nula e quem classifica é o Financeiro.
      category: plano || null,
      counterparty: nome,
      document_number: documento || null,
      // O SINAL FICA. O importador genérico grava `Math.abs(valor)`, e aqui isso
      // estaria errado: nota de crédito (NCC) e devolução (PA) vêm NEGATIVAS no
      // Forteplus, porque abatem. Medido: 4 NCC no relatório de receber, somando
      // −8.081,59. Com `abs`, esses 8 mil deixam de abater E entram como receita —
      // o recebível inflava em 16 mil, o dobro do crédito. `fin_entries.amount` não
      // tem CHECK de positivo justamente porque abatimento existe.
      amount: valor,
      due_date: due,
      settled_at: settled,
      status,
      payment_method: texto(row, col.meioPgto).replace(/^N\/I$/i, '') || null,
      cost_center: null,
      // O vendedor não tem coluna em `fin_entries` e não vai virar uma: é informação
      // do Comercial, e o campo do Forteplus vem contaminado com "FINANCEIRO
      // APROVADO"/"FINANCEIRO CONFERENCIA" no meio dos nomes de gente. Fica na
      // observação, onde não passa por dado estruturado.
      notes: [
        vendedor ? `Vendedor no Forteplus: ${vendedor}` : null,
        contraparteCodigo ? `Código no Forteplus: ${contraparteCodigo}` : null,
        texto(row, col.emissao) ? `Emissão: ${texto(row, col.emissao)}` : null,
      ].filter(Boolean).join(' · ') || null,
      competence,
      external_id: externalId,
      contraparte_codigo: contraparteCodigo,
    });
  }

  return {
    tipo,
    linhas,
    descartadas,
    competencias: [...competencias].sort(),
    total,
    repetidos,
    vendedores: [...vendedores].sort(),
    planosDeConta: [...planosDeConta].sort(),
    totalImpresso: totalImpresso(matriz),
  };
}

/**
 * Lê o arquivo e recusa o que não for um destes dois relatórios — e recusa o
 * relatório CERTO importado no lugar errado (o de pagar na tela de receber).
 *
 * O segundo caso é o que mais importa: sem essa checagem, exportar o relatório de
 * contas a pagar e subir na tela de contas a receber gravaria 40 despesas como
 * receita, e nada no resultado acusaria — o valor entra, a data entra, o nome entra.
 */
export async function lerForteplusDeArquivo(file: File, kind: FinKind): Promise<LeituraForteplusFin> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('A planilha está vazia. Nada foi importado.');
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });

  const tipo = tipoDoRelatorio(matriz);
  if (!tipo) {
    throw new Error(
      'Este arquivo não parece o relatório de Contas a Pagar nem de Contas a Receber do Forteplus — ' +
      'não encontrei o título nas primeiras linhas. Nada foi importado.'
    );
  }
  const esperado: TipoForteplus = kind === 'payable' ? 'pagar' : 'receber';
  if (tipo !== esperado) {
    throw new Error(
      `Este é o relatório de Contas a ${tipo === 'pagar' ? 'Pagar' : 'Receber'}, e esta tela importa ` +
      `Contas a ${esperado === 'pagar' ? 'Pagar' : 'Receber'}. Nada foi importado.`
    );
  }

  const leitura = lerForteplusFin(matriz, tipo);
  if (leitura.linhas.length === 0) {
    throw new Error('Não encontrei nenhuma linha de título neste relatório. Nada foi importado.');
  }

  // O relatório imprime o próprio total. Se o que foi lido não fecha com ele, alguma
  // linha ficou de fora ou entrou duas vezes — e importar assim grava um número
  // errado que ninguém vai conferir depois. Recusar é mais barato que auditar.
  // A folga é de um centavo por título, que é o arredondamento possível.
  if (leitura.totalImpresso !== null) {
    const folga = Math.max(0.05, leitura.linhas.length * 0.01);
    if (Math.abs(leitura.total - leitura.totalImpresso) > folga) {
      throw new Error(
        `O relatório imprime "Totais: ${leitura.totalImpresso.toFixed(2)}" e eu li ` +
        `${leitura.total.toFixed(2)} em ${leitura.linhas.length} títulos. Alguma coluna do ` +
        'relatório mudou de lugar — nada foi importado. Rode ' +
        '`npx vite-node scripts/ler-relatorios-forteplus.mjs` para ver onde.'
      );
    }
  }
  return leitura;
}
