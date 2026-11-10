import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input de número', () => {
  it('seleciona o valor ao receber o foco, para o que se digita substituir (não virar "01")', () => {
    render(<Input aria-label="qtd" inputMode="decimal" defaultValue="0" />);
    const campo = screen.getByLabelText('qtd') as HTMLInputElement;
    fireEvent.focus(campo);
    expect([campo.selectionStart, campo.selectionEnd]).toEqual([0, 1]);
  });
  it('campo de texto não seleciona', () => {
    render(<Input aria-label="nome" defaultValue="Ana" />);
    const campo = screen.getByLabelText('nome') as HTMLInputElement;
    campo.setSelectionRange(3, 3);
    fireEvent.focus(campo);
    expect(campo.selectionStart).toBe(3);
  });
});
