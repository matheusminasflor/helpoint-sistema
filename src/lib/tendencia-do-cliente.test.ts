import { describe, expect, it } from 'vitest';
import { tendenciaDoCliente } from './tendencia-do-cliente';

const t = (media_3m: number, media_12m: number, situacao = 'ativo') => tendenciaDoCliente({ situacao, media_3m, media_12m });

describe('tendenciaDoCliente', () => {
  it('em alta a partir de 110% da média de 12 meses', () => {
    expect(t(110, 100)).toBe('alta');
    expect(t(109.99, 100)).toBe('estavel');
  });
  it('esfriando abaixo de 80%', () => {
    expect(t(79.99, 100)).toBe('esfriando');
    expect(t(80, 100)).toBe('estavel');
  });
  it('inativo vence a conta', () => expect(t(500, 100, 'inativo')).toBe('inativo'));
  it('sem média de 12 meses, sem base', () => expect(t(50, 0)).toBe('sem_base'));
});
