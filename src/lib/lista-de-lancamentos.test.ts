import { describe, expect, it } from 'vitest';
import { marcaNaLista } from './lista-de-lancamentos';

describe('Liquidar na lista do Financeiro', () => {
  const lista = { linhas: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }], cortou: true };

  it('marca só a linha certa e mantém o formato da lista', () => {
    expect(marcaNaLista(lista, 'a', { status: 'paid' })).toEqual({
      linhas: [{ id: 'a', status: 'paid' }, { id: 'b', status: 'pending' }], cortou: true,
    });
  });

  it('sem lista carregada, não inventa nada', () => {
    expect(marcaNaLista<(typeof lista.linhas)[number]>(undefined, 'a', { status: 'paid' })).toBeUndefined();
  });
});
