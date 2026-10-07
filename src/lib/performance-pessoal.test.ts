import { describe, expect, it } from 'vitest';
import { separarPorSetor } from './performance-pessoal';

describe('separarPorSetor', () => {
  const chamados = [
    { id: 'ti-1', module: 'tickets' },
    { id: 'rh-1', module: 'rh' },
    { id: 'ti-2', module: null },
  ];

  it('o chamado de outro setor vira ajuda e não entra na performance', () => {
    const { meus, ajuda } = separarPorSetor(chamados, ['tickets']);
    expect(meus.map(c => c.id)).toEqual(['ti-1', 'ti-2']);
    expect(ajuda.map(c => c.id)).toEqual(['rh-1']);
  });

  it('quem é de dois setores tem os dois como seus', () => {
    const { meus, ajuda } = separarPorSetor(chamados, ['tickets', 'rh']);
    expect(meus).toHaveLength(3);
    expect(ajuda).toHaveLength(0);
  });

  it('sem setor cadastrado, tudo conta como da pessoa', () => {
    expect(separarPorSetor(chamados, []).meus).toHaveLength(3);
    expect(separarPorSetor(chamados, undefined).ajuda).toHaveLength(0);
  });
});
