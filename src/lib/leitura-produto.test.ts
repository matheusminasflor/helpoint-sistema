import { describe, it, expect } from 'vitest';
import { leituraDoProduto } from './leitura-produto';

describe('leituraDoProduto', () => {
  it('situação nula (um único mês selecionado): diz que não há tendência, nunca inventa Estável', () => {
    const texto = leituraDoProduto({ situacao: null, variacao: null, concentrado: false, clientes: 3 });
    expect(texto).toContain('não há tendência para calcular');
    expect(texto).not.toContain('Estável');
  });

  it('Novo: sem venda na 1ª metade, com venda na 2ª', () => {
    const texto = leituraDoProduto({ situacao: 'Novo', variacao: null, concentrado: false, clientes: 2 });
    expect(texto).toContain('Produto novo');
    expect(texto).toContain('2 clientes no período');
  });

  it('Descontinuado', () => {
    const texto = leituraDoProduto({ situacao: 'Descontinuado', variacao: null, concentrado: false, clientes: 1 });
    expect(texto).toContain('Produto descontinuado');
    expect(texto).toContain('1 cliente no período'); // singular
  });

  it('Esporádico', () => {
    const texto = leituraDoProduto({ situacao: 'Esporádico', variacao: 3, concentrado: false, clientes: 4 });
    expect(texto).toContain('esporádica');
  });

  it('Crescendo mostra a variação com sinal de +', () => {
    const texto = leituraDoProduto({ situacao: 'Crescendo', variacao: 0.5, concentrado: false, clientes: 5 });
    expect(texto).toContain('Crescendo');
    expect(texto).toContain('+50%');
  });

  it('Caindo mostra a variação com sinal de -', () => {
    const texto = leituraDoProduto({ situacao: 'Caindo', variacao: -0.5, concentrado: false, clientes: 5 });
    expect(texto).toContain('Caindo');
    expect(texto).toContain('-50%');
  });

  it('Estável mostra a variação pequena', () => {
    const texto = leituraDoProduto({ situacao: 'Estável', variacao: 0.05, concentrado: false, clientes: 5 });
    expect(texto).toContain('Estável');
    expect(texto).toContain('+5%');
  });

  it('concentração (ressalva §14) fica embutida na frase quando concentrado = true', () => {
    const texto = leituraDoProduto({ situacao: 'Crescendo', variacao: 0.5, concentrado: true, clientes: 5 });
    expect(texto).toContain('sazonalidade ou pedido pontual');
  });

  it('sem concentração, a frase não menciona sazonalidade', () => {
    const texto = leituraDoProduto({ situacao: 'Crescendo', variacao: 0.5, concentrado: false, clientes: 5 });
    expect(texto).not.toContain('sazonalidade');
  });

  // Correção D3 (auditoria da L6e): com um único mês selecionado, `concentrado`
  // vem NULO do banco (nunca `true` por definição) — a leitura trata nulo
  // como "sem concentração", nunca inventa a frase de sazonalidade.
  it('concentrado nulo (um único mês no período) não menciona sazonalidade', () => {
    const texto = leituraDoProduto({ situacao: null, variacao: null, concentrado: null, clientes: 3 });
    expect(texto).not.toContain('sazonalidade');
  });
});
