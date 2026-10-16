// Leitor do relatório "Mercadorias Vendidas" do Forteplus (Comercial, L6a).
// Regra pura: nenhum I/O, nenhum Supabase — só transforma a matriz que o
// componente já leu do arquivo.
//
// NÃO reusa `src/lib/finance-import.ts`: aquele casa sinônimo de cabeçalho
// com coluna, e aqui o cabeçalho impresso aponta para a coluna errada em três
// campos (célula mesclada — §3.3 do plano). A leitura aqui é por posição
// fixa, conferida contra o arquivo real do dono antes de eu escrever isto
// (`scripts/inspecionar-vendas.mjs`, que mostra a linha crua com o índice de
// cada célula), nunca deduzida da aparência do cabeçalho. A auditoria da L6a
// achou esse script citado aqui e inexistente no repositório (achado 10.4);
// ele existe — quem receber um relatório novo do Forteplus roda ele antes de
// mexer em `COL`.
import type { ClasseCfop, Filial } from '@/types/comercial';
import { extrairDocumentoDoNome } from '@/lib/documento';

// ---------------------------------------------------------------------------
// CFOP: quatro classes de verdade. O que não está aqui é 'outros' — nunca se
// adivinha (§3.2 e §3.1: uma linha classificada errado já valeu 39% de agosto
// da MF).
// ---------------------------------------------------------------------------
const CFOP_POR_CLASSE: Record<Exclude<ClasseCfop, 'outros'>, string[]> = {
  // 2026-10-06 (docs/regra-cashback.md, memória fiscal do Forteplus): 7949 é BONIFICAÇÃO e 5405 é VENDA.
  venda: ['5101', '5102', '5401', '5403', '5405', '6101', '6102', '6107', '6401', '6403', '7101'],
  devolucao: ['1201', '1202', '1410', '1411', '2201'],
  bonificacao: ['5910', '5911', '6910', '6911', '7949'],
  industrializacao: ['5901', '5902', '6901', '6902', '6903', '1901', '1902'],
};

/**
 * Classifica o CFOP para a PRÉVIA, antes de enviar (a pessoa vê a
 * classificação e confere antes de confirmar). A decisão que VALE é do
 * banco — `public.com_classe_do_cfop`, na migration
 * `20261014020000_comercial_correcoes_da_auditoria.sql` — porque o achado 3
 * da auditoria provou que um payload podia mentir `classe:"venda"` com um
 * CFOP de industrialização e inflar o mês. Se esta tabela e a do banco
 * divergirem, o teste que prova as duas (`comercial-import.test.ts`,
 * espelhando `comercial_base_de_vendas.test.sql`) acusa.
 */
export function classificarCfop(cfop: string): ClasseCfop {
  for (const [classe, lista] of Object.entries(CFOP_POR_CLASSE)) {
    if (lista.includes(cfop)) return classe as ClasseCfop;
  }
  return 'outros';
}

// ---------------------------------------------------------------------------
// Filial: o NOME DO ARQUIVO decide (§4a do documento do dono). Decisão do dono
// em 2026-09-24: o nome passou a ser OBRIGATÓRIO e a tela IMPEDE a importação
// quando ele não identifica a empresa — antes ela só propunha, e quem estivesse
// com pressa podia escolher a outra filial e mandar 57 meses de INBRAS entrarem
// como MF, em silêncio, sem nada acusar depois.
//
// `motivo` existe para a tela dizer COMO consertar: renomear tirando uma das
// duas palavras (ambos) ou acrescentando uma (nenhum). É a mesma varredura de
// `sugerirFilial`, escrita uma vez só — duas cópias da mesma regra foi como a
// faixa A e a faixa B viraram a mesma cor na Frente 4.
// ---------------------------------------------------------------------------
export type FilialNoNome =
  | { filial: Filial; motivo: null }
  | { filial: null; motivo: 'ambos' | 'nenhum' };

