import { describe, expect, it } from 'vitest';
import { publicoDoMes, resumoDoPublico, type LinhaPublico } from './publico-do-instagram';

// Proporções da @minasflor no Meta Business Suite em 2026-11-04 (94,7% mulheres; Brasil 69,7%, EUA 13,3%).
const MINASFLOR: LinhaPublico = {
  conta: '@minasflor', mes: '2026-11-01', coletado_em: '2026-11-04T09:00:00Z',
  genero: { F: 947, M: 53 },
  idade: { '18-24': 60, '25-34': 368, '35-44': 365, '45-54': 157 },
  paises: { BR: 697, US: 133, RU: 40, IR: 11 },
  cidades: { 'São Paulo, São Paulo (state)': 44, 'Belo Horizonte, Minas Gerais': 35, 'Rio de Janeiro, Rio de Janeiro (state)': 26, 'Moscow, Moscow': 20 },
  online: { 2: { 19: 900, 20: 700, 9: 300 }, 3: { 19: 850 } },
};

describe('resumoDoPublico', () => {
  const r = resumoDoPublico(MINASFLOR);
  it('porcentagens sobre o total pelo gênero', () => {
    expect(r.mulheres).toBe(94.7);
    expect(r.brasil).toBe(69.7);
    expect(r.faixas).toEqual([{ nome: '25-34', pct: 36.8 }, { nome: '35-44', pct: 36.5 }]);
  });
  it('fora do Brasil e cidades pelo nome curto', () => {
    expect(r.fora.map((f) => f.nome)).toEqual(['US', 'RU', 'IR']);
    expect(r.cidades).toEqual([{ nome: 'São Paulo', pct: 4.4 }, { nome: 'Belo Horizonte', pct: 3.5 }, { nome: 'Rio de Janeiro', pct: 2.6 }]);
  });
  it('os 3 horários mais cheios e a grade de 3 em 3 horas', () => {
    expect(r.horarios).toEqual([{ dia: 2, hora: 19, seguidores: 900 }, { dia: 3, hora: 19, seguidores: 850 }, { dia: 2, hora: 20, seguidores: 700 }]);
    expect(r.grade?.[3][6]).toBe(1); // quarta, 18h–21h: 850 é o bloco mais cheio
    expect(r.grade?.[2][6]).toBe(0.94); // terça, 18h–21h: a média (900 + 700) / 2 = 800, sobre 850
    expect(r.grade?.[2][3]).toBe(0.35); // terça, 9h–12h: 300 / 850
    expect(r.grade?.[0][0]).toBe(0);
  });
  it('sem online, sem grade', () => {
    expect(resumoDoPublico({ ...MINASFLOR, online: null }).grade).toBeNull();
  });
});

describe('publicoDoMes', () => {
  it('a primeira linha de cada conta (a mais nova), só das contas que têm', () => {
    const outubro = { ...MINASFLOR, mes: '2026-10-01', genero: { F: 1 } };
    expect(publicoDoMes([MINASFLOR, outubro], ['@minasflor', '@mf.pro']).map((x) => x.mulheres)).toEqual([94.7]);
  });
});
