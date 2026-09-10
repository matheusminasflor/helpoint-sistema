import { describe, expect, it } from 'vitest';
import {
  formatCustomValue, parseCustomInput, parseOptionsText, slugify, validateCustomValue, validateCustomValues,
  type CustomFieldDef,
} from './custom-fields';

const base = { id: 'x', entity: 'contact' as const, position: 1, is_active: true, options: [], required: false };
const segmento: CustomFieldDef = {
  ...base, key: 'segmento', label: 'Segmento', type: 'select',
  options: [{ value: 'varejo', label: 'Varejo' }, { value: 'atacado', label: 'Atacado' }],
};

describe('slugify', () => {
  it('vira chave no formato que o banco exige', () => {
    expect(slugify('Cliente desde (ano)')).toBe('cliente_desde_ano');
    expect(slugify('  Nº de funcionários ')).toBe('n_de_funcionarios');
    expect(slugify('2024 meta')).toBe('meta');
    expect(slugify('!!!')).toBe('campo');
  });
});

describe('parseOptionsText', () => {
  it('uma opção por linha, sem repetir e sem vazias', () => {
    expect(parseOptionsText('Varejo\n\nAtacado\nvarejo ')).toEqual([
      { value: 'varejo', label: 'Varejo' },
      { value: 'atacado', label: 'Atacado' },
    ]);
  });
});

describe('validateCustomValue — a mesma regra do trigger crm_validate_custom', () => {
  it('vazio só falha quando obrigatório', () => {
    expect(validateCustomValue({ ...segmento, required: false }, '')).toBeNull();
    expect(validateCustomValue({ ...segmento, required: true }, null)).toMatch(/obrigatório/);
  });
  it('select só aceita uma das opções', () => {
    expect(validateCustomValue(segmento, 'varejo')).toBeNull();
    expect(validateCustomValue(segmento, 'industria')).toMatch(/opções/);
  });
  it('número, sim/não e data conferem o tipo', () => {
    const numero = { label: 'N', type: 'number' as const, options: [], required: false };
    expect(validateCustomValue(numero, 12)).toBeNull();
    expect(validateCustomValue(numero, '12')).toMatch(/número/);
    const bool = { label: 'B', type: 'boolean' as const, options: [], required: false };
    expect(validateCustomValue(bool, true)).toBeNull();
    expect(validateCustomValue(bool, 'sim')).toMatch(/sim ou não/);
    const data = { label: 'D', type: 'date' as const, options: [], required: false };
    expect(validateCustomValue(data, '2024-03-01')).toBeNull();
    expect(validateCustomValue(data, '2024-13-45')).toMatch(/inválida/);
    expect(validateCustomValue(data, '01/03/2024')).toMatch(/data/);
  });
});

describe('parseCustomInput / formatCustomValue', () => {
  it('texto do input vira valor tipado; vazio limpa', () => {
    expect(parseCustomInput('number', '1.234,5'.replace('.', ''))).toBe(1234.5);
    expect(parseCustomInput('number', '')).toBeNull();
    expect(parseCustomInput('boolean', true)).toBe(true);
    expect(parseCustomInput('text', '  oi ')).toBe('oi');
  });
  it('valor tipado vira texto para a tela', () => {
    expect(formatCustomValue(segmento, 'atacado')).toBe('Atacado');
    expect(formatCustomValue({ type: 'date', options: [] }, '2024-03-01')).toBe('01/03/2024');
    expect(formatCustomValue({ type: 'boolean', options: [] }, false)).toBe('Não');
    expect(formatCustomValue({ type: 'number', options: [] }, null)).toBe('');
  });
});

describe('validateCustomValues', () => {
  it('ignora campos desativados e devolve erro por chave', () => {
    const inativo: CustomFieldDef = { ...base, key: 'x', label: 'X', type: 'number', is_active: false, required: true };
    expect(validateCustomValues([segmento, inativo], { segmento: 'nada' })).toEqual({ segmento: 'Segmento só aceita uma das opções' });
    expect(validateCustomValues([segmento], { segmento: 'varejo' })).toEqual({});
  });
});
