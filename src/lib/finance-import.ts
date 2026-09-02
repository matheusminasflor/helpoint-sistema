import * as XLSX from 'xlsx';
import type { FinKind, FinStatus } from '@/types/financeiro';

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
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Converte "R$ 1.234,56", "1234.56", 1234.56 ou "(120,00)" em número. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[()\-]/g, '').replace(/r\$/i, '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Aceita serial do Excel, Date, "dd/mm/aaaa" e "aaaa-mm-dd". Retorna ISO (aaaa-mm-dd). */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return toISO(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return toISO(new Date(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toISO(new Date(year, Number(m[2]) - 1, Number(m[1])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toISO(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseStatus(raw: unknown, settled: string | null, due: string): FinStatus {
  const s = normalizeHeader(raw);
  if (s.includes('cancel') || s.includes('baixado por cancel')) return 'cancelled';
  if (s.includes('pago') || s.includes('quitado') || s.includes('liquidado') || s.includes('recebido') || s.includes('baixado')) return 'paid';
  if (settled) return 'paid';
  const today = new Date().toISOString().slice(0, 10);
  return due < today ? 'overdue' : 'pending';
}

export function competenceOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
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

export async function readSheet(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
}

export interface ParseOptions {
  /** Sobrescreve o mapeamento automático (campo → índice da coluna). */
  overrides?: Partial<Record<FinField, number>>;
  format?: ImportFormat;
}

export function parseMatrix(matrix: unknown[][], kind: FinKind, options: ParseOptions = {}): ParseResult {
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

      const settled = parseDate(cell(row, 'settled_at'));
      const status = parseStatus(cell(row, 'status'), settled, due);
      const competence = competenceOf(settled && status === 'paid' ? due : due);
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
  };
}

export async function parseFinanceFile(file: File, kind: FinKind, options: ParseOptions = {}): Promise<ParseResult> {
  const matrix = await readSheet(file);
  return parseMatrix(matrix, kind, options);
}
