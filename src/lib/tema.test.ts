import { describe, it, expect } from 'vitest';
import { TEMAS, isTema, temaEmUso, descricaoDoTema } from './tema';

describe('tema', () => {
  it('são três estados, e "sistema" é um deles', () => {
    expect(TEMAS.map((t) => t.valor)).toEqual(['light', 'dark', 'system']);
  });

  it('isTema recusa o que não é tema', () => {
    expect(isTema('dark')).toBe(true);
    expect(isTema('escuro')).toBe(false);
    expect(isTema(undefined)).toBe(false);
    expect(isTema(null)).toBe(false);
  });

  it('escolha explícita ganha do computador', () => {
    expect(temaEmUso('light', true)).toBe('light');
    expect(temaEmUso('dark', false)).toBe('dark');
  });

  // O caso que decide o ícone do botão: com 'system' escolhido, quem manda é a
  // máquina. Mostrar o sol aqui seria o botão mentindo sobre o que está na tela.
  it('com "sistema", quem manda é o computador', () => {
    expect(temaEmUso('system', true)).toBe('dark');
    expect(temaEmUso('system', false)).toBe('light');
  });

  it('sem escolha nenhuma, também segue o computador', () => {
    // `next-themes` devolve `undefined` no primeiro render, antes de ler o
    // localStorage. Tratar isso como 'light' faria o botão piscar.
    expect(temaEmUso(undefined, true)).toBe('dark');
    expect(temaEmUso(undefined, false)).toBe('light');
  });

  it('a descrição diz quando o tema está seguindo o computador', () => {
    expect(descricaoDoTema('dark', false)).toBe('Tema escuro');
    expect(descricaoDoTema('light', true)).toBe('Tema claro');
    expect(descricaoDoTema('system', true)).toBe('Tema escuro, seguindo o computador');
    expect(descricaoDoTema('system', false)).toBe('Tema claro, seguindo o computador');
    expect(descricaoDoTema(undefined, true)).toBe('Tema escuro, seguindo o computador');
  });
});