export function filialNoNomeDoArquivo(nomeArquivo: string): FilialNoNome {
  const nome = nomeArquivo.toUpperCase();
  const temInbras = nome.includes('INBRAS');
  const temMf = nome.includes('MF') || nome.includes('MINASFLOR');
  if (temInbras && temMf) return { filial: null, motivo: 'ambos' };
  if (temInbras) return { filial: 'INBRAS', motivo: null };
  if (temMf) return { filial: 'MF', motivo: null };
  return { filial: null, motivo: 'nenhum' };
}

/** O que a tela pré-seleciona. `null` quando o nome não identifica — e aí a importação fica bloqueada. */
export function sugerirFilial(nomeArquivo: string): Filial | null {
  return filialNoNomeDoArquivo(nomeArquivo).filial;
}

// ---------------------------------------------------------------------------
// Datas: fatiamento de texto, nunca `new Date()` (regra 4 das cinco — não há
// "hoje" nenhum aqui, a data vem sempre do arquivo).
// ---------------------------------------------------------------------------
function partesDaData(raw: string): { dia: string; mes: string; ano: string } {
  const [dia, mes, ano] = raw.trim().split('/');
  return { dia, mes, ano };
}

/**
 * 'aaaa-mm-dd' (o `emissao` já convertido de `ItemVenda`) → 'aaaa-mm-01',
 * para a prévia mostrar quais competências o arquivo cobre. Achado 11.2 da
 * auditoria: existia junto com uma cópia manual (`i.emissao.slice(0,7) +
 * '-01'`) no diálogo — a duplicata saiu, esta é a única, e passou a receber
 * o formato que o único chamador de verdade tem em mãos.
 */
export function competenciaDe(emissaoIso: string): string {
  return `${emissaoIso.slice(0, 7)}-01`;
}

function emissaoParaIso(emissao: string): string {
  const { dia, mes, ano } = partesDaData(emissao);
  return `${ano}-${mes}-${dia}`;
}

// ---------------------------------------------------------------------------
// O relatório de vendas
// ---------------------------------------------------------------------------

/** Onde cada campo real está — não onde o cabeçalho impresso diz que está (§3.3). */
const COL = {
  /** "Cod" no cabeçalho é o NÚMERO DO PEDIDO — serve para rastrear a linha no Forteplus. */
  pedido: 1,
  emissao: 4,
  documento: 6,
  tipoDocumento: 9,
  serie: 11,
  cfop: 12,
  produtoCodigo: 13,
  produtoNome: 16,
  quantidade: 21,
  valorNota: 23,
  desconto: 26,
  vendedorCodigo: 30,
  vendedorNome: 34,
} as const;

export interface ItemVenda {
  emissao: string; // ISO 'aaaa-mm-dd'
  documento: string;
  serie: string;
  tipo_documento: string | null;
  cfop: string;
  classe: ClasseCfop;
  cliente_codigo: string;
  cliente_nome: string;
  produto_codigo: string;
  produto_nome: string;
  quantidade: number;
  valor_nota: number;
  desconto: number;
  vendedor_codigo: string | null;
  vendedor_nome: string | null;
  /** O pedido no Forteplus. Só para rastrear na tela (o banco não grava). */
  pedido?: string | null;
}

export type MotivoDescarte = 'cabecalho_repetido' | 'em_branco' | 'rodape' | 'grupo_cliente' | 'remessa_do_completo';

export interface LeituraVendas {
  itens: ItemVenda[];
  descartes: Record<MotivoDescarte, number>;
  linhasLidas: number;
  cfopsDesconhecidos: { cfop: string; linhas: number; valor: number }[];
  /** Ver `totalImpressoDoRelatorio`. `null` quando o recorte não traz a linha "Totais:". */
  totalImpresso: number | null;
}

/**
 * O relatório do Forteplus IMPRIME o próprio total, na linha "Totais:" —
 * comparar contra ele prova que o arquivo foi lido inteiro (achado 8 da
 * auditoria da L6a; `scripts/conferir-vendas-reais.ts` já provou bater ao
 * centavo nos arquivos reais do dono). `null` quando o recorte não traz essa
 * linha (relatório parcial) — sem conferência externa possível, nunca um
 * zero de mentira.
 */
