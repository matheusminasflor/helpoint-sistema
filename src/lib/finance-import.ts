import type { FinKind, FinStatus } from '@/types/financeiro';
import { lerForteplusFin, tipoDoRelatorio } from '@/lib/forteplus-fin';
import { competenceOf, normalizeHeader, parseAmount, parseDate, readSheet } from '@/lib/planilha';

// Reexportadas de `@/lib/planilha`, onde passaram a morar para o Forteplus poder usar
// as mesmas sem que os dois arquivos se importem em círculo. Continuam disponíveis
// aqui porque `ComercialImportar`, o diálogo de importação e os testes já as pedem
// deste caminho — mover a casa não precisa mover os chamadores.
export { competenceOf, normalizeHeader, parseAmount, parseDate, readSheet };

/**
 * Importador financeiro genérico.
 *
 * O modelo de dados é neutro: qualquer planilha que tenha, no mínimo,
 * descrição, valor e vencimento pode ser importada. Os "formatos" (ex.: Forteplus)
 * são apenas dicionários de sinônimos de cabeçalho — nenhum layout fica embutido
 * na regra de negócio.
 */

export type FinField =
  | 'description'
  | 'category'
  | 'counterparty'
  | 'document_number'
  | 'amount'
  | 'due_date'
  | 'settled_at'
  | 'status'
  | 'payment_method'
  | 'cost_center'
  | 'notes';

export const FIELD_LABEL: Record<FinField, string> = {
  description: 'Descrição',
  category: 'Categoria',
  counterparty: 'Fornecedor / Cliente',
  document_number: 'Documento',
  amount: 'Valor',
  due_date: 'Vencimento',
  settled_at: 'Pagamento / Recebimento',
  status: 'Situação',
  payment_method: 'Forma de pagamento',
  cost_center: 'Centro de custo',
  notes: 'Observações',
};

export const REQUIRED_FIELDS: FinField[] = ['description', 'amount', 'due_date'];

/** Sinônimos de cabeçalho aceitos (normalizados: minúsculo, sem acento). */
const ALIASES: Record<FinField, string[]> = {
  description: ['descricao', 'historico', 'historico do lancamento', 'titulo', 'lancamento', 'observacao do titulo'],
  category: ['categoria', 'plano de contas', 'conta contabil', 'classificacao', 'natureza'],
  counterparty: ['fornecedor', 'cliente', 'razao social', 'nome', 'favorecido', 'sacado', 'beneficiario', 'parceiro'],
  document_number: ['documento', 'nro documento', 'n documento', 'numero documento', 'nota fiscal', 'nf', 'titulo numero', 'duplicata'],
  amount: ['valor', 'valor do titulo', 'valor total', 'vlr', 'valor liquido', 'valor original'],
  due_date: ['vencimento', 'data de vencimento', 'data vencimento', 'dt vencimento', 'venc'],
  settled_at: ['pagamento', 'data de pagamento', 'data pagamento', 'baixa', 'data da baixa', 'recebimento', 'data de recebimento', 'liquidacao', 'dt baixa'],
  status: ['situacao', 'status', 'condicao'],
  payment_method: ['forma de pagamento', 'forma pagamento', 'meio de pagamento', 'portador', 'tipo de pagamento'],
  cost_center: ['centro de custo', 'centro custo', 'departamento', 'setor', 'filial', 'unidade'],
  notes: ['observacoes', 'observacao', 'obs', 'complemento'],
};

export type ImportFormat = 'generic' | 'forteplus';

export interface ParsedRow {
  description: string;
  category: string | null;
  counterparty: string | null;
  document_number: string | null;
  amount: number;
  due_date: string;
  settled_at: string | null;
  status: FinStatus;
  payment_method: string | null;
  cost_center: string | null;
  notes: string | null;
  competence: string;
  /**
   * Identidade da linha na ORIGEM, quando a origem tem uma. Vai para
   * `fin_entries.external_id`, que tem único parcial por (tenant_id, external_id) —
   * é o que faz reimportar o mesmo relatório ATUALIZAR a parcela em vez de criar uma
   * segunda. A planilha genérica não tem identidade estável, então aqui é opcional:
   * quem vem de arquivo montado à mão continua entrando como lançamento novo.
   */
  external_id?: string | null;
}

export interface ParseResult {
  headers: string[];
  /** Campo → índice da coluna detectada (−1 quando não encontrado). */
  mapping: Record<FinField, number>;
  rows: ParsedRow[];
  /** Linhas descartadas com o motivo. */
  errors: { line: number; reason: string }[];
  missingRequired: FinField[];
  competences: string[];
  totalAmount: number;
  format: ImportFormat;
  /**
   * Por que este arquivo não serve — quando ele não serve por inteiro, e não por
   * linha. É o caso do Forteplus: subir o relatório de contas a PAGAR na tela de
   * contas a RECEBER gravaria 40 despesas como receita, e nada no resultado
   * acusaria. Mensagem aqui = o diálogo mostra e bloqueia; `null` = segue.
   */
  erro: string | null;
}


