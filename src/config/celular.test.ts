import { describe, expect, it } from 'vitest';
import { ehRelatorio, ficaNoCelular, soNoComputador } from './celular';

// A regra do celular (dono, 2026-10-28): dia a dia fica; relatório vira resumo; cadastro só no computador.
describe('o que fica no celular', () => {
  it('o dia a dia fica', () => {
    for (const r of ['/inicio', '/meus', '/nova-solicitacao', '/chat', '/jornal', '/agenda', '/ti/chamados',
      '/compras/aprovacoes', '/comercial/lancamentos', '/financeiro/caixinha', '/financeiro/reembolsos-e-adiantamentos', '/diretoria']) {
      expect(ficaNoCelular(r), r).toBe(true);
    }
  });

  it('relatório vira resumo', () => {
    for (const r of ['/ti/indicadores', '/comercial/indicadores', '/comercial/carteiras', '/comercial/vendas',
      '/compras/relatorios/ciclo-da-compra', '/financeiro/relatorio-de-compras', '/qualidade/dashboard', '/diretoria/relatorios/x']) {
      expect(ehRelatorio(r), r).toBe(true);
    }
  });

  it('cadastro e conferência ficam no computador', () => {
    for (const r of ['/configuracoes/sistema', '/configuracoes/importacoes', '/ti/configuracoes',
      '/financeiro/contas-a-pagar', '/financeiro/contas-a-receber?conta=1']) {
      expect(soNoComputador(r), r).toBe(true);
    }
  });
});
