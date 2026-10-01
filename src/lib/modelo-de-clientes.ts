// O MODELO ÚNICO DE CLIENTES (2026-10-01).
//
// O cadastro do cliente entrava por três arquivos, em três telas: CLIENTESXTABELA (código, ativo,
// razão, fantasia, tabela), a ficha do Forteplus (CNPJ, endereço, CEP, cidade, UF, e-mail,
// telefone) e o modelo de carteiras (carteira, grupo). O dono decidiu juntar: um modelo só, que o
// sistema gera (vazio ou com todos os clientes) e só aceita de volta nesse formato.
//
// A regra (decisão dele): a planilha muda. Aqui isso quer dizer só "célula vazia não vai": a linha
// manda ao banco apenas o que está preenchido, e é o banco (`com_importar_modelo_de_clientes`) que
// compara com o gravado e lista quem muda. O molde é `planilha-de-carteiras.ts`, o modelo anterior.
import * as XLSX from 'xlsx';
import { normalizeHeader } from '@/lib/planilha';
import { documentoValido, soDigitos } from '@/lib/documento';

export const ABA_DO_MODELO_DE_CLIENTES = 'CLIENTES';
export const COLUNAS_DO_MODELO_DE_CLIENTES = [
  'CÓDIGO', 'ATIVO', 'RAZÃO SOCIAL', 'FANTASIA', 'TABELA', 'CNPJ/CPF', 'ENDEREÇO', 'CEP', 'CIDADE', 'UF',
  'E-MAIL', 'TELEFONE', 'CARTEIRA', 'GRUPO',
] as const;

/** O cliente como o sistema o escreve no modelo ("baixar com todos os clientes"). */
export interface ClienteDoModeloUnico {
  codigo: string;
  ativo: boolean | null;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  documento: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
  email: string | null;
  telefone: string | null;
  carteira: string | null;
  grupo: string | null;
}

/** Uma linha lida: só os campos preenchidos (o vazio não muda nada). `ativo` vai como texto. */
export type LinhaDoModeloUnico = { codigo: string } & Partial<Record<
  'ativo' | 'razao_social' | 'fantasia' | 'tabela_preco' | 'documento' | 'endereco' | 'cep' | 'cidade'
  | 'estado' | 'email' | 'telefone' | 'carteira' | 'grupo', string>>;

export interface Recusado {
  codigo: string;
  /** "linha 12: CNPJ/CPF 123 não é válido" — o que a prévia mostra. */
  motivo: string;
}

export interface LeituraDoModeloUnico {
  linhas: LinhaDoModeloUnico[];
  /** Valores que não passam (CNPJ inválido, ATIVO que não é SIM/NÃO): o campo fica de fora, a linha entra. */
  recusados: Recusado[];
  /** Código que aparece em mais de uma linha: não entra em nenhuma. */
  repetidos: { codigo: string; onde: string[] }[];
  /** As carteiras citadas no arquivo, em maiúsculas — uma escolha de vendedora para cada. */
  carteiras: string[];
}

export class ModeloDeClientesInvalido extends Error {}

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

function lerAtivo(v: string): 'true' | 'false' | null | undefined {
  if (!v) return undefined;
  const n = normalizeHeader(v); // minúsculas e sem acento: "NÃO" vira "nao"
  if (['sim', 's', 'true', '1', 'ativo'].includes(n)) return 'true';
  if (['nao', 'n', 'false', '0', 'inativo'].includes(n)) return 'false';
  return null;
}

/** A matriz do modelo: cabeçalho + uma linha por cliente, na ordem de razão social. */
export function linhasDoModeloUnico(clientes: ClienteDoModeloUnico[]): string[][] {
  return [
    [...COLUNAS_DO_MODELO_DE_CLIENTES],
    ...[...clientes]
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR'))
      .map((c) => [
        c.codigo, c.ativo === false ? 'NÃO' : 'SIM', c.razao_social, c.fantasia ?? '', c.tabela_preco ?? '',
        c.documento ?? '', c.endereco ?? '', c.cep ?? '', c.cidade ?? '', c.estado ?? '', c.email ?? '',
        c.telefone ?? '', c.carteira ?? '', c.grupo ?? '',
      ]),
  ];
}

