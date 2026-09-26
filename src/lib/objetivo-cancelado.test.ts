// Leva F, item 6 (2026-09-26): objetivo cancelado aparecia como válido na tela de
// Metas — sem marca nenhuma, e com o filho cancelado ainda contando na média.
import { describe, expect, it } from 'vitest';
import { estaCancelado, mediaDoObjetivo } from '@/lib/objetivo-cancelado';

describe('estaCancelado', () => {
  it('só `cancelled` é cancelado', () => {
    expect(estaCancelado({ status: 'cancelled' })).toBe(true);
    expect(estaCancelado({ status: 'active' })).toBe(false);
    expect(estaCancelado({ status: 'done' })).toBe(false);
  });

  it('status ausente ou nulo não é cancelado', () => {
    // Linha antiga sem status é ativa, não cancelada: tratar ausência como
    // cancelamento apagaria objetivo de verdade da conta.
    expect(estaCancelado({})).toBe(false);
    expect(estaCancelado({ status: null })).toBe(false);
  });
});

describe('mediaDoObjetivo', () => {
  // O CASO QUE DÁ NOME AO ITEM. Antes: 50%. Certo: 100%.
  it('filho cancelado NÃO entra na média', () => {
    expect(mediaDoObjetivo([
      { status: 'active', progress: 1 },
      { status: 'cancelled', progress: 0 },
    ])).toBe(1);
  });

  it('filho cancelado que já estava medido também sai', () => {
    // Cancelar depois de medir é o caso real: a medição existe, o objetivo não
    // vale mais. Sem isto, o número continuaria puxado pelo que foi abandonado.
    expect(mediaDoObjetivo([
      { status: 'active', progress: 1 },
      { status: 'active', progress: 0.5 },
      { status: 'cancelled', progress: 0.1 },
    ])).toBe(0.75);
  });

  it('sem filho mensurável devolve null, nunca zero', () => {
    // "Ainda não medido" e "medido em zero" são fatos diferentes sobre o mundo —
    // a mesma distinção que a Frente 2 existiu para estabelecer.
    expect(mediaDoObjetivo([])).toBeNull();
    expect(mediaDoObjetivo([{ status: 'active', progress: null }])).toBeNull();
    expect(mediaDoObjetivo([{ status: 'cancelled', progress: 1 }])).toBeNull();
  });

  it('quem passou de 100% não compensa quem não chegou', () => {
    expect(mediaDoObjetivo([
      { status: 'active', progress: 2 },
      { status: 'active', progress: 0 },
    ])).toBe(0.5);
  });

  it('lê progresso que vem como texto — o PostgREST devolve numeric como string', () => {
    expect(mediaDoObjetivo([
      { status: 'active', progress: '0.5' },
      { status: 'active', progress: '1' },
    ])).toBe(0.75);
  });

  it('todos ativos e medidos: a média simples', () => {
    expect(mediaDoObjetivo([
      { status: 'active', progress: 0.2 },
      { status: 'active', progress: 0.4 },
      { status: 'active', progress: 0.6 },
    ])).toBeCloseTo(0.4, 10);
  });
});
