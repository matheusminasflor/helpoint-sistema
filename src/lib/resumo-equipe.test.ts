import { describe, expect, it } from 'vitest';
import { totalDaEquipe } from '@/lib/resumo-equipe';
import type { ResumoCarteira } from '@/hooks/useComercialLancamentos';

function linha(p: Partial<ResumoCarteira>): ResumoCarteira {
  return {
    vendedor_id: 'x', vendedor_nome: 'X', carteira: 'NORTE',
    total_carteira: 0, ativos: 0, inativos: 0, nunca_compraram: 0,
    relacionados: 0, compradores: 0, relacionados_sem_compra: 0, valor_vendido: 0,
    compradores_ativos: 0, vendas_ativos: 0, ticket_ativos: null,
    compradores_inativos: 0, vendas_inativos: 0, ticket_inativos: null, media_base_ativa: null,
    ...p,
  };
}

describe('TOTAL EQUIPE do resumo da carteira (manual §7)', () => {
  it('conta a carteira UMA vez, mesmo com duas pessoas nela', () => {
    const t = totalDaEquipe([
      linha({ vendedor_id: 'a', carteira: 'NORTE', total_carteira: 10, ativos: 8, relacionados: 3 }),
      linha({ vendedor_id: 'b', carteira: 'NORTE', total_carteira: 10, ativos: 8, relacionados: 2 }),
      linha({ vendedor_id: 'c', carteira: 'SUL', total_carteira: 5, ativos: 4, relacionados: 1 }),
    ]);
    // 10 + 5, e não 10 + 10 + 5.
    expect(t.total_carteira).toBe(15);
    expect(t.ativos).toBe(12);
    // O trabalho, esse sim, soma por pessoa.
    expect(t.relacionados).toBe(6);
  });

  it('recalcula o ticket com a fórmula do manual, em vez de somar tickets', () => {
    const t = totalDaEquipe([
      linha({ vendedor_id: 'a', carteira: 'NORTE', ativos: 10, compradores_ativos: 2, vendas_ativos: 20000, ticket_ativos: 10000 }),
      linha({ vendedor_id: 'b', carteira: 'SUL', ativos: 10, compradores_ativos: 1, vendas_ativos: 4000, ticket_ativos: 4000 }),
    ]);
    // (20.000 + 4.000) ÷ 3 compradores = 8.000 — não 10.000 + 4.000 = 14.000.
    expect(t.ticket_ativos).toBe(8000);
    // Média da base ativa: 24.000 ÷ 20 ativos = 1.200. Diferente do ticket, de propósito (§7.1).
    expect(t.media_base_ativa).toBe(1200);
  });

  it('sem comprador não inventa ticket: devolve nulo, não zero', () => {
    const t = totalDaEquipe([linha({ carteira: 'NORTE', ativos: 5 })]);
    expect(t.ticket_ativos).toBeNull();
    expect(t.ticket_inativos).toBeNull();
    expect(t.media_base_ativa).toBe(0);
  });

  it('quem está fora de carteira soma trabalho e não soma carteira', () => {
    const t = totalDaEquipe([
      linha({ vendedor_id: 'a', carteira: 'NORTE', total_carteira: 7, valor_vendido: 100 }),
      linha({ vendedor_id: 'g', carteira: null, total_carteira: 0, valor_vendido: 50 }),
    ]);
    expect(t.total_carteira).toBe(7);
    expect(t.valor_vendido).toBe(150);
  });
});
