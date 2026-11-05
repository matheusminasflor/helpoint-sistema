import { describe, expect, it } from 'vitest';
import { pedeCompra, rotaDeExportacao } from './comando-de-voz';

describe('rotaDeExportacao', () => {
  it('entende setor e período', () => {
    expect(rotaDeExportacao('Exporta os indicadores da TI da semana passada')).toBe('/ti/indicadores?periodo=semana_passada&exportar=1');
    expect(rotaDeExportacao('gera o pdf do marketing do mês passado')).toBe('/mkt/indicadores?periodo=mes_passado&exportar=1');
    expect(rotaDeExportacao('relatório da TI deste mês')).toBe('/ti/indicadores?periodo=este_mes&exportar=1');
    expect(rotaDeExportacao('relatório da TI este mês')).toBe('/ti/indicadores?periodo=este_mes&exportar=1');
  });

  it('sem período, usa a semana passada, a da reunião', () => {
    expect(rotaDeExportacao('exportar relatório da TI')).toBe('/ti/indicadores?periodo=semana_passada&exportar=1');
  });

  it('não confunde com chamado nem com setor sem PDF', () => {
    expect(rotaDeExportacao('a impressora da TI não funciona')).toBeNull();
    expect(rotaDeExportacao('abre um chamado sobre o relatório da TI')).toBeNull();
    expect(rotaDeExportacao('exporta o relatório do RH')).toBeNull();
    expect(rotaDeExportacao('o gatilho do computador')).toBeNull();
  });
});

describe('pedeCompra', () => {
  it('reconhece pedido de compra', () => {
    expect(pedeCompra('preciso comprar 5 caixas de papel')).toBe(true);
    expect(pedeCompra('a impressora não imprime')).toBe(false);
  });
});
