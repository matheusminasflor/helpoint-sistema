import { describe, expect, it } from 'vitest';
import { artistasNoRecorte, diasDaSemana, periodosDoRecorte, recorteDoPeriodo, type EntregaComDia } from './semanas-dos-artistas';

describe('as semanas dos artistas, como na planilha', () => {
  it('S1 a S4, e a S4 fecha no último dia do mês (31, 30 ou 28)', () => {
    expect(diasDaSemana('2026-10-01', 1)).toEqual({ de: '2026-10-01', ate: '2026-10-07' });
    expect(diasDaSemana('2026-10-01', 4)).toEqual({ de: '2026-10-22', ate: '2026-10-31' });
    expect(diasDaSemana('2026-11-01', 4)).toEqual({ de: '2026-11-22', ate: '2026-11-30' });
    expect(diasDaSemana('2027-02-01', 4)).toEqual({ de: '2027-02-22', ate: '2027-02-28' });
    expect(diasDaSemana('2026-10-01', 0)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
  });

  it('o período da tela vira o recorte: a semana de 26/10 a 01/11 é a S4 de outubro; outubro inteiro é o mês', () => {
    expect(recorteDoPeriodo({ de: '2026-10-26', ate: '2026-11-01' })).toEqual({ mes: '2026-10-01', semana: 4 });
    expect(recorteDoPeriodo({ de: '2026-10-01', ate: '2026-10-31' })).toEqual({ mes: '2026-10-01', semana: 0 });
    expect(recorteDoPeriodo({ de: '2026-11-02', ate: '2026-11-08' })).toEqual({ mes: '2026-11-01', semana: 1 });
    expect(recorteDoPeriodo({ de: '2026-11-02', ate: '2026-11-03' })).toEqual({ mes: '2026-11-01', semana: 1 });
  });

  it('o anterior: S2 a S4 = acumulado até a semana anterior; S1 e o mês inteiro = o mês anterior inteiro', () => {
    expect(periodosDoRecorte({ mes: '2026-10-01', semana: 3 })).toMatchObject({
      acumulado: { de: '2026-10-01', ate: '2026-10-21' }, anterior: { de: '2026-10-01', ate: '2026-10-14' }, comparaCom: 'a semana anterior' });
    expect(periodosDoRecorte({ mes: '2026-11-01', semana: 1 }).anterior).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodosDoRecorte({ mes: '2026-10-01', semana: 0 })).toMatchObject({ anterior: { de: '2026-09-01', ate: '2026-09-30' }, comparaCom: 'o mês anterior' });
  });

  it('na semana conta só a semana; a bonificação é do acumulado do mês até ela; o comparativo é contra o anterior', () => {
    const a = { id: 'a', nome: 'Artista A', ativo: true, teto_mensal: 4000, meta_stories: 10, meta_reels: 4, meta_posts: 2 };
    const e = (data: string, tipo: EntregaComDia['tipo'], quantidade: number): EntregaComDia =>
      ({ artista_id: 'a', data, tipo, quantidade, aprovado: true, na_campanha: true });
    const entregas = [e('2026-10-05', 'stories', 5), e('2026-10-23', 'stories', 5), e('2026-10-24', 'reels', 3), e('2026-09-10', 'stories', 10)];
    const reunioes = new Set(['a|2026-10-01', 'a|2026-09-01']);
    const s4 = artistasNoRecorte([a], entregas, reunioes, { mes: '2026-10-01', semana: 4 });
    expect(s4.linhas[0].semana).toMatchObject({ stories: 5, reels: 3, pecas: 8 });
    expect(s4.linhas[0].mes).toMatchObject({ stories: 10, reels: 3, pecas: 13 });
    // 1/3 cheio (10 stories) + 1/3 × 3/6 + reunião = 4000 × (1/3 + 1/6 + 1/3) = 3.333,33.
    expect(s4.linhas[0].b.valor).toBe(3333.33);
    // Até a S3: 5 stories + reunião = 4000 × (1/6 + 1/3) = 2.000,00.
    expect(s4.linhas[0]).toMatchObject({ anterior: 2000, comparativo: 'acima' });
    const mes = artistasNoRecorte([a], entregas, reunioes, { mes: '2026-10-01', semana: 0 });
    // Setembro: 10 stories + reunião = 2.666,67.
    expect(mes.total).toMatchObject({ valor: 3333.33, anterior: 2666.67 });
  });

  it('sem nenhuma entrega no anterior, não há comparação (como a planilha)', () => {
    const a = { id: 'a', nome: 'A', ativo: true, teto_mensal: 3000, meta_stories: 10, meta_reels: 4, meta_posts: 2 };
    const r = artistasNoRecorte([a], [{ artista_id: 'a', data: '2026-07-03', tipo: 'post', quantidade: 1, aprovado: true, na_campanha: true }], new Set(), { mes: '2026-07-01', semana: 1 });
    expect(r.linhas[0]).toMatchObject({ anterior: null, comparativo: null });
    expect(r.total.anterior).toBeNull();
  });
});
