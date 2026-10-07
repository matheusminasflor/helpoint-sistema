import { describe, expect, it } from 'vitest';
import { clientesDoCashback, geraramCashback } from './cashback-por-cliente';
import type { CashbackMensal, CashbackResumo, SituacaoCashback } from '@/types/comercial';

const r = (codigo: string, nome: string, cashback: number | null): CashbackResumo => ({
  cliente_codigo: codigo, nome, tabela_base: 'ATACADISTA', sem_programa: false, comprado: 1000, cashback,
  meses_com_direito: cashback ? 1 : 0, ultima_competencia: null, ultima_faixa: null, meta_para_ativar: null,
  falta_proxima_faixa: null, menor_distancia: null, sem_tabela: false, cashback_liberado: 0,
  cashback_aguardando: 0, ultima_compra_seguinte: null, ultima_situacao: null,
});
const m = (codigo: string, competencia: string, situacao: SituacaoCashback | null): CashbackMensal => ({
  cliente_codigo: codigo, nome: codigo, competencia, tabela_base: 'ATACADISTA', comprado: 1000, percentual: 2,
  cashback: situacao ? 20 : 0, sem_programa: false, sem_tabela: false, compra_para_ativar: 500,
  compra_mes_seguinte: 0, situacao, cashback_liberado: situacao === 'liberado' ? 20 : 0,
});

const resumo = [r('A', 'Ana', 50), r('B', 'Bia', 0), r('C', 'Caio', 120)];
const mensal = [
  m('A', '2026-08-01', 'liberado'), m('A', '2026-07-01', 'nao_liberado'),
  m('B', '2026-08-01', null),
  m('C', '2026-09-01', 'aguardando'),
];

describe('clientesDoCashback', () => {
  it('um cliente por linha, com os meses dele em ordem, do maior cashback para o menor', () => {
    const lista = clientesDoCashback(resumo, mensal, { soComDireito: false, situacao: 'todas' });
    expect(lista.map((c) => c.resumo.cliente_codigo)).toEqual(['C', 'A', 'B']);
    expect(lista[1].meses.map((x) => x.competencia)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('"Com direito a cashback" tira quem não gerou nada', () => {
    const lista = clientesDoCashback(resumo, mensal, { soComDireito: true, situacao: 'todas' });
    expect(lista.map((c) => c.resumo.cliente_codigo)).toEqual(['C', 'A']);
  });

  it('o filtro de situação pega quem tem algum mês naquela situação', () => {
    expect(clientesDoCashback(resumo, mensal, { soComDireito: false, situacao: 'liberado' }).map((c) => c.resumo.cliente_codigo)).toEqual(['A']);
    expect(clientesDoCashback(resumo, mensal, { soComDireito: false, situacao: 'aguardando' }).map((c) => c.resumo.cliente_codigo)).toEqual(['C']);
  });
});

describe('geraramCashback', () => {
  it('o simplificado mostra só quem gerou, do maior para o menor', () => {
    expect(geraramCashback(resumo).map((c) => c.cliente_codigo)).toEqual(['C', 'A']);
  });
});
