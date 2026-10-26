import { describe, expect, it } from 'vitest';
import { avisoDeEstoque, precoSugerido, type VendaComPrecos } from './preco-sugerido';

const venda = (salao_id: string, data: string, valor: number, created_at = `${data}T10:00:00Z`): VendaComPrecos =>
  ({ salao_id, data, created_at, itens: [{ produto_codigo: 'P1', valor_unitario: valor }] });

describe('preço sugerido na venda ao salão (R5)', () => {
  it('usa o último preço cobrado daquele salão, mesmo que outro salão tenha compra mais nova', () => {
    const vendas = [venda('A', '2026-10-01', 40), venda('A', '2026-10-10', 42), venda('B', '2026-10-20', 50)];
    expect(precoSugerido(vendas, 'A', 'P1')).toBe(42);
  });
  it('sem venda ao salão, usa o último cobrado de qualquer salão', () => {
    expect(precoSugerido([venda('A', '2026-10-01', 40), venda('B', '2026-10-20', 50)], 'C', 'P1')).toBe(50);
  });
  it('no mesmo dia, a venda registrada por último manda', () => {
    const vendas = [venda('A', '2026-10-01', 40, '2026-10-01T09:00:00Z'), venda('A', '2026-10-01', 44, '2026-10-01T15:00:00Z')];
    expect(precoSugerido(vendas, 'A', 'P1')).toBe(44);
  });
  it('venda sem preço não conta, e produto nunca vendido não sugere nada', () => {
    expect(precoSugerido([venda('A', '2026-10-01', 40), venda('A', '2026-10-05', 0)], 'A', 'P1')).toBe(40);
    expect(precoSugerido([venda('A', '2026-10-01', 40)], 'A', 'P9')).toBeNull();
  });
});

describe('aviso de venda acima do estoque (R5)', () => {
  it('avisa só quando vende mais do que tem', () => {
    expect(avisoDeEstoque(3, 5)).toBeNull();
    expect(avisoDeEstoque(5, 5)).toBeNull();
    expect(avisoDeEstoque(5, 3)).toContain('Você tem 3');
    expect(avisoDeEstoque(1, 0)).toContain('nenhum');
    expect(avisoDeEstoque(1, -2)).toContain('nenhum');
  });
});
