import { describe, it, expect } from 'vitest';
import { periodosDoChamado } from './setor-fora';

const evento = { id: 'e', de: '2026-10-26', ate: '2026-10-27', motivo: 'apoio no evento' };

describe('setor fora no chamado', () => {
  it('aparece no chamado que estava aberto em algum dia do período', () => {
    expect(periodosDoChamado([evento], { created_at: '2026-10-23T19:20:00Z', resolved_at: '2026-10-28T14:00:00Z' })).toEqual([evento]);
    expect(periodosDoChamado([evento], { created_at: '2026-10-27T12:00:00Z', resolved_at: null })).toEqual([evento]);
  });

  it('não aparece no que fechou antes ou abriu depois', () => {
    expect(periodosDoChamado([evento], { created_at: '2026-10-20T12:00:00Z', resolved_at: '2026-10-23T12:00:00Z' })).toEqual([]);
    expect(periodosDoChamado([evento], { created_at: '2026-10-28T12:00:00Z', resolved_at: null })).toEqual([]);
  });
});
