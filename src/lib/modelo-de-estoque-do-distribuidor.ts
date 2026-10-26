// O MODELO DE ESTOQUE do Portal do Distribuidor (rodada 2, R5): o estoque que ele já tinha, de uma vez, no lugar de um
// "Tenho X" por produto. O modelo sai com o catálogo inteiro e o que o sistema conta hoje; ele corrige a coluna TENHO e
// envia. Linha com TENHO vazio não muda nada. Quem grava é o banco (`dist_importar_estoque`), com a diferença para o
// que o sistema contava — aqui só se lê a planilha e se monta a prévia. O molde é `modelo-de-colaboradores.ts`.
import * as XLSX from 'xlsx';
import { normalizeHeader, parseAmount } from '@/lib/planilha';

export const ABA_DO_MODELO_DE_ESTOQUE = 'ESTOQUE';
export const COLUNAS_DO_MODELO_DE_ESTOQUE = ['CÓDIGO', 'PRODUTO', 'TENHO'] as const;

export interface LinhaDoEstoqueImportado { linha: number; produto_codigo: string; produto_nome: string; tenho: number; conta: number }
export interface LeituraDoModeloDeEstoque {
  /** As linhas que mudam o estoque (o TENHO é diferente do que o sistema conta). */
  mudam: LinhaDoEstoqueImportado[];
  /** Quantas linhas preenchidas já batiam com o sistema. */
  iguais: number;
  recusadas: { linha: number; motivo: string }[];
}

export class ModeloDeEstoqueInvalido extends Error {}

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** A matriz do modelo: cabeçalho + o catálogo, com o que o sistema conta hoje (vazio quando não conta nada). */
export function linhasDoModeloDeEstoque(produtos: { codigo: string; nome: string }[], saldo: Map<string, number>): (string | number)[][] {
  return [
    [...COLUNAS_DO_MODELO_DE_ESTOQUE],
    ...[...produtos]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => [p.codigo, p.nome, saldo.get(p.codigo) ?? '']),
  ];
}

export function baixarModeloDeEstoque(produtos: { codigo: string; nome: string }[], saldo: Map<string, number>, arquivo: string) {
  const aba = XLSX.utils.aoa_to_sheet(linhasDoModeloDeEstoque(produtos, saldo));
  aba['!cols'] = [12, 50, 10].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA_DO_MODELO_DE_ESTOQUE);
  XLSX.writeFile(wb, arquivo);
}

/**
 * Lê o modelo (nome da aba → matriz, como `readSheets` devolve) contra o catálogo e o que o sistema conta. Recusa com
 * `ModeloDeEstoqueInvalido` o que não é o modelo (sem a aba ESTOQUE ou com outro cabeçalho).
 */
export function lerModeloDeEstoque(
  planilha: Record<string, unknown[][]>, produtos: { codigo: string; nome: string }[], saldo: Map<string, number>,
): LeituraDoModeloDeEstoque {
  const nomeDaAba = Object.keys(planilha).find((n) => normalizeHeader(n) === normalizeHeader(ABA_DO_MODELO_DE_ESTOQUE));
  if (!nomeDaAba) throw new ModeloDeEstoqueInvalido('Esta planilha não é o modelo de estoque (falta a aba ESTOQUE). Baixe o modelo e preencha nele.');
  const [cabecalho = [], ...brutas] = planilha[nomeDaAba];
  if (COLUNAS_DO_MODELO_DE_ESTOQUE.some((c, i) => normalizeHeader(cabecalho[i]) !== normalizeHeader(c))) {
    throw new ModeloDeEstoqueInvalido(`O cabeçalho não é o do modelo (${COLUNAS_DO_MODELO_DE_ESTOQUE.join(' | ')}). Baixe o modelo e preencha nele.`);
  }
  const nomes = new Map(produtos.map((p) => [p.codigo, p.nome]));
  const vistos = new Set<string>();
  const leitura: LeituraDoModeloDeEstoque = { mudam: [], iguais: 0, recusadas: [] };
  brutas.forEach((celulas, i) => {
    const linha = i + 2;
    const codigo = texto(celulas[0]);
    const bruto = texto(celulas[2]);
    if (!bruto) return; // TENHO vazio: não muda nada
    const recusa = (motivo: string) => leitura.recusadas.push({ linha, motivo });
    if (!nomes.has(codigo)) return recusa(codigo ? `o código "${codigo}" não é de um produto do catálogo` : 'falta o código do produto');
    if (vistos.has(codigo)) return recusa(`o produto ${codigo} já apareceu numa linha antes`);
    vistos.add(codigo);
    const tenho = parseAmount(celulas[2]);
    if (tenho === null || tenho < 0) return recusa(`TENHO "${bruto}" não é uma quantidade (zero ou mais)`);
    const conta = saldo.get(codigo) ?? 0;
    if (tenho === conta) { leitura.iguais += 1; return; }
    leitura.mudam.push({ linha, produto_codigo: codigo, produto_nome: nomes.get(codigo)!, tenho, conta });
  });
  return leitura;
}
