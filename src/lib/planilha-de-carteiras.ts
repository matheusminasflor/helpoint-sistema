// O MODELO de planilha das carteiras comerciais (LEVA R, 2026-09-29).
//
// A LEVA Q lia a planilha "de gente" que a equipe usava fora do sistema — qualquer aba com CÓDIGO e
// CLIENTE. O dono pediu o contrário: "uma template padrão que baixamos e colocamos os dados e depois
// importamos, assim evita que qualquer planilha seja importada; e baixar a relação de todos os
// clientes cadastrados no mesmo formato — baixo os 450, coloco a qual carteira pertence e importo".
//
// Então existe UM formato: a aba CARTEIRAS com o cabeçalho abaixo, uma linha por código do Forteplus.
// O sistema gera o arquivo (vazio ou com todos os clientes) e só aceita de volta esse arquivo.
// Das sete colunas, só CARTEIRA e GRUPO são lidas; as outras existem para a pessoa se localizar.
// Célula de CARTEIRA vazia = a linha não muda nada (decisão do dono, 2026-09-29).
import * as XLSX from 'xlsx';
import { normalizeHeader } from '@/lib/planilha';

export const ABA_DO_MODELO = 'CARTEIRAS';
export const COLUNAS_DO_MODELO = ['CÓDIGO', 'CLIENTE', 'FANTASIA', 'TABELA', 'CIDADE-UF', 'CARTEIRA', 'GRUPO'] as const;

/** O que o sistema escreve em cada linha do modelo. */
export interface ClienteDoModelo {
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  cidade: string | null;
  estado: string | null;
  carteira: string | null;
  grupo: string | null;
}

export interface ClienteDaCarteira {
  codigo: string;
  nome: string;
  /** Vazio = o grupo do cliente não muda. */
  grupo: string | null;
}

export interface CarteiraDoModelo {
  carteira: string;
  clientes: ClienteDaCarteira[];
}

export interface Conflito {
  codigo: string;
  /** As linhas da planilha onde o código aparece: "linha 12 (ESPECIAL)". */
  onde: string[];
}

export interface LeituraDoModelo {
  carteiras: CarteiraDoModelo[];
  /** Linhas com CARTEIRA vazia: não mudam nada. */
  semCarteira: number;
  conflitos: Conflito[];
}

export class ModeloInvalido extends Error {}

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** A matriz do modelo: cabeçalho + uma linha por cliente, na ordem de razão social. */
export function linhasDoModelo(clientes: ClienteDoModelo[]): string[][] {
  return [
    [...COLUNAS_DO_MODELO],
    ...[...clientes]
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR'))
      .map((c) => [
        c.codigo, c.razao_social, c.fantasia ?? '', c.tabela_preco ?? '',
        [c.cidade, c.estado].filter(Boolean).join('-'), c.carteira ?? '', c.grupo ?? '',
      ]),
  ];
}

/** Gera e baixa o arquivo do modelo — vazio (`[]`) ou com os clientes do cadastro. */
export function baixarModelo(clientes: ClienteDoModelo[], arquivo: string) {
  const aba = XLSX.utils.aoa_to_sheet(linhasDoModelo(clientes));
  aba['!cols'] = [{ wch: 9 }, { wch: 45 }, { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA_DO_MODELO);
  XLSX.writeFile(wb, arquivo);
}

/**
 * Lê o modelo (nome da aba → matriz, como `readSheets` devolve). Recusa com `ModeloInvalido` o que
 * não é o modelo: sem a aba CARTEIRAS, ou com o cabeçalho diferente.
 * O código que aparece em mais de uma linha não entra em nenhuma: vai para `conflitos`.
 */
export function lerModeloDeCarteiras(planilha: Record<string, unknown[][]>): LeituraDoModelo {
  const nomeDaAba = Object.keys(planilha).find((n) => normalizeHeader(n) === normalizeHeader(ABA_DO_MODELO));
  if (!nomeDaAba) {
    throw new ModeloInvalido('Esta planilha não é o modelo de carteiras (falta a aba CARTEIRAS). Baixe o modelo e preencha nele.');
  }
  const [cabecalho = [], ...linhas] = planilha[nomeDaAba];
  const esperado = COLUNAS_DO_MODELO.map(normalizeHeader);
  if (esperado.some((c, i) => normalizeHeader(cabecalho[i]) !== c)) {
    throw new ModeloInvalido(`O cabeçalho da aba CARTEIRAS não é o do modelo (${COLUNAS_DO_MODELO.join(' | ')}). Baixe o modelo e preencha nele.`);
  }

  const lidas = linhas
    .map((l, i) => ({
      linha: i + 2,
      codigo: texto(l[0]),
      nome: texto(l[1]),
      carteira: texto(l[5]).toUpperCase(),
      grupo: texto(l[6]) || null,
    }))
    .filter((l) => l.codigo);

  const ondeAparece = new Map<string, string[]>();
  for (const l of lidas) {
    ondeAparece.set(l.codigo, [...(ondeAparece.get(l.codigo) ?? []), `linha ${l.linha}${l.carteira ? ` (${l.carteira})` : ''}`]);
  }
  const repetidos = new Set([...ondeAparece].filter(([, onde]) => onde.length > 1).map(([codigo]) => codigo));

  const porCarteira = new Map<string, ClienteDaCarteira[]>();
  let semCarteira = 0;
  for (const l of lidas) {
    if (repetidos.has(l.codigo)) continue;
    if (!l.carteira) { semCarteira += 1; continue; }
    porCarteira.set(l.carteira, [...(porCarteira.get(l.carteira) ?? []), { codigo: l.codigo, nome: l.nome, grupo: l.grupo }]);
  }

  return {
    carteiras: [...porCarteira].map(([carteira, clientes]) => ({ carteira, clientes })),
    semCarteira,
    conflitos: [...repetidos].sort().map((codigo) => ({ codigo, onde: ondeAparece.get(codigo)! })),
  };
}