export function totalImpressoDoRelatorio(matriz: unknown[][]): number | null {
  const iTotais = matriz.findIndex((r) => String(r?.[2] ?? '').trim() === 'Totais:');
  if (iTotais <= 0) return null;
  let i = iTotais - 1;
  while (i > 0 && matriz[i].every((c) => String(c ?? '').trim() === '')) i--;
  const impresso = Number(matriz[i][COL.valorNota]);
  return Number.isFinite(impresso) ? impresso : null;
}

function celula(row: unknown[], indice: number): string {
  return String(row[indice] ?? '').trim();
}

function linhaEmBranco(row: unknown[]): boolean {
  return row.every((c) => String(c ?? '').trim() === '');
}

/** A linha 5 (índice 0-based) tem que ter exatamente estes rótulos, nestas colunas. */
function assinaturaBate(matriz: unknown[][]): boolean {
  const linha = matriz[5];
  if (!linha) return false;
  return celula(linha, 1) === 'Cod' && celula(linha, 4) === 'Emissão' && celula(linha, 12) === 'CFOP';
}

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const GRUPO_CLIENTE_RE = /^(.+)-\s*(\d+)$/;

/**
 * Lê o relatório "Mercadorias Vendidas" do Forteplus, posição fixa (§3.3).
 * Recusa (lança) se a assinatura da linha 5 não bater — nunca adivinha um
 * formato diferente.
 *
 * Não recebe `filial`: o arquivo não diz a filial (§4.8, os dois xlsx
 * trazem o CNPJ da INBRAS mesmo no relatório da MF), e nenhuma linha daqui
 * precisava dela — o parâmetro só existia para "lembrar" quem chama, e
 * forçava a gambiarra de montar a prévia com um valor de mentira antes da
 * pessoa confirmar (achado 11.3 da auditoria). `com_importar_vendas` recebe
 * a filial confirmada pela pessoa como parâmetro próprio (`p_filial`), fora
 * do item — é lá, e só lá, que ela precisa existir.
 */
export function lerRelatorioVendas(matriz: unknown[][]): LeituraVendas {
  if (!assinaturaBate(matriz)) {
    throw new Error(
      'Este arquivo não parece o relatório "Mercadorias Vendidas - Produtos" do Forteplus — ' +
      'a linha 5 deveria ter "Cod" na coluna 2, "Emissão" na coluna 5 e "CFOP" na coluna 13. Nada foi importado.'
    );
  }

  const itens: ItemVenda[] = [];
  const descartes: Record<MotivoDescarte, number> = {
    cabecalho_repetido: 0,
    em_branco: 0,
    rodape: 0,
    grupo_cliente: 0,
    remessa_do_completo: 0,
  };

  let clienteAtual: { codigo: string; nome: string } | null = null;

  for (const row of matriz) {
    if (linhaEmBranco(row)) { descartes.em_branco++; continue; }

    const rowStr = row.map((c) => String(c ?? '')).join('|');

    if (celula(row, 1) === 'Cod' && celula(row, 4) === 'Emissão' && celula(row, 12) === 'CFOP') {
      descartes.cabecalho_repetido++; continue;
    }
    if (rowStr.includes('Página:')) { descartes.cabecalho_repetido++; continue; }
    if (rowStr.includes('Relatório Mercadorias Vendidas')) { descartes.cabecalho_repetido++; continue; }
    if (CNPJ_RE.test(rowStr)) { descartes.cabecalho_repetido++; continue; }

    const soCol0 = celula(row, 0) !== '' && row.slice(1).every((c) => String(c ?? '').trim() === '');
    if (soCol0) {
      const m = GRUPO_CLIENTE_RE.exec(celula(row, 0));
      if (m) {
        clienteAtual = { nome: m[1].trim(), codigo: m[2].trim() };
        descartes.grupo_cliente++;
        continue;
      }
    }

    const cfop = celula(row, COL.cfop);
    if (/^[0-9]{4}$/.test(cfop)) {
      if (!clienteAtual) {
        throw new Error(`Item na linha do relatório sem cabeçalho de cliente antes dele (CFOP ${cfop}, produto ${celula(row, COL.produtoCodigo)}).`);
      }
      itens.push({
        emissao: emissaoParaIso(celula(row, COL.emissao)),
        documento: celula(row, COL.documento),
        serie: celula(row, COL.serie),
        tipo_documento: celula(row, COL.tipoDocumento) || null,
        cfop,
        classe: classificarCfop(cfop),
        cliente_codigo: clienteAtual.codigo,
        cliente_nome: clienteAtual.nome,
        produto_codigo: celula(row, COL.produtoCodigo),
        produto_nome: celula(row, COL.produtoNome),
        quantidade: Number(row[COL.quantidade]) || 0,
        valor_nota: Number(row[COL.valorNota]) || 0,
        desconto: Number(row[COL.desconto]) || 0,
        vendedor_codigo: celula(row, COL.vendedorCodigo) || null,
        vendedor_nome: celula(row, COL.vendedorNome) || null,
        pedido: celula(row, COL.pedido) || null,
      });
      continue;
    }

    if (rowStr.includes('Telefone:')) { descartes.rodape++; continue; }
    if (rowStr.includes('www.')) { descartes.rodape++; continue; }
    // Sobra de rodapé não identificada nominalmente (ex.: a linha de
    // "Totais:" no fim do relatório) — nunca vira item por eliminação.
    descartes.rodape++;
  }

  const outrosPorCfop = new Map<string, { linhas: number; valor: number }>();
  for (const item of itens) {
    if (item.classe !== 'outros') continue;
    const atual = outrosPorCfop.get(item.cfop) ?? { linhas: 0, valor: 0 };
    atual.linhas++;
    atual.valor += item.valor_nota;
    outrosPorCfop.set(item.cfop, atual);
  }

  return {
    itens,
    descartes,
    linhasLidas: matriz.length,
    cfopsDesconhecidos: [...outrosPorCfop.entries()].map(([cfop, v]) => ({ cfop, ...v })),
    totalImpresso: totalImpressoDoRelatorio(matriz),
  };
}