/** Gera e baixa o modelo — vazio (`[]`) ou com os clientes do cadastro. */
export function baixarModeloUnico(clientes: ClienteDoModeloUnico[], arquivo: string) {
  const aba = XLSX.utils.aoa_to_sheet(linhasDoModeloUnico(clientes));
  aba['!cols'] = [9, 7, 45, 30, 18, 20, 45, 11, 22, 5, 30, 16, 18, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA_DO_MODELO_DE_CLIENTES);
  XLSX.writeFile(wb, arquivo);
}

/**
 * Lê o modelo (nome da aba → matriz, como `readSheets` devolve). Recusa com
 * `ModeloDeClientesInvalido` o que não é o modelo: sem a aba CLIENTES, ou com outro cabeçalho.
 */
export function lerModeloDeClientes(planilha: Record<string, unknown[][]>): LeituraDoModeloUnico {
  const nomeDaAba = Object.keys(planilha)
    .find((n) => normalizeHeader(n) === normalizeHeader(ABA_DO_MODELO_DE_CLIENTES));
  if (!nomeDaAba) {
    throw new ModeloDeClientesInvalido('Esta planilha não é o modelo de clientes (falta a aba CLIENTES). Baixe o modelo e preencha nele.');
  }
  const [cabecalho = [], ...brutas] = planilha[nomeDaAba];
  const esperado = COLUNAS_DO_MODELO_DE_CLIENTES.map(normalizeHeader);
  if (esperado.some((c, i) => normalizeHeader(cabecalho[i]) !== c)) {
    throw new ModeloDeClientesInvalido(
      `O cabeçalho da aba CLIENTES não é o do modelo (${COLUNAS_DO_MODELO_DE_CLIENTES.join(' | ')}). Baixe o modelo e preencha nele.`,
    );
  }

  const recusados: Recusado[] = [];
  const lidas = brutas
    .map((l, i) => ({ numero: i + 2, celulas: l.map(texto) }))
    .filter((l) => l.celulas[0]);

  const ondeAparece = new Map<string, string[]>();
  for (const l of lidas) ondeAparece.set(l.celulas[0], [...(ondeAparece.get(l.celulas[0]) ?? []), `linha ${l.numero}`]);
  const repetidos = [...ondeAparece].filter(([, onde]) => onde.length > 1).map(([codigo, onde]) => ({ codigo, onde }));
  const repetido = new Set(repetidos.map((r) => r.codigo));

  const linhas: LinhaDoModeloUnico[] = [];
  const carteiras = new Set<string>();
  for (const { numero, celulas: c } of lidas) {
    const codigo = c[0];
    if (repetido.has(codigo)) continue;
    const linha: LinhaDoModeloUnico = { codigo };
    const por = (campo: keyof LinhaDoModeloUnico, valor: string) => { if (valor) (linha as Record<string, string>)[campo] = valor; };

    const ativo = lerAtivo(c[1]);
    if (ativo === null) recusados.push({ codigo, motivo: `linha ${numero}: ATIVO "${c[1]}" não é SIM nem NÃO` });
    else if (ativo) linha.ativo = ativo;

    por('razao_social', c[2]);
    por('fantasia', c[3]);
    por('tabela_preco', c[4].toUpperCase());

    if (c[5]) {
      const doc = soDigitos(c[5]);
      if (documentoValido(doc)) linha.documento = doc;
      else recusados.push({ codigo, motivo: `linha ${numero}: CNPJ/CPF "${c[5]}" não é válido` });
    }

    por('endereco', c[6]);
    por('cep', soDigitos(c[7]));
    por('cidade', c[8]);
    por('estado', c[9].toUpperCase());
    por('email', c[10].toLowerCase());
    por('telefone', c[11]);
    por('carteira', c[12].toUpperCase());
    por('grupo', c[13]);
    if (linha.carteira) carteiras.add(linha.carteira);

    linhas.push(linha);
  }

  return { linhas, recusados, repetidos, carteiras: [...carteiras].sort() };
}
