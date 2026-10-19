import { describe, it, expect } from 'vitest';
import { resumoPorFilial, type CompraDoRelatorio } from './compras-do-relatorio';

const compra = (c: Partial<CompraDoRelatorio>): CompraDoRelatorio => ({
  id: 'x', ticket_id: 't', product_name: 'p', department: null, estimated_amount: 0, executed_at: null, pagamento_em: null,
  data: '2026-10-19', aguardandoNota: false, forma_pagamento: 'pix', parcelas: null, filial: null, caixinha: false,
  purchase_file_path: null, cotacao: null, contas: [], ...c,
});

describe('resumoPorFilial (dono, 2026-10-19)', () => {
  it('soma por filial o total, o em aberto e o que aguarda a nota', () => {
    const r = resumoPorFilial([
      compra({ filial: 'BY.MF', estimated_amount: 59.98, aguardandoNota: true }),
      compra({ filial: 'BY.MF', estimated_amount: 76.26, aguardandoNota: true,
        contas: [{ status: 'paid', amount: 136.24, parcela: 1, due_date: '2026-10-19' }] }),
      compra({ filial: 'INBRAS', estimated_amount: 100, contas: [{ status: 'pending', amount: 100, parcela: 1, due_date: '2026-10-30' }] }),
      compra({ estimated_amount: 10 }),
    ]);
    expect(r.map((f) => f.filial)).toEqual(['BY.MF', 'INBRAS', 'Sem filial']);
    expect(r[0]).toMatchObject({ compras: 2, emAberto: 0 });
    expect(r[0].total).toBeCloseTo(136.24, 2);
    expect(r[0].aguardandoNota).toBeCloseTo(136.24, 2);
    expect(r[1]).toMatchObject({ compras: 1, total: 100, emAberto: 100, aguardandoNota: 0 });
  });
});
