import { describe, it, expect } from 'vitest';
import { iaLigada } from './ia-ligada';

describe('iaLigada', () => {
  it('sem settings (carregando ou sem empresa) está desligada', () => {
    expect(iaLigada(undefined)).toBe(false);
    expect(iaLigada(null)).toBe(false);
  });
  it('settings sem a chave lyra conta como ligada', () => {
    expect(iaLigada({})).toBe(true);
  });
  it('enabled true liga', () => {
    expect(iaLigada({ lyra: { enabled: true } })).toBe(true);
  });
  it('enabled false desliga', () => {
    expect(iaLigada({ lyra: { enabled: false } })).toBe(false);
  });
});
