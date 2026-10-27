// Rodada 3, correção 8: o HoverCard do Radix ignora o dedo, e as listas dos Indicadores ficavam mortas no celular.
// O teste lê o estado no gatilho (`data-state`), sem o conteúdo: posicionar o cartão flutuante no jsdom estoura o tempo.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoverCard, HoverCardTrigger } from './hover-card';

const monta = () => {
  render(
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild><button type="button">3 abertos</button></HoverCardTrigger>
    </HoverCard>,
  );
  return screen.getByRole('button', { name: '3 abertos' });
};
// O jsdom não tem PointerEvent: o `pointerType` vai à mão no evento, que é de onde o React o lê.
const toca = (el: HTMLElement, pointerType: string) => {
  const e = new MouseEvent('pointerdown', { bubbles: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  fireEvent(el, e);
  fireEvent.click(el);
};

describe('HoverCard no toque', () => {
  it('um toque abre a lista e outro fecha', () => {
    const gatilho = monta();
    toca(gatilho, 'touch');
    expect(gatilho.getAttribute('data-state')).toBe('open');
    toca(gatilho, 'touch');
    expect(gatilho.getAttribute('data-state')).toBe('closed');
  });

  it('o clique do mouse não abre nem fecha (o mouse continua passando por cima)', () => {
    const gatilho = monta();
    toca(gatilho, 'mouse');
    expect(gatilho.getAttribute('data-state')).toBe('closed');
  });
});
