import { describe, expect, it } from 'vitest';
import { foraDeVenda, leadsDoRecorte, leadsSemSegmento, type LeadDoPeriodo } from './crm-atendimento';

const lead = (x: Partial<LeadDoPeriodo>): LeadDoPeriodo => ({
  lead_id: 1, nome: 'A', segmento: 'salao', funil: null, uf: 'MG', link: null, atendente: null, situacao: 'no_prazo',
  minutos: 5, venda: null, valor: null, ...x,
});

describe('Sem segmento (dono, 2026-11-11)', () => {
  it('é quem conversou e continua na Entrada, aberto e sem venda', () => {
    const leads = [
      lead({ lead_id: 1, segmento: 'sem_triagem', etapa: 'Contato inicial' }),
      lead({ lead_id: 2, segmento: 'sem_triagem', venda: 'ganha' }),
      lead({ lead_id: 3, segmento: 'sem_triagem', fechado: true }),
      lead({ lead_id: 4, segmento: 'salao' }),
    ];
    expect(leadsSemSegmento(leads).map((l) => l.lead_id)).toEqual([1]);
  });

  it('o funil que não é de venda é "Fora de venda"', () => {
    expect(foraDeVenda({ segmento: null })).toBe(true);
    expect(foraDeVenda({ segmento: 'consumidor' })).toBe(false);
  });
});

describe('o funil filtra a lista de leads', () => {
  const leads = [lead({ lead_id: 1, situacao: 'so_lyra' }), lead({ lead_id: 2, situacao: 'no_prazo' }), lead({ lead_id: 3, situacao: 'sem_resposta' })];
  it.each([['so_lyra', [1]], ['no_prazo', [2]], ['sem_resposta', [3]], ['todos', [1, 2, 3]]] as const)('%s', (filtro, ids) => {
    expect(leadsDoRecorte(leads, null, null, filtro).map((l) => l.lead_id)).toEqual(ids);
  });
});
