import { describe, it, expect } from 'vitest';
import { degrauIntensidade } from './matriz-cor';

describe('degrauIntensidade', () => {
  it('valor 0 fica sem fundo', () => {
    expect(degrauIntensidade(0, 1000).classe).toBe('');
  });

  it('valor igual ao máximo cai no degrau mais forte', () => {
    expect(degrauIntensidade(1000, 1000).classe).toBe('bg-primary/55');
  });

  it('maximo = 0 não divide por zero nem pinta tudo', () => {
    expect(degrauIntensidade(0, 0)).toEqual({ classe: '' });
    expect(degrauIntensidade(50, 0)).toEqual({ classe: '' });
  });

  // Correção da auditoria (item 6.2): trocar o limiar de 0,20 para 0,15 não
  // matava nada, porque só os limites 0,05 e 0,50 eram testados no valor
  // exato — o do meio usava 0,15, que nunca é a fronteira. As quatro
  // asserções abaixo testam o valor exato de cada fronteira dos novos
  // degraus (item 4).
  it('degraus no valor exato de cada fronteira', () => {
    expect(degrauIntensidade(100, 1000).classe).toBe('bg-primary/10'); // 10% — fronteira do 1º degrau
    expect(degrauIntensidade(250, 1000).classe).toBe('bg-primary/25'); // 25% — fronteira do 2º degrau
    expect(degrauIntensidade(400, 1000).classe).toBe('bg-primary/40'); // 40% — fronteira do 3º degrau
    expect(degrauIntensidade(550, 1000).classe).toBe('bg-primary/55'); // 55% — dentro do último degrau, sem limite superior
  });
});
