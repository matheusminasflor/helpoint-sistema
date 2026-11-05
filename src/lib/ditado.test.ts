import { describe, expect, it } from 'vitest';
import { somarTrecho, textoDaEscuta, trechoNovo } from './ditado';

describe('textoDaEscuta', () => {
  it('resultado acumulado do Android não repete a frase', () => {
    expect(textoDaEscuta(['abre', 'abre um', 'abre um chamado'])).toBe('abre um chamado');
  });
  it('a mesma frase mandada duas vezes entra uma vez', () => {
    expect(textoDaEscuta(['abre um chamado', 'abre um chamado'])).toBe('abre um chamado');
  });
  it('frases diferentes se somam', () => {
    expect(textoDaEscuta(['abre um chamado', 'sobre a reunião'])).toBe('abre um chamado sobre a reunião');
  });
  it('palavra que só começa igual não engole a anterior', () => {
    expect(somarTrecho('a', 'ata da reunião')).toBe('a ata da reunião');
  });
});

describe('trechoNovo', () => {
  it('repetição da escuta anterior não entra', () => {
    expect(trechoNovo('abre um chamado', 'Abre um chamado')).toBe('');
  });
  it('só a continuação entra', () => {
    expect(trechoNovo('abre um chamado', 'abre um chamado sobre a reunião')).toBe('sobre a reunião');
  });
  it('fala nova entra inteira', () => {
    expect(trechoNovo('abre um chamado', 'é urgente')).toBe('é urgente');
  });
});
