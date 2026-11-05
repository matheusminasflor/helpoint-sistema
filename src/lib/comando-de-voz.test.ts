import { describe, expect, it } from 'vitest';
import { pedeCompra, pedeProjeto, pedeRotina, rotaDeExportacao } from './comando-de-voz';

describe('pedeRotina e pedeProjeto', () => {
  it('reconhece o pedido de criar', () => {
    expect(pedeRotina('cria uma rotina toda segunda de conferir o backup')).toBe(true);
    expect(pedeProjeto('abre um novo projeto da feira de beleza')).toBe(true);
  });
  it('chamado sobre rotina ou projeto continua chamado', () => {
    expect(pedeRotina('abre um chamado da rotina de backup')).toBe(false);
    expect(pedeProjeto('abre chamado do projeto da feira')).toBe(false);
  });
  it('só citar não é pedir para criar', () => {
    expect(pedeProjeto('como está o projeto da feira')).toBe(false);
  });
});

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
