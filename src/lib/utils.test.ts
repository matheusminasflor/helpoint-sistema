import { describe, it, expect } from 'vitest';
import { sanitizeContent } from './utils';

describe('sanitizeContent — a mensagem do chamado mantém as linhas (#157, 2026-10-20)', () => {
  it('não junta a lista digitada num parágrafo só', () => {
    const texto = 'Solicito a troca.\n\n*Produtos para troca:*\n\n-Shampoo 500ml (1 unidade) \n-Dust it 20G (1 unidade)';
    expect(sanitizeContent(texto)).toBe('Solicito a troca.\n\nProdutos para troca:\n\n-Shampoo 500ml (1 unidade)\n-Dust it 20G (1 unidade)');
  });

  it('ainda junta espaços repetidos e linhas em branco demais', () => {
    expect(sanitizeContent('a   b\n\n\n\nc  ')).toBe('a b\n\nc');
  });
});
