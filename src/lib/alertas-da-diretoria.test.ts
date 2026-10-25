import { describe, expect, it } from 'vitest';
import { alertasDoResumo, clientesQuePararam } from './alertas-da-diretoria';
import type { ClienteATrabalhar, TendenciaProduto } from '@/types/comercial';

const c = (codigo: string, valor: number): ClienteATrabalhar => ({
  cliente_codigo: codigo, nome: codigo, tabela_preco: null, ultima_compra: '2026-07-10', valor_ultimos_3m: valor, em_condicao: false,
});
const p = (codigo: string, faturamento: number, variacao: number | null, situacao: TendenciaProduto['situacao'] = 'Caindo'): TendenciaProduto => ({
  produto_codigo: codigo, nome: codigo, faturamento, quantidade: 1, faixa: 'A', meses_com_venda: 6, clientes: 3,
  primeira_metade: null, segunda_metade: null, variacao, situacao, concentrado: false, serie_mensal: [],
});

describe('Pede atenção da Diretoria (2026-10-25)', () => {
  it('dois maiores clientes que pararam e o produto que mais caiu, pesado pelo faturamento', () => {
    const r = alertasDoResumo([c('a', 100), c('b', 900), c('c', 500)], [p('x', 1000, -0.1), p('y', 500, -0.5), p('z', 9000, 0.2, 'Crescendo')]);
    expect(r.map((a) => a.codigo)).toEqual(['b', 'c', 'y']);
  });
  it('sem produto caindo, o terceiro é cliente', () => {
    expect(alertasDoResumo([c('a', 1), c('b', 2), c('c', 3)], []).map((a) => a.codigo)).toEqual(['c', 'b', 'a']);
  });
  it('soma o que os clientes que pararam compravam', () => {
    expect(clientesQuePararam([c('a', 100), c('b', 50)])).toEqual({ quantos: 2, emRisco: 150 });
  });
});
