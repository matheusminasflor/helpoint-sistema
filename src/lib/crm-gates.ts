import type { CustomFieldDef } from '@/lib/custom-fields';

/**
 * Portões por etapa (CRM-1b): o que precisa estar preenchido para um negócio
 * entrar numa etapa. A chave é a mesma que o banco aceita em
 * `crm_pipeline_stages.required_fields` (`crm_gate_keys_valid`) e a mensagem
 * de recusa é do banco (`crm_deals_check_stage_gate`). Aqui só a lista que a
 * tela oferece e os rótulos — sem regra.
 */

export interface GateOption {
  key: string;
  label: string;
  group: 'Contato' | 'Negócio';
}

/** Campos nativos que podem virar portão. A ordem é a da tela. */
export const NATIVE_GATE_OPTIONS: GateOption[] = [
  { key: 'contact.document', label: 'CPF/CNPJ', group: 'Contato' },
  { key: 'contact.email', label: 'E-mail', group: 'Contato' },
  { key: 'contact.phone', label: 'Telefone', group: 'Contato' },
  { key: 'contact.whatsapp', label: 'WhatsApp', group: 'Contato' },
  { key: 'contact.company', label: 'Empresa', group: 'Contato' },
  { key: 'contact.city', label: 'Cidade', group: 'Contato' },
  { key: 'contact.state', label: 'Estado', group: 'Contato' },
  { key: 'deal.value', label: 'Valor do negócio', group: 'Negócio' },
  { key: 'deal.expected_close_date', label: 'Previsão de fechamento', group: 'Negócio' },
];

/** Nativos + campos personalizados ativos, cada um com a chave que o banco entende. */
export function gateOptions(contactFields: CustomFieldDef[], dealFields: CustomFieldDef[]): GateOption[] {
  const custom = (fields: CustomFieldDef[], entity: 'contact' | 'deal', group: GateOption['group']) =>
    fields.filter((f) => f.is_active).map((f) => ({ key: `custom.${entity}.${f.key}`, label: f.label, group }));
  return [...NATIVE_GATE_OPTIONS, ...custom(contactFields, 'contact', 'Contato'), ...custom(dealFields, 'deal', 'Negócio')];
}

/** Rótulo de uma chave; chave sem opção (campo apagado) volta como está, para não sumir da tela. */
export function gateLabel(key: string, options: GateOption[]): string {
  return options.find((o) => o.key === key)?.label ?? key;
}

/** "CPF/CNPJ, Transportadora" — o resumo que a linha da etapa mostra. */
export function describeGate(keys: string[], options: GateOption[]): string {
  return keys.map((k) => gateLabel(k, options)).join(', ');
}
