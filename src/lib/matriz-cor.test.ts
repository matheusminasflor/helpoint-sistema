import { describe, it, expect } from 'vitest';
import { degrauIntensidade } from './matriz-cor';

describe('degrauIntensidade', () => {
  it('valor 0 fica sem fundo', () => {
    expect(degrauIntensidade(0, 1000).classe).toBe('');
  });

  it('valor igual ao máximo cai no degrau mais forte, com texto claro', () => {
    const degrau = degrauIntensidade(1000, 1000);
    expect(degrau.classe).toBe('bg-primary/70');
    expect(degrau.textoClaro).toBe(true);
  });

  it('maximo = 0 não divide por zero nem pinta tudo', () => {
    expect(degrauIntensidade(0, 0)).toEqual({ classe: '', textoClaro: false });
    expect(degrauIntensidade(50, 0)).toEqual({ classe: '', textoClaro: false });
  });

  it('degraus intermediários não usam texto claro', () => {
    expect(degrauIntensidade(50, 1000)).toEqual({ classe: 'bg-primary/10', textoClaro: false }); // 5%
    expect(degrauIntensidade(150, 1000)).toEqual({ classe: 'bg-primary/30', textoClaro: false }); // 15%
    expect(degrauIntensidade(500, 1000)).toEqual({ classe: 'bg-primary/50', textoClaro: false }); // 50%
  });
});
