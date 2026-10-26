import { describe, expect, it } from 'vitest';
import { indicadoresDoMarketing, saldosDoEstoque } from './indicadores-do-marketing';

const base = { de: '2026-10-01', ate: '2026-10-31', hoje: '2026-10-26' };

describe('indicadores do Marketing (R6)', () => {
  it('saldo é entrada menos saída, e acusa só o produto ativo com mínimo abaixo dele', () => {
    const movimentos = [
      { produto_id: 'a', tipo: 'entrada' as const, quantidade: 10 }, { produto_id: 'a', tipo: 'saida' as const, quantidade: 8 },
      { produto_id: 'b', tipo: 'entrada' as const, quantidade: 1 },
    ];
    expect(saldosDoEstoque(movimentos).get('a')).toBe(2);
    const r = indicadoresDoMarketing({ ...base, movimentos, pedidos: [], retiradas: [], produtos: [
      { id: 'a', nome: 'Folder', unidade: 'un', estoque_minimo: 5, ativo: true },
      { id: 'b', nome: 'Banner', unidade: 'un', estoque_minimo: 0, ativo: true },
      { id: 'c', nome: 'Velho', unidade: 'un', estoque_minimo: 5, ativo: false },
    ] });
    expect(r.abaixoDoMinimo).toEqual([{ nome: 'Folder', unidade: 'un', saldo: 2, minimo: 5 }]);
  });

  it('pedidos de arte: os do período, os entregues, os abertos e os abertos que passaram do "preciso até"', () => {
    const r = indicadoresDoMarketing({ ...base, produtos: [], movimentos: [], retiradas: [], pedidos: [
      { etapa: 'entregue', created_at: '2026-10-03T10:00:00Z', atualizada_em: '2026-10-05', preciso_ate: '2026-10-10' },
      { etapa: 'aceita', created_at: '2026-10-20T10:00:00Z', atualizada_em: '2026-10-21', preciso_ate: '2026-10-25' },
      { etapa: 'pedido', created_at: '2026-09-20T10:00:00Z', atualizada_em: '2026-09-20', preciso_ate: '2026-11-30' },
      { etapa: 'cancelada', created_at: '2026-10-22T10:00:00Z', atualizada_em: '2026-10-22', preciso_ate: '2026-10-01' },
    ] });
    expect([r.pedidosNoPeriodo, r.entreguesNoPeriodo, r.abertos, r.atrasados]).toEqual([3, 1, 2, 1]);
  });

  it('benefício: retiradas do período, devolvidas com atraso e as que passaram do prazo sem voltar', () => {
    const r = indicadoresDoMarketing({ ...base, produtos: [], movimentos: [], pedidos: [], retiradas: [
      { status: 'devolvida', retirado_em: '2026-10-02T12:00:00Z', prazo: '2026-10-05', devolvido_em: '2026-10-07', atraso: true },
      { status: 'retirada', retirado_em: '2026-10-16T12:00:00Z', prazo: '2026-10-19', devolvido_em: null, atraso: false },
      { status: 'retirada', retirado_em: '2026-10-23T12:00:00Z', prazo: '2026-10-28', devolvido_em: null, atraso: false },
    ] });
    expect([r.retiradasNoPeriodo, r.devolvidasComAtraso, r.foraDoPrazoAgora]).toEqual([3, 1, 1]);
  });
});
