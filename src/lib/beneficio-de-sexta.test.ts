import { describe, it, expect } from 'vitest';
import { conferirRegra } from './beneficio-de-sexta';

describe('conferirRegra — benefício de sexta (dono, 2026-10-20)', () => {
  it('da mesma linha, até 3', () => {
    expect(conferirRegra([{ quantidade: 2, linha: 'A' }, { quantidade: 1, linha: 'A' }])).toBeNull();
    expect(conferirRegra([{ quantidade: 4, linha: 'A' }])).toMatch(/máximo é 3/);
  });
  it('misturando linhas, até 2', () => {
    expect(conferirRegra([{ quantidade: 1, linha: 'A' }, { quantidade: 1, linha: 'B' }])).toBeNull();
    expect(conferirRegra([{ quantidade: 2, linha: 'A' }, { quantidade: 1, linha: 'B' }])).toMatch(/máximo é 2/);
  });
  it('sem produto, recusa', () => {
    expect(conferirRegra([])).not.toBeNull();
  });
});