/** O CFOP da remessa gratuita que o arquivo B traz (o dono exporta "só 5910/6910"). */
export const CFOPS_DA_REMESSA = new Set(['5910', '6910']);

export interface CombinacaoAeB {
  leitura: LeituraVendas;
  /** O que o Forteplus deixou torto e a conta não resolve sozinha — a tela mostra, nunca esconde. */
  anomalias: string[];
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

/**
 * A IMPORTAÇÃO EM DOIS ARQUIVOS (dono, 2026-10-16). O relatório "Mercadorias Vendidas" do Forteplus JUNTA a venda e a
 * remessa gratuita do MESMO CLIENTE E PRODUTO NO MÊS numa linha só, misturando as duas notas: o número de uma, a
 * data/pedido de outra, a série/CFOP da remessa. N D FIGUEIREDO: 12 un de venda (nota 23362) + 4 de bonificação (nota
 * 1413) viraram "23362 série 75 CFOP 6910, 16 un"; o cliente 1054 teve a bonificação de 04/09 somada na venda de 28/09.
 * Medido em set/2026, no Excel e no PDF: 15 notas assim na INBRAS, 9 na MF; e o arquivo do ano inteiro ainda multiplica
 * as quantidades. O arquivo só com 5910/6910 (B) vem limpo. Então, por mês e por filial:
 *   - a remessa vem inteira do B (a série diz publicidade, bonificação ou cashback);
 *   - do A sai a venda, por CLIENTE + PRODUTO no mês: o que o A rotulou de remessa ALÉM do que o B tem é venda
 *     escondida — volta para a NOTA DE VENDA dela (a nota da linha juntada, quando é de venda, com a data, série e
 *     CFOP dessa nota; senão a nota de venda do cliente naquele dia; senão a única do mês); o que o B tem ALÉM do
 *     rótulo de remessa do A foi somado numa linha de venda (sai dela). O total do A se mantém, ao centavo.
 * Conferido nos arquivos reais de set/2026 da INBRAS: o N D dá 3.643,36 de venda, como o relatório "só venda" dele.
 */
export function combinarAeB(arquivos: { nome: string; leitura: LeituraVendas }[]): CombinacaoAeB {
  if (arquivos.length !== 2) {
    throw new Error('Escolha os 2 arquivos do mesmo mês e da mesma filial: um com tudo e um só com os CFOP 5910/6910.');
  }
  const soRemessa = (l: LeituraVendas) => l.itens.length > 0 && l.itens.every((i) => CFOPS_DA_REMESSA.has(i.cfop));
  const b = arquivos.find((x) => soRemessa(x.leitura));
  const a = arquivos.find((x) => x !== b);
  if (!b || !a || soRemessa(a.leitura)) {
    throw new Error('Um dos arquivos tem de trazer só os CFOP 5910/6910 e o outro, tudo (venda e remessa). Exporte de novo.');
  }
  const meses = new Set([...a.leitura.itens, ...b.leitura.itens].map((i) => i.emissao.slice(0, 7)));
  if (meses.size > 1) {
    throw new Error(`Os arquivos têm notas de ${meses.size} meses (${[...meses].sort().join(', ')}). Exporte um mês por vez: no período maior o Forteplus multiplica as quantidades.`);
  }

  const chave = (i: ItemVenda) => `${i.cliente_codigo}|${i.produto_codigo}`;
  const grupos = new Map<string, { naoRemessa: ItemVenda[]; remessaA: ItemVenda[]; b: ItemVenda[] }>();
  const grupo = (k: string) => {
    let g = grupos.get(k);
    if (!g) { g = { naoRemessa: [], remessaA: [], b: [] }; grupos.set(k, g); }
    return g;
  };
  for (const i of a.leitura.itens) {
    const g = grupo(chave(i));
    (CFOPS_DA_REMESSA.has(i.cfop) ? g.remessaA : g.naoRemessa).push(i);
  }
  for (const i of b.leitura.itens) grupo(chave(i)).b.push(i);

  // As notas de venda do A (uma linha de cada, com a data, a série e o CFOP verdadeiros da nota) — por nota, por cliente
  // no dia e por cliente no mês — para devolver a venda escondida à nota dela.
  const notaDeVenda = new Map<string, ItemVenda>();
  const vendaDoDia = new Map<string, ItemVenda>();
  const vendasDoMes = new Map<string, Map<string, ItemVenda>>();
  for (const i of a.leitura.itens) {
    if (i.classe !== 'venda' || CFOPS_DA_REMESSA.has(i.cfop)) continue;
    if (!notaDeVenda.has(`${i.cliente_codigo}|${i.documento}`)) notaDeVenda.set(`${i.cliente_codigo}|${i.documento}`, i);
    if (!vendaDoDia.has(`${i.cliente_codigo}|${i.emissao}`)) vendaDoDia.set(`${i.cliente_codigo}|${i.emissao}`, i);
    const doMes = vendasDoMes.get(i.cliente_codigo) ?? new Map<string, ItemVenda>();
    if (!doMes.has(i.documento)) doMes.set(i.documento, i);
    vendasDoMes.set(i.cliente_codigo, doMes);
  }
  const docsDoB = new Set(b.leitura.itens.map((i) => `${i.cliente_codigo}|${i.documento}`));
  const notaDaVendaEscondida = (r: ItemVenda): ItemVenda | undefined => {
    const daLinha = notaDeVenda.get(`${r.cliente_codigo}|${r.documento}`);
    if (daLinha) return daLinha;
    const doDia = vendaDoDia.get(`${r.cliente_codigo}|${r.emissao}`);
    if (doDia) return doDia;
    const doMes = [...(vendasDoMes.get(r.cliente_codigo)?.values() ?? [])];
    return doMes.length === 1 ? doMes[0] : undefined;
  };

  const soma = (xs: ItemVenda[]) => xs.reduce((s, x) => s + x.valor_nota, 0);
  const qtd = (xs: ItemVenda[]) => xs.reduce((s, x) => s + x.quantidade, 0);
  const itens: ItemVenda[] = [...b.leitura.itens];
  const anomalias: string[] = [];
  let soNoB = 0;
  for (const g of grupos.values()) {
    const sobra = centavos(soma(g.remessaA) - soma(g.b));
    const sobraQtd = qtd(g.remessaA) - qtd(g.b);
    const vendas = g.naoRemessa.map((x) => ({ ...x }));
    // A linha juntada: a que leva o número de uma nota de venda; senão a que não é nota do B.
    const ref = g.remessaA.find((r) => notaDeVenda.has(`${r.cliente_codigo}|${r.documento}`))
      ?? g.remessaA.find((r) => !docsDoB.has(`${r.cliente_codigo}|${r.documento}`))
      ?? g.remessaA[0] ?? g.b[0] ?? g.naoRemessa[0];
    if (sobra > 0.005) {
      // Venda escondida sob o rótulo de remessa: volta para a nota de venda dela, com a data, série e CFOP da nota.
      const nota = notaDaVendaEscondida(ref);
      const cfop = nota?.cfop ?? (ref.cfop.startsWith('5') ? '5101' : '6101');
      if (!nota) {
        anomalias.push(`Cliente ${ref.cliente_codigo}, produto ${ref.produto_codigo} (pedido ${ref.pedido ?? '—'}, nota ${ref.documento}, ${dataBR(ref.emissao)}): R$ ${sobra.toFixed(2)} de venda e o cliente tem mais de uma nota de venda no mês — gravado na nota ${ref.documento} com o CFOP ${cfop}. Confira no Forteplus.`);
      }
      vendas.push({
        ...ref,
        emissao: nota?.emissao ?? ref.emissao, documento: nota?.documento ?? ref.documento, serie: nota?.serie ?? ref.serie,
        tipo_documento: nota?.tipo_documento ?? ref.tipo_documento, cfop, classe: classificarCfop(cfop),
        vendedor_codigo: nota?.vendedor_codigo ?? ref.vendedor_codigo, vendedor_nome: nota?.vendedor_nome ?? ref.vendedor_nome,
        quantidade: Math.max(0, sobraQtd), valor_nota: sobra, desconto: 0,
      });
    } else if (sobra < -0.005) {
      // A remessa do B foi somada numa linha de venda do A: sai da maior linha de venda.
      const falta = -sobra;
      const alvo = vendas.filter((x) => x.classe === 'venda').sort((x, y) => y.valor_nota - x.valor_nota)[0];
      if (alvo && alvo.valor_nota >= falta - 0.005) {
        alvo.valor_nota = centavos(alvo.valor_nota - falta);
        alvo.quantidade = Math.max(0, alvo.quantidade + sobraQtd);
      } else {
        soNoB += falta;
        anomalias.push(`Cliente ${ref.cliente_codigo}, produto ${ref.produto_codigo} (pedido ${ref.pedido ?? '—'}, nota ${ref.documento}, ${dataBR(ref.emissao)}): R$ ${falta.toFixed(2)} de remessa que o relatório completo não traz — a remessa fica; a venda não muda. Confira no Forteplus.`);
      }
    }
    itens.push(...vendas.filter((x) => Math.abs(x.valor_nota) > 0.005 || x.quantidade !== 0));
  }

  const descartes = {
    cabecalho_repetido: 0, em_branco: 0, rodape: 0, grupo_cliente: 0, remessa_do_completo: 0,
  } as Record<MotivoDescarte, number>;
  for (const { leitura } of [a, b]) {
    for (const [m, n] of Object.entries(leitura.descartes)) descartes[m as MotivoDescarte] += n;
  }
  const linhasLidas = a.leitura.linhasLidas + b.leitura.linhasLidas;
  // As linhas do A que a conta trocou (a remessa vem do B; a venda escondida vira item): contadas, nunca sumidas.
  descartes.remessa_do_completo = linhasLidas - itens.length - Object.values(descartes).reduce((s, n) => s + n, 0);
  return {
    leitura: {
      itens,
      descartes,
      linhasLidas,
      cfopsDesconhecidos: a.leitura.cfopsDesconhecidos,
      // O total do relatório completo, mais a remessa que só o B trouxe — a soma dos itens tem de dar exatamente isto.
      totalImpresso: a.leitura.totalImpresso === null ? null : centavos(a.leitura.totalImpresso + soNoB),
    },
    anomalias,
  };
}

// ---------------------------------------------------------------------------
// O cadastro de clientes (CSV)
// ---------------------------------------------------------------------------

export interface ClienteCadastro {
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  ativo: boolean;
  /**
   * CPF ou CNPJ extraído da própria razão social, quando ela o carrega — o
   * Forteplus escreve o documento dentro do nome nos clientes pessoa física e MEI
   * (`EDMAR ... 04907925611`, `49.932.013 LILIAN ...`), e o CSV **não tem coluna de
   * CNPJ**. `null` quando o nome não traz nada que passe no dígito verificador.
   * Ver `extrairDocumentoDoNome` em `@/lib/documento`.
   */
  documento: string | null;
}

export interface LeituraClientes {
  clientes: ClienteCadastro[];
  tabelas: Record<string, number>;
  semTabela: number;
  /** Quantos tiveram o documento extraído do nome — para a tela dizer ao dono. */
  comDocumento: number;
}

/** As cinco colunas esperadas, na ordem — comparadas sem acento, sem espaço, em maiúsculas. */
const CABECALHO_CLIENTES_ESPERADO = ['CODIGO', 'ATIVO', 'RAZAOSOCIAL', 'FANTASIA', 'TABELA'];

function normalizarCabecalho(campo: string): string {
  // NFD separa a letra do acento (ex.: "Ã" -> "A" + combining tilde
  // U+0303); o replace tira só a faixa de marcas combinantes (U+0300-U+036F).
  return campo.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

/**
 * Lê o CSV de clientes × tabela de preço. O arquivo do dono é Windows-1252,
 * sem BOM (§3.6) — tenta UTF-8 estrito primeiro (um export futuro em UTF-8
 * passa direto) e cai para Windows-1252 quando o UTF-8 estrito lança.
 *
 * Confere a assinatura do cabeçalho antes de ler qualquer linha (achado 7 da
 * auditoria): sem isso, `lerCadastroClientes` aceitava QUALQUER arquivo de
 * texto — inclusive o relatório de VENDAS — e produzia "clientes" com
 * `codigo` igual à linha inteira, que `com_importar_clientes` grava por
 * upsert, sobrescrevendo cadastro legítimo sem desfazer. Mesma postura do
 * leitor de vendas (`assinaturaBate`), que já recusa a ficha errada.
 */
export function lerCadastroClientes(bytes: ArrayBuffer): LeituraClientes {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }

  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const [cabecalho, ...dados] = linhas;

  const colunas = (cabecalho ?? '').split(';').map(normalizarCabecalho);
  const assinaturaBateClientes = CABECALHO_CLIENTES_ESPERADO.every((esperado, i) => colunas[i] === esperado);
  if (!assinaturaBateClientes) {
    throw new Error(
      'Este arquivo não parece o CSV de clientes × tabela de preço do Forteplus — ' +
      `esperava as colunas ${CABECALHO_CLIENTES_ESPERADO.join(';')} e a primeira linha veio "${(cabecalho ?? '').slice(0, 120)}". ` +
      'Nada foi importado.'
    );
  }

  const clientes: ClienteCadastro[] = [];
  const tabelas: Record<string, number> = {};
  let semTabela = 0;
  let comDocumento = 0;

  for (const linha of dados) {
    const [codigo, ativoRaw, razaoSocial, fantasia, tabelaRaw] = linha.split(';');
    const tabela = (tabelaRaw ?? '').trim() || null;
    const nome = (razaoSocial ?? '').trim();
    // O CSV não tem coluna de CNPJ — mas o nome carrega o documento nos clientes
    // pessoa física e MEI. Extrair aqui faz a carga de produção já nascer com
    // documento, em vez de depender de alguém digitar 450 depois.
    const documento = extrairDocumentoDoNome(nome);
    if (documento) comDocumento++;
    clientes.push({
      codigo: (codigo ?? '').trim(),
      razao_social: nome,
      fantasia: (fantasia ?? '').trim() || null,
      tabela_preco: tabela,
      ativo: (ativoRaw ?? '').trim() === 'True',
      documento,
    });
    if (tabela) tabelas[tabela] = (tabelas[tabela] ?? 0) + 1;
    else semTabela++;
  }

  return { clientes, tabelas, semTabela, comDocumento };
}
