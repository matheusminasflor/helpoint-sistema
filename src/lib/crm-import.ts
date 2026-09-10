/**
 * Importação de planilha do CRM (E3, ADR-007) — a parte pura. Lê a matriz
 * que `readSheet` (finance-import) devolve, sugere o casamento de colunas,
 * valida linha a linha e monta o lote que a RPC `crm_import_rows` grava.
 * Quem decide o que é contato repetido é o banco
 * (`crm_find_or_create_contact`); aqui só se acusa repetição DENTRO do
 * arquivo, para a pessoa ver antes de mandar.
 *
 * Referência: o assistente do Twenty (docs/pesquisa-twenty-crm.md, seção 4).
 */
import { normalizeHeader, parseAmount, parseDate } from '@/lib/finance-import';
import { formatCustomValue, parseCustomInput, validateCustomValue, type CustomFieldDef, type CustomValues } from '@/lib/custom-fields';

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_BATCH_SIZE = 200;

export type ContactField = 'name' | 'email' | 'phone' | 'whatsapp' | 'document' | 'company' | 'city' | 'state' | 'notes' | 'owner';
export type DealField = 'deal_title' | 'value' | 'stage' | 'expected_close_date';

/** Para onde uma coluna da planilha vai: campo fixo, campo personalizado ou nada. */
export type TargetId = 'skip' | `contact.${ContactField}` | `deal.${DealField}` | `custom.contact.${string}` | `custom.deal.${string}`;

export interface TargetDef {
  id: TargetId;
  label: string;
  group: 'Contato' | 'Negócio' | 'Campos do contato' | 'Campos do negócio';
  aliases: string[];
  required?: boolean;
}

const FIXED_TARGETS: TargetDef[] = [
  { id: 'contact.name', label: 'Nome do contato', group: 'Contato', required: true, aliases: ['nome', 'contato', 'nome do contato', 'contato nome', 'cliente', 'razao social', 'nome completo', 'lead'] },
  { id: 'contact.email', label: 'E-mail', group: 'Contato', aliases: ['email', 'e mail', 'e-mail', 'contato email', 'endereco de email'] },
  { id: 'contact.phone', label: 'Telefone', group: 'Contato', aliases: ['telefone', 'fone', 'celular', 'telefone comercial', 'contato telefone', 'tel'] },
  { id: 'contact.whatsapp', label: 'WhatsApp', group: 'Contato', aliases: ['whatsapp', 'whats', 'zap'] },
  { id: 'contact.document', label: 'CPF/CNPJ', group: 'Contato', aliases: ['cpf', 'cnpj', 'cpf cnpj', 'documento'] },
  { id: 'contact.company', label: 'Empresa', group: 'Contato', aliases: ['empresa', 'companhia', 'organizacao', 'nome da empresa', 'company'] },
  { id: 'contact.city', label: 'Cidade', group: 'Contato', aliases: ['cidade', 'municipio'] },
  { id: 'contact.state', label: 'Estado (UF)', group: 'Contato', aliases: ['estado', 'uf'] },
  { id: 'contact.notes', label: 'Notas do contato', group: 'Contato', aliases: ['notas', 'observacoes', 'observacao', 'obs', 'comentarios'] },
  { id: 'contact.owner', label: 'Vendedor (dono)', group: 'Contato', aliases: ['vendedor', 'responsavel', 'dono', 'usuario responsavel', 'atendente', 'owner'] },
  { id: 'deal.deal_title', label: 'Título do negócio', group: 'Negócio', aliases: ['negocio', 'titulo', 'nome do negocio', 'nome do lead', 'oportunidade', 'assunto', 'deal'] },
  { id: 'deal.value', label: 'Valor', group: 'Negócio', aliases: ['valor', 'valor do negocio', 'orcamento', 'preco', 'total', 'valor da venda', 'amount'] },
  { id: 'deal.stage', label: 'Etapa do funil', group: 'Negócio', aliases: ['etapa', 'status', 'estagio', 'fase', 'estagio do funil', 'etapa do funil', 'pipeline', 'stage'] },
  { id: 'deal.expected_close_date', label: 'Previsão de fechamento', group: 'Negócio', aliases: ['previsao', 'previsao de fechamento', 'fechamento', 'data de fechamento', 'data prevista'] },
];

/** Alvos disponíveis: os fixos mais os campos personalizados ativos. */
export function buildTargets(contactFields: CustomFieldDef[], dealFields: CustomFieldDef[]): TargetDef[] {
  const custom = (fields: CustomFieldDef[], entity: 'contact' | 'deal', group: TargetDef['group']): TargetDef[] =>
    fields.filter((f) => f.is_active).map((f) => ({
      id: `custom.${entity}.${f.key}` as TargetId,
      label: f.label,
      group,
      aliases: [normalizeHeader(f.label), f.key.replace(/_/g, ' ')],
    }));
  return [...FIXED_TARGETS, ...custom(contactFields, 'contact', 'Campos do contato'), ...custom(dealFields, 'deal', 'Campos do negócio')];
}

