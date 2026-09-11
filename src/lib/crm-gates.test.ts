import { describe, expect, it } from 'vitest';
import { describeGate, gateOptions, NATIVE_GATE_OPTIONS } from './crm-gates';
import type { CustomFieldDef } from './custom-fields';

const field = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: 'x', entity: 'contact', key: 'k', label: 'K', type: 'text', options: [], required: false, position: 0, is_active: true, ...over,
});

describe('portões por etapa', () => {
  it('oferece os nativos e os personalizados ativos, com a chave que o banco aceita', () => {
    const options = gateOptions(
      [field({ key: 'transportadora', label: 'Transportadora' }), field({ key: 'antigo', label: 'Antigo', is_active: false })],
      [field({ entity: 'deal', key: 'investimento', label: 'Investimento inicial' })],
    );
    const keys = options.map((o) => o.key);
    expect(keys).toEqual([...NATIVE_GATE_OPTIONS.map((o) => o.key), 'custom.contact.transportadora', 'custom.deal.investimento']);
    // A mesma expressão do CHECK do banco (`crm_gate_keys_valid`).
    const valid = /^(contact\.(document|email|phone|whatsapp|company|city|state)|deal\.(value|expected_close_date)|custom\.(contact|deal)\.[a-z][a-z0-9_]{0,39})$/;
    for (const key of keys) expect(key).toMatch(valid);
  });

  it('descreve o portão pelos rótulos e não esconde chave de campo apagado', () => {
    const options = gateOptions([field({ key: 'transportadora', label: 'Transportadora' })], []);
    expect(describeGate(['contact.document', 'custom.contact.transportadora'], options)).toBe('CPF/CNPJ, Transportadora');
    expect(describeGate(['custom.contact.sumiu'], options)).toBe('custom.contact.sumiu');
  });
});
