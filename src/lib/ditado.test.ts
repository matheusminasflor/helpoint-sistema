import { describe, expect, it } from 'vitest';
import { limparFala, somarTrecho, textoDaEscuta, trechoNovo } from './ditado';

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

describe('limparFala', () => {
  it('tira as hesitações', () => {
    expect(limparFala('eeee abre um chamado ééé hum sobre a reunião')).toBe('abre um chamado sobre a reunião');
  });
  it('tira a palavra gaguejada', () => {
    expect(limparFala('a a a impressora não não imprime')).toBe('a impressora não imprime');
  });
  it('tira o trecho repetido', () => {
    expect(limparFala('abre um abre um chamado')).toBe('abre um chamado');
  });
  it('não mexe em palavra normal nem em número', () => {
    expect(limparFala('ele é o dono, eram 20 20 caixas')).toBe('ele é o dono, eram 20 20 caixas');
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
