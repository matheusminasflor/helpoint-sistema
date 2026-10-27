import { describe, it, expect, beforeEach } from 'vitest';
import { lerRascunho, guardarRascunho, apagarRascunho } from './rascunho-do-novo';

describe('rascunho do Novo', () => {
  beforeEach(() => sessionStorage.clear());

  it('o texto volta depois do "voltar" do celular, por pessoa e assunto', () => {
    guardarRascunho('p1', 'a1', { titulo: 'Uber', descricao: 'até o cliente' });
    expect(lerRascunho('p1', 'a1')).toEqual({ titulo: 'Uber', descricao: 'até o cliente' });
    expect(lerRascunho('p1', 'a2')).toBeNull();
    expect(lerRascunho('p2', 'a1')).toBeNull();
  });

  it('apagar o texto todo, enviar ou descartar não deixa rascunho', () => {
    guardarRascunho('p1', 'a1', { titulo: 'Uber', descricao: '' });
    guardarRascunho('p1', 'a1', { titulo: '  ', descricao: '' });
    expect(lerRascunho('p1', 'a1')).toBeNull();
    guardarRascunho('p1', 'a1', { titulo: 'Uber', descricao: '' });
    apagarRascunho('p1', 'a1');
    expect(lerRascunho('p1', 'a1')).toBeNull();
  });
});