/**
 * A situação da conta, lida da planilha.
 *
 * **NUNCA devolve `overdue`, e é a correção de 2026-09-27.** Antes ela gravava
 * `'overdue'` quando o vencimento já tinha passado — e ficava grudado: mudar o
 * vencimento para o futuro **não** devolvia a conta a "Pendente", porque
 * `effectiveStatus` (`@/types/financeiro`) só recalcula "atrasado" quando o status
 * guardado é `pending`. A conta ficava "Atrasada" para sempre.
 *
 * "Atrasado" não é um estado que se grava: é uma **leitura** de `due_date` contra
 * hoje. Gravando `pending`, a tela mostra exatamente o mesmo para quem está de
 * fato vencido (`effectiveStatus` decide), e passa a se corrigir sozinha quando a
 * data muda. Uma fonte só para "atrasado" — é a mesma razão de `effectiveStatus`
 * existir.
 */
function parseStatus(raw: unknown, settled: string | null): FinStatus {
  const s = normalizeHeader(raw);
  if (s.includes('cancel') || s.includes('baixado por cancel')) return 'cancelled';
  if (s.includes('pago') || s.includes('quitado') || s.includes('liquidado') || s.includes('recebido') || s.includes('baixado')) return 'paid';
  if (settled) return 'paid';
  return 'pending';
}

function detectHeaderRow(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const row = matrix[i] || [];
    const normalized = row.map(normalizeHeader);
    const hits = (Object.keys(ALIASES) as FinField[]).filter((f) =>
      normalized.some((h) => h && ALIASES[f].some((a) => h === a || h.includes(a))),
    );
    if (hits.length >= 2 && normalized.some((h) => ALIASES.amount.some((a) => h.includes(a)))) return i;
  }
  return -1;
}

function autoMap(headers: string[]): Record<FinField, number> {
  const normalized = headers.map(normalizeHeader);
  const mapping = {} as Record<FinField, number>;
  for (const field of Object.keys(ALIASES) as FinField[]) {
    let index = normalized.findIndex((h) => h && ALIASES[field].includes(h));
    if (index === -1) index = normalized.findIndex((h) => h && ALIASES[field].some((a) => h.includes(a)));
    mapping[field] = index;
  }
  // "Fornecedor" e "Cliente" podem colidir com "Nome"; mantém a primeira ocorrência.
  return mapping;
}

export interface ParseOptions {
  /** Sobrescreve o mapeamento automático (campo → índice da coluna). */
  overrides?: Partial<Record<FinField, number>>;
  format?: ImportFormat;
}

export function parseMatrix(matrix: unknown[][], kind: FinKind, options: ParseOptions = {}): ParseResult {
  // O Forteplus NÃO passa por aqui, e é a correção de 2026-09-28. O caminho abaixo
  // casa campo com coluna pelo nome do cabeçalho, e naqueles dois relatórios o
  // cabeçalho impresso aponta para colunas diferentes das dos dados (célula mesclada
  // desloca o rótulo). O resultado era silencioso: "Vencimento" rotulado na coluna 9,
  // dado na 10, o leitor achava vazio e descartava TODAS as linhas. Importar contas a
  // pagar do Forteplus trazia zero lançamentos, e o formato no diálogo era só um
  // rótulo — nada no código olhava para ele. Agora olha.
  if (options.format === 'forteplus') return lerForteplusComoParseResult(matrix, kind);

  const headerIndex = detectHeaderRow(matrix);
  const headers = headerIndex >= 0 ? (matrix[headerIndex] || []).map((h) => String(h ?? '').trim()) : [];
  const mapping = { ...autoMap(headers), ...(options.overrides || {}) } as Record<FinField, number>;

  const rows: ParsedRow[] = [];
  const errors: { line: number; reason: string }[] = [];
  const competences = new Set<string>();
  let totalAmount = 0;

  const cell = (row: unknown[], field: FinField): unknown => {
    const index = mapping[field];
    return index >= 0 ? row[index] : '';
  };
  const text = (row: unknown[], field: FinField): string | null => {
    const v = String(cell(row, field) ?? '').trim();
    return v || null;
  };

  if (headerIndex >= 0) {
    for (let i = headerIndex + 1; i < matrix.length; i++) {
      const row = matrix[i] || [];
      if (row.every((c) => String(c ?? '').trim() === '')) continue;

      const description = text(row, 'description') || text(row, 'counterparty');
      const amount = parseAmount(cell(row, 'amount'));
      const due = parseDate(cell(row, 'due_date'));

      if (!description && amount === null && !due) continue; // linha de totalização/rodapé
      if (!description) { errors.push({ line: i + 1, reason: 'Sem descrição' }); continue; }
      if (amount === null) { errors.push({ line: i + 1, reason: 'Valor inválido' }); continue; }
      if (!due) { errors.push({ line: i + 1, reason: 'Vencimento inválido' }); continue; }

      const settledLido = parseDate(cell(row, 'settled_at'));
      const status = parseStatus(cell(row, 'status'), settledLido);
      // Conta paga TEM data (decisão do dono, 2026-09-27, e o CHECK
      // `fin_entries_paga_tem_data` garante). Quando a planilha diz "pago" e não
      // traz a data, vale o VENCIMENTO — nunca hoje. O trigger do banco preencheria
      // com hoje, e aí um ano de contas pagas importadas cairia todo no mês
      // corrente do realizado, inventando um mês gigante e esvaziando os outros.
      // `due_date` é o mais honesto que existe aqui: não há registro do dia do
      // pagamento, e o vencimento é a data que a pessoa conhece.
      const settled = status === 'paid' ? (settledLido ?? due) : settledLido;
      const competence = competenceOf(due);
      competences.add(competence);
      totalAmount += Math.abs(amount);

      rows.push({
        description,
        category: text(row, 'category'),
        counterparty: text(row, 'counterparty'),
        document_number: text(row, 'document_number'),
        amount: Math.abs(amount),
        due_date: due,
        settled_at: settled,
        status,
        payment_method: text(row, 'payment_method'),
        cost_center: text(row, 'cost_center'),
        notes: text(row, 'notes'),
        competence,
      });
    }
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => mapping[f] === undefined || mapping[f] < 0);

  return {
    headers,
    mapping,
    rows,
    errors,
    missingRequired: headerIndex < 0 ? REQUIRED_FIELDS : missingRequired,
    competences: [...competences].sort(),
    totalAmount,
    format: options.format || 'generic',
    erro: null,
  };
}

