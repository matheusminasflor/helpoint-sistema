// Leitor da planilha de carteiras comerciais que a equipe usava fora do sistema
// ("CARTEIRAS ATUAL — DE-MG-SP"), para a importação inicial das carteiras (2026-09-29).
//
// É uma planilha DE GENTE, não um relatório: medido no arquivo que o dono enviou,
//   * cada aba (OUTROS ESTADOS, VIP, MG) tem uma linha de cabeçalho com CÓDIGO e CLIENTE, e no fim
//     uma seção INATIVOS com cabeçalho próprio — em OUTROS ESTADOS com as colunas em outra ordem
//     (TABELA | CIDADE | CODIGO | NOME). Por isso a leitura é por CABEÇALHO, e cada cabeçalho novo
//     redefine as colunas das linhas seguintes;
//   * um cliente pode ter vários códigos do Forteplus na mesma célula: "1615 | 1064", "1075|1066",
//     "1195/2015" — é o grupo de cliente;
//   * há linhas sem código (o cliente não foi achado no Forteplus) e linhas de TOTAIS/MÉDIAS/META;
//   * o mesmo código aparece em dois clientes (1075, na aba MG). Isso não se resolve adivinhando: o
//     código sai de todas as abas e vai para a lista de conflitos, que o dono resolve no Cadastro.
//
// Abas sem cabeçalho de código (as conferências "conferencia julho", "Página4") são ignoradas.
// Os números de venda mês a mês da planilha NÃO são lidos: venda é do Forteplus.
import { normalizeHeader } from '@/lib/planilha';

export interface ClienteDaPlanilha {
  /** Os códigos do Forteplus da linha — mais de um quando o cliente é um grupo. */
  codigos: string[];
  nome: string;
}

export interface AbaDeCarteira {
  aba: string;
  clientes: ClienteDaPlanilha[];
  /** Linhas com nome e sem código: ficam de fora, para alguém achar o cliente no Cadastro. */
  semCodigo: string[];
}

export interface Conflito {
  codigo: string;
  /** Onde o código apareceu: "MG: AME COSMÉTICOS LTDA". */
  onde: string[];
}

export interface LeituraDeCarteiras {
  abas: AbaDeCarteira[];
  conflitos: Conflito[];
}

const CABECALHO_CODIGO = new Set(['codigo', 'cod', 'codigos']);
const CABECALHO_NOME = new Set(['cliente', 'nome', 'razao social']);
// "META AJUSTADA" também existe no arquivo real, no pé de OUTROS ESTADOS.
const LINHA_DE_TOTAL = /^(totais|total|medias?|meta( .*)?|inativos)$/;

/** "1615 | 1064", "1075|1066", "1195/2015" → ["1615", "1064"]. Só números. */
export function separarCodigos(celula: unknown): string[] {
  return String(celula ?? '')
    .split(/[|/,;\s]+/)
    .map((c) => c.trim())
    .filter((c) => /^\d+$/.test(c));
}

/** O nome como está, sem o " - INATIVO" que a planilha acrescenta na seção de inativos. */
function limparNome(celula: unknown): string {
  return String(celula ?? '')
    .replace(/\s*-\s*INATIVO\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function acharCabecalho(linha: unknown[]): { codigo: number; nome: number } | null {
  const normalizada = linha.map(normalizeHeader);
  const codigo = normalizada.findIndex((c) => CABECALHO_CODIGO.has(c));
  const nome = normalizada.findIndex((c) => CABECALHO_NOME.has(c));
  return codigo >= 0 && nome >= 0 ? { codigo, nome } : null;
}

function lerAba(aba: string, matriz: unknown[][]): AbaDeCarteira | null {
  let colunas: { codigo: number; nome: number } | null = null;
  const clientes: ClienteDaPlanilha[] = [];
  const semCodigo: string[] = [];
  let achouCabecalho = false;

  for (const linha of matriz) {
    const cabecalho = acharCabecalho(linha);
    if (cabecalho) { colunas = cabecalho; achouCabecalho = true; continue; }
    if (!colunas) continue;

    const codigos = separarCodigos(linha[colunas.codigo]);
    const nome = limparNome(linha[colunas.nome]);
    if (codigos.length > 0) {
      clientes.push({ codigos, nome: nome || codigos.join(' / ') });
    } else if (nome && !LINHA_DE_TOTAL.test(normalizeHeader(nome)) && !/^\d+$/.test(nome)) {
      semCodigo.push(nome);
    }
  }

  return achouCabecalho ? { aba, clientes, semCodigo } : null;
}

/**
 * Lê as abas da planilha (nome da aba → matriz de linhas, como `readSheets` devolve).
 * O código que aparece em mais de uma linha — na mesma aba ou em abas diferentes — sai de TODAS
 * elas e vai para `conflitos` (decisão do dono, 2026-09-29: "fica de fora e é listado").
 */
export function lerPlanilhaDeCarteiras(planilha: Record<string, unknown[][]>): LeituraDeCarteiras {
  const abas = Object.entries(planilha)
    .map(([aba, matriz]) => lerAba(aba, matriz))
    .filter((a): a is AbaDeCarteira => a !== null);

  const ondeAparece = new Map<string, string[]>();
  for (const a of abas) {
    for (const c of a.clientes) {
      for (const codigo of c.codigos) {
        ondeAparece.set(codigo, [...(ondeAparece.get(codigo) ?? []), `${a.aba}: ${c.nome}`]);
      }
    }
  }
  const repetidos = new Set([...ondeAparece].filter(([, onde]) => onde.length > 1).map(([codigo]) => codigo));

  return {
    abas: abas.map((a) => ({
      ...a,
      // Uma linha com um código em conflito sai inteira: gravar só os outros códigos do grupo
      // colocaria meio cliente na carteira.
      clientes: a.clientes.filter((c) => !c.codigos.some((codigo) => repetidos.has(codigo))),
    })),
    conflitos: [...repetidos].sort().map((codigo) => ({ codigo, onde: ondeAparece.get(codigo)! })),
  };
}

/**
 * O nome da carteira sugerido para cada aba (decisão do dono, 2026-09-29): a aba OUTROS ESTADOS é a
 * carteira DEMAIS ESTADOS, e a aba VIP é a carteira que a Diretoria renomeou para ESPECIAL — a
 * renomeação vem do banco (`com_carteira_renomeacoes`), não daqui. A tela deixa trocar.
 */
export function carteiraSugerida(aba: string, renomeacoes: Record<string, string>): string {
  const nome = aba.trim().toUpperCase();
  const base = nome === 'OUTROS ESTADOS' ? 'DEMAIS ESTADOS' : nome;
  return renomeacoes[base] ?? base;
}
