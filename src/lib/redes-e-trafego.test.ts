import { describe, expect, it } from 'vitest';
import { alcancePorFormato, comASemanaEmAndamento, faltaLancar, fraseDasRedes, melhoresPosts, type Publicacao, numerosDaConta, numerosDoTrafego, painelDasRedes, ultimasSemanas, type LinhaRedes, type LinhaTrafego } from './redes-e-trafego';

const vazia: Omit<LinhaRedes, 'semana' | 'conta'> = {
  posts: null, reels: null, stories: null, engajamento: null, novos_seguidores: null, quedas_seguidores: null, total_seguidores: null,
  visitas_perfil: null, alcance: null, visualizacoes: null, publicacoes: null, investimento: null, alcance_pago: null, visitas_pagas: null, campanhas_ativas: null, campanhas: null,
};
const r = (semana: string, conta: string, x: Partial<LinhaRedes>): LinhaRedes => ({ ...vazia, semana, conta, ...x });
const t = (semana: string, x: Partial<LinhaTrafego>): LinhaTrafego => ({
  semana, investimento: null, alcance: null, visitas_perfil: null, campanhas_ativas: null,
  leads_distribuidor: null, leads_consumidor: null, leads_salao: null, leads_sem_triagem: null, ...x,
});
const SEMANA = { de: '2026-10-26', ate: '2026-11-01' };
const ANTERIOR = { de: '2026-10-19', ate: '2026-10-25' };

describe('numerosDaConta', () => {
  const linhas = [
    r('2026-10-18', '@minasflor', { total_seguidores: 108804 }),
    r('2026-10-25', '@minasflor', { total_seguidores: 108875, posts: 4, engajamento: 5.3 }),
    r('2026-11-01', '@minasflor', { total_seguidores: 108930, posts: 3, engajamento: 4.99, investimento: 201.08, visitas_pagas: 700,
      campanhas: [{ nome: 'Profissionais', investimento: 196.78, alcance: 16793, ativa: true }] }),
  ];

  it('o saldo é o total do fim do período menos o do fim do anterior', () => {
    expect(numerosDaConta(linhas, '@minasflor', SEMANA).saldo).toBe(55);
    expect(numerosDaConta(linhas, '@minasflor', ANTERIOR).saldo).toBe(71);
  });

  it('sem a semana de antes não há saldo, e campo em branco não vira zero', () => {
    const n = numerosDaConta(linhas, '@minasflor', { de: '2026-10-12', ate: '2026-10-18' });
    expect(n.saldo).toBeNull();
    expect(n.visitas).toBeNull();
    expect(numerosDaConta(linhas, '@by.mf', SEMANA).seguidores).toBeNull();
  });

  it('o tráfego da conta: investimento, custo por visita e as campanhas', () => {
    const n = numerosDaConta(linhas, '@minasflor', SEMANA);
    expect(n.investimento).toBe(201.08);
    expect(n.custoPorVisita).toBeCloseTo(0.2873, 4);
    expect(n.campanhas.map((c) => c.nome)).toEqual(['Profissionais']);
  });

  it('a mesma campanha em duas semanas vira uma linha somada', () => {
    const duas = [
      r('2026-10-25', '@mf.pro', { campanhas: [{ nome: 'A', investimento: 10, alcance: 100, ativa: true }] }),
      r('2026-11-01', '@mf.pro', { campanhas: [{ nome: 'A', investimento: 5, alcance: null, ativa: false }] }),
    ];
    expect(numerosDaConta(duas, '@mf.pro', { de: '2026-10-19', ate: '2026-11-01' }).campanhas)
      .toEqual([{ nome: 'A', investimento: 15, alcance: 100, ativa: false }]);
  });
});

describe('numerosDoTrafego', () => {
  it('o total lançado manda; sem ele, o investimento é a soma das contas', () => {
    const contas = [numerosDaConta([r('2026-11-01', '@mf.pro', { investimento: 137.06 })], '@mf.pro', SEMANA)];
    expect(numerosDoTrafego([t('2026-11-01', { investimento: 338.14 })], contas, SEMANA).investimento).toBe(338.14);
    expect(numerosDoTrafego([], contas, SEMANA).investimento).toBe(137.06);
  });

  it('leads classificados não contam os sem triagem', () => {
    const n = numerosDoTrafego([t('2026-11-01', { leads_salao: 11, leads_distribuidor: 3, leads_consumidor: 1, leads_sem_triagem: 7 })], [], SEMANA);
    expect(n.leadsClassificados).toBe(15);
  });
});

