import { describe, expect, it } from 'vitest';
import { etapasDeTriagem, segmentoDoCampo, segmentoDoLead } from '../../supabase/functions/_shared/kommo-segmento';

const ENTRADA = 13975223, CONSUMIDOR = 12904179, SALAO = 12927111, DISTRIBUIDOR = 12927087, EDUCACIONAL = 12927031;
const COM_A_LYRA = 900001, EM_ATENDIMENTO = 900002, GANHA = 142;
const triagem = new Set([COM_A_LYRA]);
const segmento = (valor: string) => [{ field_name: 'Segmento', values: [{ value: valor }] }];

describe('segmentoDoLead', () => {
  it('reconhece o funil pelo número, mesmo com outro nome ou com a Entrada arquivada', () => {
    expect(segmentoDoLead({ pipeline_id: SALAO, status_id: EM_ATENDIMENTO }, triagem)).toBe('salao');
    expect(segmentoDoLead({ pipeline_id: ENTRADA, status_id: GANHA }, triagem)).toBe('sem_triagem');
  });

  it('funil que não é de venda não conta', () => {
    expect(segmentoDoLead({ pipeline_id: EDUCACIONAL, status_id: GANHA }, triagem)).toBeNull();
    expect(segmentoDoLead({ pipeline_id: 555, status_id: COM_A_LYRA, custom_fields_values: segmento('Salão') }, triagem)).toBeNull();
  });

  it('quem nasceu no Salão e ainda está com a Lyra sem Segmento é sem triagem, não Salão', () => {
    expect(segmentoDoLead({ pipeline_id: SALAO, status_id: COM_A_LYRA }, triagem)).toBe('sem_triagem');
  });

  it('o campo Segmento da triagem vale mais que o funil', () => {
    expect(segmentoDoLead({ pipeline_id: SALAO, status_id: COM_A_LYRA, custom_fields_values: segmento('Consumidor final') }, triagem)).toBe('consumidor');
    expect(segmentoDoLead({ pipeline_id: CONSUMIDOR, status_id: GANHA, custom_fields_values: segmento('Distribuidor') }, triagem)).toBe('distribuidor');
  });

  it('Segmento vazio ou estranho cai no funil', () => {
    expect(segmentoDoLead({ pipeline_id: DISTRIBUIDOR, status_id: GANHA, custom_fields_values: segmento('?') }, triagem)).toBe('distribuidor');
    expect(segmentoDoLead({ pipeline_id: DISTRIBUIDOR, status_id: GANHA, custom_fields_values: null }, triagem)).toBe('distribuidor');
  });
});

describe('segmentoDoCampo', () => {
  it('lê os nomes das opções da triagem, sem acento e sem caixa', () => {
    expect(segmentoDoCampo('SALÃO DE BELEZA')).toBe('salao');
    expect(segmentoDoCampo('Tenho salão / sou profissional')).toBe('salao');
    expect(segmentoDoCampo('Revendo / distribuo')).toBe('distribuidor');
    expect(segmentoDoCampo('Uso em casa')).toBe('consumidor');
    expect(segmentoDoCampo('Já sou cliente')).toBeNull();
    expect(segmentoDoCampo(3)).toBeNull();
  });
});

describe('etapasDeTriagem', () => {
  it('pega só a etapa "Com a Lyra" dos funis de venda', () => {
    const funis = [
      { id: SALAO, _embedded: { statuses: [{ id: COM_A_LYRA, name: 'Com a Lyra' }, { id: EM_ATENDIMENTO, name: 'Com a Thayná' }] } },
      { id: EDUCACIONAL, _embedded: { statuses: [{ id: 900009, name: 'com a lyra' }] } },
    ];
    expect([...etapasDeTriagem(funis)]).toEqual([COM_A_LYRA]);
  });
});
