/**
 * Campos personalizados do CRM (E2, ADR-007) — a parte pura, sem React nem
 * Supabase. A definição vive em `crm_custom_fields`; o valor, em
 * `crm_contacts.custom` / `crm_deals.custom` (`{chave: valor}`), validado
 * pelo trigger `crm_validate_custom` (migration 20260911020000).
 * `validateCustomValue` repete a regra do trigger para o formulário acusar
 * antes de salvar — quem decide é o banco.
 */

export type CustomFieldEntity = 'contact' | 'deal';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomFieldOption {
  value: string;
  label: string;
}

export interface CustomFieldDef {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: CustomFieldOption[];
  required: boolean;
  position: number;
  is_active: boolean;
}

export type CustomValues = Record<string, unknown>;

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  select: 'Lista de opções',
  boolean: 'Sim / não',
};

export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  contact: 'Contato',
  deal: 'Negócio',
};

/** "Cliente desde (ano)" → "cliente_desde_ano". Mesmo formato que o CHECK da coluna `key` exige. */
export function slugify(label: string): string {
  const key = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40);
  return key || 'campo';
}

/** As opções de uma lista, uma por linha, viram `{value, label}`; o valor é o slug do rótulo. */
export function parseOptionsText(text: string): CustomFieldOption[] {
  const seen = new Set<string>();
  const out: CustomFieldOption[] = [];
  for (const raw of text.split('\n')) {
    const label = raw.trim();
    if (!label) continue;
    const value = slugify(label);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Devolve a mensagem de erro, ou `null` quando o valor serve. `null`/`undefined`/'' = campo vazio. */
export function validateCustomValue(field: Pick<CustomFieldDef, 'label' | 'type' | 'options' | 'required'>, value: unknown): string | null {
  const empty = value === null || value === undefined || value === '';
  if (empty) return field.required ? `${field.label} é obrigatório` : null;
  switch (field.type) {
    case 'text':
      return typeof value === 'string' ? null : `${field.label} espera texto`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${field.label} espera número`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${field.label} espera sim ou não`;
    case 'date': {
      if (typeof value !== 'string' || !DATE_RE.test(value)) return `${field.label} espera uma data`;
      // Data local (regra 4): monta pelos números e confere se o calendário não "corrigiu" (2024-13-45 → vira outro dia).
      const [y, m, d] = value.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
      return valid ? null : `${field.label} tem data inválida`;
    }
    case 'select':
      return typeof value === 'string' && field.options.some((o) => o.value === value)
        ? null
        : `${field.label} só aceita uma das opções`;
  }
}

/** O que o input devolve (texto) vira o valor tipado que o banco espera. '' vira `null` (limpa). */
export function parseCustomInput(type: CustomFieldType, raw: string | boolean): unknown {
  if (type === 'boolean') return typeof raw === 'boolean' ? raw : raw === 'true';
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (text === '') return null;
  if (type === 'number') {
    const n = Number(text.replace(',', '.'));
    return Number.isFinite(n) ? n : text;
  }
  return text;
}

/** Valor tipado → texto para a tela e para a planilha. */
export function formatCustomValue(field: Pick<CustomFieldDef, 'type' | 'options'>, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'boolean':
      return value ? 'Sim' : 'Não';
    case 'select':
      return field.options.find((o) => o.value === value)?.label ?? String(value);
    case 'date': {
      const [y, m, d] = String(value).split('-');
      return y && m && d ? `${d}/${m}/${y}` : String(value);
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value);
    default:
      return String(value);
  }
}

/** Erros por chave de um conjunto de valores, só dos campos ativos. Vazio = pode salvar. */
export function validateCustomValues(fields: CustomFieldDef[], values: CustomValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.is_active) continue;
    const error = validateCustomValue(field, values[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}