/**
 * Adapta o leitor posicional do Forteplus ao formato que o diálogo já sabe mostrar.
 *
 * Fica aqui, e não em `forteplus-fin.ts`, para o import ser em um sentido só:
 * `finance-import` conhece o Forteplus; o Forteplus não precisa conhecer o diálogo.
 */
function lerForteplusComoParseResult(matrix: unknown[][], kind: FinKind): ParseResult {
  const vazio = (erro: string): ParseResult => ({
    headers: [], mapping: {} as Record<FinField, number>, rows: [], errors: [],
    missingRequired: [], competences: [], totalAmount: 0, format: 'forteplus', erro,
  });

  const tipo = tipoDoRelatorio(matrix);
  if (!tipo) {
    return vazio(
      'Este arquivo não parece o relatório de Contas a Pagar nem de Contas a Receber do ' +
      'Forteplus. Se é outra planilha, troque o formato para "Planilha genérica".'
    );
  }
  const esperado = kind === 'payable' ? 'pagar' : 'receber';
  if (tipo !== esperado) {
    return vazio(
      `Este é o relatório de Contas a ${tipo === 'pagar' ? 'Pagar' : 'Receber'}, e esta tela ` +
      `importa Contas a ${esperado === 'pagar' ? 'Pagar' : 'Receber'}.`
    );
  }

  const leitura = lerForteplusFin(matrix, tipo);
  if (leitura.linhas.length === 0) {
    return vazio('Não encontrei nenhuma linha de título neste relatório.');
  }

  // O relatório imprime o próprio "Totais:". Não fechar significa que uma coluna
  // mudou de lugar — importar assim grava um número errado que ninguém confere
  // depois. A folga é de um centavo por título, o arredondamento possível.
  if (leitura.totalImpresso !== null) {
    const folga = Math.max(0.05, leitura.linhas.length * 0.01);
    if (Math.abs(leitura.total - leitura.totalImpresso) > folga) {
      return vazio(
        `O relatório imprime "Totais: ${leitura.totalImpresso.toFixed(2)}" e eu li ` +
        `${leitura.total.toFixed(2)} em ${leitura.linhas.length} títulos. Alguma coluna do ` +
        'relatório mudou de lugar.'
      );
    }
  }

  return {
    // Sem cabeçalho e sem mapa: a leitura é por posição medida, e oferecer "aponte a
    // coluna" aqui convidaria a estragar o que está certo.
    headers: [],
    mapping: {} as Record<FinField, number>,
    rows: leitura.linhas,
    errors: leitura.descartadas.map((d) => ({ line: d.linha, reason: d.motivo })),
    missingRequired: [],
    competences: leitura.competencias,
    totalAmount: leitura.total,
    format: 'forteplus',
    erro: null,
  };
}

export async function parseFinanceFile(file: File, kind: FinKind, options: ParseOptions = {}): Promise<ParseResult> {
  const matrix = await readSheet(file);
  return parseMatrix(matrix, kind, options);
}
