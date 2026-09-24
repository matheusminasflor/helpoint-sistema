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

// ---------------------------------------------------------------------------
// CFOP: quatro classes de verdade. O que não está aqui é 'outros' — nunca se
// adivinha (§3.2 e §3.1: uma linha classificada errado já valeu 39% de agosto
// da MF).
// ---------------------------------------------------------------------------
const CFOP_POR_CLASSE: Record<Exclude<ClasseCfop, 'outros'>, string[]> = {
  venda: ['5101', '5102', '5401', '5403', '6101', '6102', '6107', '6401', '6403', '7101', '7949'],
  devolucao: ['1201', '1202', '1410', '1411', '2201'],
  bonificacao: ['5910', '5911', '6910', '6911'],
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
}

export type MotivoDescarte = 'cabecalho_repetido' | 'em_branco' | 'rodape' | 'grupo_cliente';

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

// ---------------------------------------------------------------------------
// O cadastro de clientes (CSV)
// ---------------------------------------------------------------------------

export interface ClienteCadastro {
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  ativo: boolean;
}

export interface LeituraClientes {
  clientes: ClienteCadastro[];
  tabelas: Record<string, number>;
  semTabela: number;
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

  for (const linha of dados) {
    const [codigo, ativoRaw, razaoSocial, fantasia, tabelaRaw] = linha.split(';');
    const tabela = (tabelaRaw ?? '').trim() || null;
    clientes.push({
      codigo: (codigo ?? '').trim(),
      razao_social: (razaoSocial ?? '').trim(),
      fantasia: (fantasia ?? '').trim() || null,
      tabela_preco: tabela,
      ativo: (ativoRaw ?? '').trim() === 'True',
    });
    if (tabela) tabelas[tabela] = (tabelas[tabela] ?? 0) + 1;
    else semTabela++;
  }

  return { clientes, tabelas, semTabela };
}
