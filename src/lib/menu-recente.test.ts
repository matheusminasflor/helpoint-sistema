import { describe, expect, it } from 'vitest';
import { MAX_RECENTES, alternarFixado, registrarUso } from './menu-recente';

const i = (to: string) => ({ to, label: to });

describe('menu: fixados e usados por último (2026-10-24)', () => {
  it('o usado vai para o começo, sem repetir, e a lista não passa do máximo', () => {
    let l = [i('/a'), i('/b')];
    l = registrarUso(l, i('/b'));
    expect(l.map((x) => x.to)).toEqual(['/b', '/a']);
    for (const t of ['/c', '/d', '/e', '/f']) l = registrarUso(l, i(t));
    expect(l).toHaveLength(MAX_RECENTES);
    expect(l[0].to).toBe('/f');
  });
  it('fixar e soltar', () => {
    const l = alternarFixado([], i('/x'));
    expect(l.map((x) => x.to)).toEqual(['/x']);
    expect(alternarFixado(l, i('/x'))).toEqual([]);
  });
});
