import { describe, expect, it } from 'vitest';
import { resolverAcessoImportacoes } from './importacoes-acesso';

// Plano da Frente 6, §6: "a regra de quem vê o quê, por permissão — pura,
// sem componente." Os quatro casos possíveis das duas permissões.
describe('resolverAcessoImportacoes', () => {
  it('sem nenhuma permissão: menu escondido, nenhum cartão habilitado', () => {
    expect(resolverAcessoImportacoes({ podeImportarVendas: false, podeDefinirMetas: false })).toEqual({
      mostrarItemDeMenu: false, vendas: false, clientes: false, metas: false,
    });
  });

  it('só vendas.importar: menu aparece, Vendas e Clientes habilitados, Metas não', () => {
    expect(resolverAcessoImportacoes({ podeImportarVendas: true, podeDefinirMetas: false })).toEqual({
      mostrarItemDeMenu: true, vendas: true, clientes: true, metas: false,
    });
  });

  it('só metas.definir: menu aparece, só Metas habilitado', () => {
    expect(resolverAcessoImportacoes({ podeImportarVendas: false, podeDefinirMetas: true })).toEqual({
      mostrarItemDeMenu: true, vendas: false, clientes: false, metas: true,
    });
  });

  it('as duas: tudo habilitado', () => {
    expect(resolverAcessoImportacoes({ podeImportarVendas: true, podeDefinirMetas: true })).toEqual({
      mostrarItemDeMenu: true, vendas: true, clientes: true, metas: true,
    });
  });
});
