import { describe, expect, it } from 'vitest';
import { formatarHoras } from './horas';

describe('formatarHoras', () => {
  it('até um dia, com vírgula; a partir de um dia, em dias e horas', () => {
    expect(formatarHoras(22.7)).toBe('22,7 h');
    expect(formatarHoras(0)).toBe('0 h');
    expect(formatarHoras(73.2)).toBe('3 d 1 h');
    expect(formatarHoras(246.8)).toBe('10 d 7 h');
    expect(formatarHoras(48)).toBe('2 d');
    expect(formatarHoras(47.8)).toBe('2 d');
    expect(formatarHoras(null)).toBe('—');
  });
});