/** Coluna → alvo, pelo nome do cabeçalho: igualdade primeiro, depois "contém"; cada alvo entra uma vez. */
export function suggestMapping(headers: string[], targets: TargetDef[]): Record<number, TargetId> {
  const normalized = headers.map(normalizeHeader);
  const mapping: Record<number, TargetId> = {};
  const used = new Set<TargetId>();
  const claim = (index: number, target: TargetDef) => {
    if (used.has(target.id) || mapping[index]) return;
    mapping[index] = target.id;
    used.add(target.id);
  };
  normalized.forEach((h, i) => {
    if (!h) return;
    const exact = targets.find((t) => t.aliases.includes(h));
    if (exact) claim(i, exact);
  });
  normalized.forEach((h, i) => {
    if (!h || mapping[i]) return;
    const partial = targets.find((t) => !used.has(t.id) && t.aliases.some((a) => a.length >= 3 && (h.includes(a) || a.includes(h))));
    if (partial) claim(i, partial);
  });
  return mapping;
}

/** Uma linha lida da planilha, ainda como texto/valor cru, por alvo. */
export interface RawRow {
  line: number;
  values: Partial<Record<TargetId, unknown>>;
}

export function rowsFromMatrix(matrix: unknown[][], headerIndex: number, mapping: Record<number, TargetId>): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    const values: RawRow['values'] = {};
    for (const [index, target] of Object.entries(mapping)) {
      if (target === 'skip') continue;
      const cell = row[Number(index)];
      if (cell === undefined || cell === null || String(cell).trim() === '') continue;
      values[target] = cell;
    }
    rows.push({ line: i + 1, values });
  }
  return rows;
}

export interface ImportContext {
  /** Etapas do funil escolhido, com o tipo. */
  stages: { id: string; name: string; kind: string }[];
  /** Nome da etapa na planilha (normalizado) → id da etapa aqui. Vazio = usa a primeira etapa aberta. */
  stageMap: Record<string, string>;
  /** Pessoas da empresa, para casar o "vendedor" por nome ou e-mail. */
  owners: { id: string; full_name: string | null; email: string }[];
  contactFields: CustomFieldDef[];
  dealFields: CustomFieldDef[];
  /** Sem etapa na planilha (ou sem coluna de etapa), o negócio vai para esta. `null` = não criar negócio. */
  defaultStageId: string | null;
}

/** O que vai para a RPC `crm_import_rows`, já validado. */
export interface ImportRow {
  line: number;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  owner_id: string | null;
  deal_title: string | null;
  value: number;
  stage_id: string | null;
  expected_close_date: string | null;
  contact_custom: CustomValues;
  deal_custom: CustomValues;
}

export interface ValidatedRow {
  line: number;
  row: ImportRow;
  errors: string[];
  warnings: string[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * `parseDate` do Financeiro aceita "99/99/9999" (o Date do JS "corrige" para
 * outro dia). Aqui a data vem de gente digitando: confere os números antes.
 */
export function parseDateStrict(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const s = raw.trim();
    const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let y = 0, mo = 0, d = 0;
    if (br) {
      d = Number(br[1]); mo = Number(br[2]); y = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    } else if (iso) {
      y = Number(iso[1]); mo = Number(iso[2]); d = Number(iso[3]);
    }
    if (br || iso) {
      const dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    }
  }
  return parseDate(raw);
}
const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};
const digits = (v: unknown): string | null => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? d : null;
};

/** Os nomes de etapa distintos que a planilha traz — para a pessoa casá-los com as etapas daqui. */
export function stageNamesIn(rows: RawRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const raw = text(r.values['deal.stage']);
    if (raw && !seen.has(normalizeHeader(raw))) seen.set(normalizeHeader(raw), raw);
  }
  return [...seen.values()];
}

function resolveOwner(raw: unknown, owners: ImportContext['owners']): string | null | undefined {
  const s = normalizeHeader(raw);
  if (!s) return null;
  const found = owners.find((o) => normalizeHeader(o.full_name) === s || normalizeHeader(o.email) === s || normalizeHeader(o.email.split('@')[0]) === s);
  return found ? found.id : undefined;
}