describe('ultimasSemanas', () => {
  it('termina no domingo da semana do fim do período', () => {
    expect(ultimasSemanas('2026-11-01', 3)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
    expect(ultimasSemanas('2026-11-03', 2)).toEqual(['2026-11-01', '2026-11-08']);
  });
});

// A semana de 26/10 a 01/11 da @minasflor, como o Meta Business Suite mostra (alcance de cada post).
const pub = (id: string, tipo: Publicacao['tipo'], alcance: number | null, interacoes: number | null = null): Publicacao =>
  ({ id, tipo, data: '2026-10-30T13:00:00+0000', link: null, legenda: id, alcance, visualizacoes: null, interacoes });
const SEMANA_IG = [
  pub('resultado', 'FEED', 415, 34), pub('ojon', 'REELS', 354, 5), pub('tonalizante', 'FEED', 261, 7),
  pub('keratin', 'FEED', null), pub('story1', 'STORY', 120), pub('story2', 'STORY', 130), pub('empate', 'FEED', 261, 20),
];

describe('melhores posts e formatos', () => {
  it('os 3 que mais alcançaram, sem story nem post sem número; empate vai para quem interagiu mais', () => {
    expect(melhoresPosts(SEMANA_IG).map((p) => p.id)).toEqual(['resultado', 'ojon', 'empate']);
  });
  it('alcance médio por formato conta só as publicações com número', () => {
    expect(alcancePorFormato(SEMANA_IG)).toEqual([
      { tipo: 'REELS', quantas: 1, media: 354 }, { tipo: 'FEED', quantas: 3, media: 312 }, { tipo: 'STORY', quantas: 2, media: 125 },
    ]);
  });
  it('a mesma publicação em duas semanas do período conta uma vez', () => {
    const linhas = [
      r('2026-10-25', '@minasflor', { publicacoes: [pub('a', 'FEED', 100)] }),
      r('2026-11-01', '@minasflor', { publicacoes: [pub('a', 'FEED', 100), pub('b', 'REELS', 50)], alcance: 19200, visualizacoes: 43900 }),
    ];
    const n = numerosDaConta(linhas, '@minasflor', { de: '2026-10-19', ate: '2026-11-01' });
    expect(n.destaques.map((p) => p.id)).toEqual(['a', 'b']);
    expect(n.formatos.find((f) => f.tipo === 'FEED')).toEqual({ tipo: 'FEED', quantas: 1, media: 100 });
    expect([n.alcance, n.visualizacoes]).toEqual([19200, 43900]);
  });
});

describe('comASemanaEmAndamento', () => {
  it('"Esta semana" de quarta inclui o domingo que ainda vai chegar, e o painel mostra a semana', () => {
    const p = comASemanaEmAndamento({ de: '2026-11-02', ate: '2026-11-04' }, '2026-11-04');
    expect(p).toEqual({ de: '2026-11-02', ate: '2026-11-08' });
    const painel = painelDasRedes([r('2026-11-08', '@mf.pro', { novos_seguidores: 3 })], [], p, { de: '2026-10-30', ate: '2026-11-01' });
    expect(painel.temDados).toBe(true);
  });
  it('período que não contém hoje, ou que já vai até o domingo, fica como está', () => {
    expect(comASemanaEmAndamento({ de: '2026-10-01', ate: '2026-10-31' }, '2026-11-04')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(comASemanaEmAndamento({ de: '2026-11-01', ate: '2026-11-30' }, '2026-11-04')).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });
});

describe('painel e frase', () => {
  const redes = [
    r('2026-10-25', '@minasflor', { total_seguidores: 108875 }), r('2026-11-01', '@minasflor', { total_seguidores: 108930 }),
    r('2026-10-25', '@by.mf', { total_seguidores: 4044 }), r('2026-11-01', '@by.mf', { total_seguidores: 4034 }),
  ];
  const trafego = [t('2026-11-01', { investimento: 338.14, visitas_perfil: 1185, leads_salao: 11, leads_distribuidor: 3, leads_consumidor: 1 })];

  it('soma as contas e escreve a frase', () => {
    const p = painelDasRedes(redes, trafego, SEMANA, ANTERIOR);
    expect(p.total.saldo).toBe(45);
    expect(fraseDasRedes(p)).toBe(
      'Nas redes, as contas ganharam 45 seguidores (@minasflor +55, @by.mf −10). '
      + 'O tráfego pago investiu R$ 338,14 e trouxe 1.185 visitas ao perfil a R$ 0,29 cada. '
      + 'Chegaram 15 leads classificados, 11 de salão.',
    );
  });

  it('período sem nada lançado não tem frase', () => {
    expect(fraseDasRedes(painelDasRedes(redes, trafego, { de: '2026-11-02', ate: '2026-11-08' }, SEMANA))).toBe('');
  });
});

describe('faltaLancar', () => {
  it('aponta a conta sem linha e o número que falta', () => {
    const redes = [
      r('2026-11-01', '@minasflor', { posts: 3, reels: 2, stories: 4, total_seguidores: 1, visitas_perfil: 1 }),
      r('2026-11-01', '@by.mf', { reels: 1, stories: 0, total_seguidores: 1, visitas_perfil: 1 }),
    ];
    expect(faltaLancar(redes, [], '2026-11-01')).toEqual([
      { rotulo: 'Tráfego: nada lançado', ok: false },
      { rotulo: '@minasflor', ok: true },
      { rotulo: '@mf.pro: nada lançado', ok: false },
      { rotulo: '@by.mf: falta feed', ok: false },
    ]);
  });
});
