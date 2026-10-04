import { describe, expect, it } from 'vitest';
import {
  agruparPorCliente, agruparPorVendedora, mesDaCompetencia, SEM_LANCAMENTO, totaisLxF, type LinhaLxF,
} from './lancado-x-faturado';

// O cenário do pgTAP `lancado_x_faturado.test.sql`: Ana e Bia lançaram para CA (faturado 1.500),
// Bia para CB (faturado 200) e CZ faturou sem lançamento.
const linha = (v: string | null, c: string, ate: number, previa: number, fat: number): LinhaLxF => ({
  vendedor_id: v, vendedor_nome: v ? v.toUpperCase() : null, cliente_codigo: c, cliente_nome: `Cliente ${c}`,
  lancado_ate_corte: ate, lancado_previa: previa, faturado: fat,
});
const LINHAS = [
  linha('ana', 'CA', 900, 400, 1500),
  linha('bia', 'CA', 100, 0, 1500),
  linha('bia', 'CB', 250, 0, 200),
  linha(null, 'CZ', 0, 0, 300),
];

describe('informado × faturado', () => {
  it('o mês da competência vai do dia 1 ao último dia, fevereiro bissexto incluído', () => {
    expect(mesDaCompetencia('2028-02-01')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(mesDaCompetencia('2026-12-01')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });

  it('o total conta o faturado de cada cliente uma vez só, mesmo com duas vendedoras nele', () => {
    expect(totaisLxF(LINHAS)).toEqual({ informado: 1250, previa: 400, faturado: 2000, diferenca: -750 });
  });

  it('por cliente: o faturado é o do cliente, e a diferença soma o informado de todas', () => {
    const ca = agruparPorCliente(LINHAS).find((g) => g.chave === 'CA')!;
    expect([ca.informado, ca.faturado, ca.diferenca, ca.itens]).toEqual([1000, 1500, -500, 2]);
  });

  it('por vendedora: ordena pela maior diferença absoluta, e o cliente sem lançamento tem grupo próprio', () => {
    const grupos = agruparPorVendedora(LINHAS);
    expect(grupos.map((g) => [g.nome, g.diferenca])).toEqual([
      ['BIA', -1350], ['ANA', -600], [SEM_LANCAMENTO, -300],
    ]);
  });
});
