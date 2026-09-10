import { describe, expect, it } from 'vitest';
import { buildTargets, findFileDuplicates, rowsFromMatrix, stageNamesIn, suggestMapping, validateRows, type ImportContext } from './crm-import';
import type { CustomFieldDef } from './custom-fields';

const segmento: CustomFieldDef = {
  id: 'f1', entity: 'contact', key: 'segmento', label: 'Segmento', type: 'select', required: false, position: 1, is_active: true,
  options: [{ value: 'varejo', label: 'Varejo' }, { value: 'atacado', label: 'Atacado' }],
};
const targets = buildTargets([segmento], []);

const ctx: ImportContext = {
  stages: [{ id: 'st-novo', name: 'Novo', kind: 'open' }, { id: 'st-neg', name: 'Negociação', kind: 'open' }, { id: 'st-won', name: 'Ganho', kind: 'won' }],
  stageMap: { negociacao: 'st-neg', 'em negociacao': 'st-neg' },
  owners: [{ id: 'u1', full_name: 'Ana Souza', email: 'ana@empresa.com' }],
  contactFields: [segmento],
  dealFields: [],
  defaultStageId: 'st-novo',
};

describe('suggestMapping', () => {
  it('casa cabeçalhos por sinônimo, sem repetir alvo', () => {
    const headers = ['Nome do lead', 'Contato: Nome', 'E-mail', 'Telefone', 'Etapa', 'Valor', 'Responsável', 'Segmento', 'Coluna X'];
    const m = suggestMapping(headers, targets);
    expect(m[0]).toBe('deal.deal_title');
    expect(m[1]).toBe('contact.name');
    expect(m[2]).toBe('contact.email');
    expect(m[3]).toBe('contact.phone');
    expect(m[4]).toBe('deal.stage');
    expect(m[5]).toBe('deal.value');
    expect(m[6]).toBe('contact.owner');
    expect(m[7]).toBe('custom.contact.segmento');
    expect(m[8]).toBeUndefined();
  });
});

describe('rowsFromMatrix + validateRows', () => {
  const matrix: unknown[][] = [
    ['Nome', 'E-mail', 'Telefone', 'Etapa', 'Valor', 'Responsável', 'Segmento', 'Previsão'],
    ['Loja A', 'a@x.com', '(31) 99999-0001', 'Em negociação', 'R$ 1.500,00', 'Ana Souza', 'Varejo', '31/12/2026'],
    ['', 'sem-nome@x.com', '', '', '', '', '', ''],
    ['Loja B', 'nao-e-email', '', 'Etapa Desconhecida', 'abc', 'Zé', 'Indústria', '99/99/9999'],
    ['Loja C', 'A@X.COM', '', '', '', '', '', ''],
  ];
  const mapping = suggestMapping(matrix[0] as string[], targets);
  const raw = rowsFromMatrix(matrix, 0, mapping);

  it('lê as linhas não vazias com o número da linha da planilha', () => {
    expect(raw.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    expect(stageNamesIn(raw)).toEqual(['Em negociação', 'Etapa Desconhecida']);
  });

  it('valida e resolve etapa, vendedor, valor, data e campo personalizado', () => {
    const [ok, semNome, ruim] = validateRows(raw, ctx);
    expect(ok.errors).toEqual([]);
    expect(ok.row).toMatchObject({ name: 'Loja A', email: 'a@x.com', phone: '31999990001', stage_id: 'st-neg', value: 1500, owner_id: 'u1', expected_close_date: '2026-12-31', contact_custom: { segmento: 'varejo' } });
    expect(semNome.errors).toContain('Sem nome');
    expect(ruim.errors).toEqual(expect.arrayContaining(['E-mail inválido', 'Valor não é número', 'Previsão de fechamento não é data', 'Segmento só aceita uma das opções']));
    expect(ruim.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Vendedor "Zé"'), expect.stringContaining('Etapa "Etapa Desconhecida"')]));
  });

  it('sem etapa padrão, etapa desconhecida vira erro e linha sem etapa não cria negócio', () => {
    const rows = validateRows(raw, { ...ctx, defaultStageId: null });
    expect(rows[2].errors).toContain('Etapa "Etapa Desconhecida" sem correspondência');
    expect(rows[3].row.stage_id).toBeNull();
  });

  it('acha repetição de e-mail dentro do arquivo, sem diferenciar maiúsculas', () => {
    const dupes = findFileDuplicates(validateRows(raw, ctx));
    expect(dupes.get(5)).toBe(2);
    expect(dupes.has(2)).toBe(false);
  });
});
