import { describe, expect, it } from 'vitest';
import { normalizarHistoricoMetas, normalizarMetasDoAno, resolverCarteiraImportada, semDado } from './metas-import';
import { HISTORICO_METAS_FIXTURE, METAS_2026_FIXTURE } from './__fixtures__/historico-metas';

describe('semDado', () => {
  it('0.0 vira ausência (null)', () => {
    expect(semDado(0)).toBeNull();
    expect(semDado(0.0)).toBeNull();
  });
  it('null continua null', () => {
    expect(semDado(null)).toBeNull();
    expect(semDado(undefined)).toBeNull();
  });
  it('valor real passa direto', () => {
    expect(semDado(177669.19)).toBe(177669.19);
  });
});

describe('normalizarHistoricoMetas — JSON real do dono', () => {
  const previa = normalizarHistoricoMetas(HISTORICO_METAS_FIXTURE);

  it('lê os cinco anos, na ordem', () => {
    expect(previa.anos.map((a) => a.ano)).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it('ano com meta:null (2023) não falha — meta do ano fica null', () => {
    const ano2023 = previa.anos.find((a) => a.ano === 2023)!;
    expect(ano2023.meta).toBeNull();
  });

  it('2024 também tem meta:null', () => {
    const ano2024 = previa.anos.find((a) => a.ano === 2024)!;
    expect(ano2024.meta).toBeNull();
  });

  it('2025 tem meta em todos os 12 meses, sem ausência', () => {
    const ano2025 = previa.anos.find((a) => a.ano === 2025)!;
    expect(ano2025.meta).not.toBeNull();
    expect(ano2025.meta).toHaveLength(12);
    expect(ano2025.meta!.every((v) => v !== null)).toBe(true);
    expect(ano2025.meta![0]).toBe(550000.0);
  });

  it('BERCARIO só existe a partir de 2026', () => {
    for (const ano of previa.anos) {
      const nomes = ano.carteiras.map((c) => c.carteira);
      if (ano.ano < 2026) {
        expect(nomes).not.toContain('BERCARIO');
      } else {
        expect(nomes).toContain('BERCARIO');
      }
    }
  });

  it('BERCARIO de 2026 é nula nos 12 meses — janeiro (0.0) e fevereiro-dezembro (null) na mesma regra', () => {
    const ano2026 = previa.anos.find((a) => a.ano === 2026)!;
    const bercario = ano2026.carteiras.find((c) => c.carteira === 'BERCARIO')!;
    expect(bercario.realizado).toHaveLength(12);
    expect(bercario.realizado.every((v) => v === null)).toBe(true);
  });

  it('zeros de ago-dez/2026 (índices 7-11) virem ausência em VIP e no total', () => {
    const ano2026 = previa.anos.find((a) => a.ano === 2026)!;
    const vip = ano2026.carteiras.find((c) => c.carteira === 'VIP')!;
    for (let i = 7; i <= 11; i++) {
      expect(vip.realizado[i]).toBeNull();
      expect(ano2026.totalRealizado[i]).toBeNull();
    }
    // Os sete primeiros meses de VIP em 2026 têm dado real, não nulo.
    for (let i = 0; i <= 6; i++) {
      expect(vip.realizado[i]).not.toBeNull();
    }
  });

  it('metaTotal de 2026 tem os seis primeiros meses nulos (jan-jun) e o resto preenchido', () => {
    const ano2026 = previa.anos.find((a) => a.ano === 2026)!;
    expect(ano2026.metaTotal).not.toBeNull();
    for (let i = 0; i <= 5; i++) expect(ano2026.metaTotal![i]).toBeNull();
    expect(ano2026.metaTotal![6]).toBe(530000.0);
  });

  it('índice de mês: cart["VIP"][0] (janeiro) é o primeiro valor; [11] (dezembro) é o último', () => {
    const ano2022 = previa.anos.find((a) => a.ano === 2022)!;
    const vip = ano2022.carteiras.find((c) => c.carteira === 'VIP')!;
    expect(vip.realizado[0]).toBe(177669.19);
    expect(vip.realizado[11]).toBe(260445.12);
  });
});

describe('normalizarHistoricoMetas — validação', () => {
  it('rejeita JSON sem a chave "anos"', () => {
    expect(() => normalizarHistoricoMetas({ ano_base: 2026 })).toThrow(/anos/);
  });
  it('rejeita ano cuja carteira não tem 12 meses', () => {
    expect(() => normalizarHistoricoMetas({ anos: { '2022': { cart: { VIP: [1, 2, 3] }, total: Array(12).fill(1) } } }))
      .toThrow(/12 meses/);
  });
});

describe('normalizarMetasDoAno — JSON real do dono', () => {
  it('lê o ano e os 12 valores, sem ausência (nenhum é 0.0 ou null neste arquivo)', () => {
    const { ano, metas } = normalizarMetasDoAno(METAS_2026_FIXTURE);
    expect(ano).toBe(2026);
    expect(metas).toHaveLength(12);
    expect(metas.every((v) => v !== null)).toBe(true);
    expect(metas[0]).toBe(501000);
    expect(metas[11]).toBe(534455);
  });

  it('rejeita JSON sem "ano"/"metas"', () => {
    expect(() => normalizarMetasDoAno({ ano: 2026 })).toThrow(/ano.*metas/);
  });

  it('rejeita array com menos de 12 valores', () => {
    expect(() => normalizarMetasDoAno({ ano: 2026, metas: [1, 2, 3] })).toThrow(/12 valores/);
  });

  it('0.0 num METAS_<ano>.json também viraria ausência', () => {
    const { metas } = normalizarMetasDoAno({ ano: 2099, metas: [0, ...Array(11).fill(1)] });
    expect(metas[0]).toBeNull();
    expect(metas[1]).toBe(1);
  });
});

// Frente 6 (.scratch/plano-frente6-importacoes.md §4): a prévia tem que
// mostrar o nome RESOLVIDO, não a chave crua — "VIP" no arquivo é o mesmo
// caso real da Frente 7d (VIP → ESPECIAL).
describe('resolverCarteiraImportada', () => {
  const renomeacoes = [{ de: 'VIP', para: 'ESPECIAL' }];

  it('sem renomeação registrada: final é igual ao original', () => {
    expect(resolverCarteiraImportada('MG', renomeacoes)).toEqual({ original: 'MG', final: 'MG' });
  });

  it('com renomeação: final é o destino gravado pela RPC', () => {
    expect(resolverCarteiraImportada('VIP', renomeacoes)).toEqual({ original: 'VIP', final: 'ESPECIAL' });
  });

  it('casa ignorando caixa e acento — mesma normalização dos dois lados', () => {
    expect(resolverCarteiraImportada('vip', renomeacoes)).toEqual({ original: 'vip', final: 'ESPECIAL' });
  });

  it('lista de renomeações vazia: nunca falha, final é sempre o original', () => {
    expect(resolverCarteiraImportada('VIP', [])).toEqual({ original: 'VIP', final: 'VIP' });
  });
});