function customFromRow(values: RawRow['values'], entity: 'contact' | 'deal', fields: CustomFieldDef[], errors: string[]): CustomValues {
  const out: CustomValues = {};
  for (const field of fields) {
    const raw = values[`custom.${entity}.${field.key}` as TargetId];
    if (raw === undefined) continue;
    let value: unknown;
    if (field.type === 'boolean') {
      const s = normalizeHeader(raw);
      value = ['sim', 's', 'true', '1', 'x', 'yes', 'y'].includes(s) ? true : ['nao', 'n', 'false', '0', 'no'].includes(s) ? false : raw;
    } else if (field.type === 'date') {
      value = parseDateStrict(raw) ?? raw;
    } else if (field.type === 'number') {
      value = parseAmount(raw) ?? raw;
    } else if (field.type === 'select') {
      const s = normalizeHeader(raw);
      value = field.options.find((o) => normalizeHeader(o.label) === s || o.value === s)?.value ?? String(raw);
    } else {
      value = parseCustomInput('text', String(raw));
    }
    const error = validateCustomValue(field, value);
    if (error) errors.push(error);
    else out[field.key] = value;
  }
  return out;
}

export function validateRows(rows: RawRow[], ctx: ImportContext): ValidatedRow[] {
  const hasStageColumn = rows.some((r) => r.values['deal.stage'] !== undefined);
  const firstOpen = ctx.stages.find((s) => s.kind === 'open')?.id ?? null;

  return rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const v = r.values;

    const name = text(v['contact.name']) ?? text(v['contact.company']);
    if (!name) errors.push('Sem nome');

    const email = text(v['contact.email'])?.toLowerCase() ?? null;
    if (email && !EMAIL_RE.test(email)) errors.push('E-mail inválido');

    const valueRaw = v['deal.value'];
    let value = 0;
    if (valueRaw !== undefined) {
      const parsed = parseAmount(valueRaw);
      if (parsed === null) errors.push('Valor não é número');
      else value = Math.abs(parsed);
    }

    const dateRaw = v['deal.expected_close_date'];
    let expected: string | null = null;
    if (dateRaw !== undefined) {
      expected = parseDateStrict(dateRaw);
      if (!expected) errors.push('Previsão de fechamento não é data');
    }

    let ownerId: string | null = null;
    if (v['contact.owner'] !== undefined) {
      const resolved = resolveOwner(v['contact.owner'], ctx.owners);
      if (resolved === undefined) warnings.push(`Vendedor "${String(v['contact.owner'])}" não encontrado`);
      else ownerId = resolved;
    }

    let stageId: string | null = ctx.defaultStageId;
    const stageRaw = text(v['deal.stage']);
    if (stageRaw) {
      const mapped = ctx.stageMap[normalizeHeader(stageRaw)];
      if (mapped) stageId = mapped;
      else if (ctx.defaultStageId) { stageId = ctx.defaultStageId; warnings.push(`Etapa "${stageRaw}" vai para a etapa padrão`); }
      else errors.push(`Etapa "${stageRaw}" sem correspondência`);
    } else if (hasStageColumn && ctx.defaultStageId === null) {
      stageId = null;
    }
    if (stageId === null && firstOpen === null && ctx.defaultStageId !== null) errors.push('Funil sem etapa aberta');

    const contactCustom = customFromRow(v, 'contact', ctx.contactFields, errors);
    const dealCustom = customFromRow(v, 'deal', ctx.dealFields, errors);

    const phone = digits(v['contact.phone']);
    const row: ImportRow = {
      line: r.line,
      name: name ?? '',
      email,
      phone,
      whatsapp: digits(v['contact.whatsapp']) ?? phone,
      document: digits(v['contact.document']),
      company: text(v['contact.company']),
      city: text(v['contact.city']),
      state: text(v['contact.state'])?.toUpperCase().slice(0, 2) ?? null,
      notes: text(v['contact.notes']),
      owner_id: ownerId,
      deal_title: text(v['deal.deal_title']),
      value,
      stage_id: stageId,
      expected_close_date: expected,
      contact_custom: contactCustom,
      deal_custom: dealCustom,
    };
    return { line: r.line, row, errors, warnings };
  });
}

/** Linhas que repetem e-mail ou telefone de uma linha anterior do MESMO arquivo: linha → primeira ocorrência. */
export function findFileDuplicates(rows: ValidatedRow[]): Map<number, number> {
  const byKey = new Map<string, number>();
  const dupes = new Map<number, number>();
  for (const { line, row } of rows) {
    const keys = [row.email ? `e:${row.email}` : null, row.phone ? `p:${row.phone}` : null].filter((k): k is string => !!k);
    const first = keys.map((k) => byKey.get(k)).find((l) => l !== undefined);
    if (first !== undefined) dupes.set(line, first);
    for (const k of keys) if (!byKey.has(k)) byKey.set(k, line);
  }
  return dupes;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Texto de um valor personalizado para a grade de validação. */
export function previewCustom(fields: CustomFieldDef[], values: CustomValues): string {
  return fields
    .filter((f) => values[f.key] !== undefined)
    .map((f) => `${f.label}: ${formatCustomValue(f, values[f.key])}`)
    .join(' · ');
}
