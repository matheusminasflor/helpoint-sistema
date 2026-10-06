import { describe, expect, it } from 'vitest';
import { ehPedacoQueNaoVeio } from './versao-nova';

describe('ehPedacoQueNaoVeio', () => {
  it('reconhece as mensagens dos navegadores quando o pedaço de tela não vem', () => {
    expect(ehPedacoQueNaoVeio(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Jornal-abc.js'))).toBe(true); // Chrome
    expect(ehPedacoQueNaoVeio(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(ehPedacoQueNaoVeio(new TypeError('error loading dynamically imported module'))).toBe(true); // Firefox
    expect(ehPedacoQueNaoVeio(new TypeError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"))).toBe(true);
  });

  it('não confunde com erro comum da tela', () => {
    expect(ehPedacoQueNaoVeio(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(ehPedacoQueNaoVeio(null)).toBe(false);
  });
});
