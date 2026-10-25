import { describe, expect, it } from 'vitest';
import { haQuantoTempo } from './dates';

describe('haQuantoTempo (idade na fila, 2026-10-24)', () => {
  const agora = new Date('2026-10-25T12:00:00Z');
  it('do minuto ao dia', () => {
    expect(haQuantoTempo('2026-10-25T11:59:40Z', agora)).toBe('agora');
    expect(haQuantoTempo('2026-10-25T11:20:00Z', agora)).toBe('40 min');
    expect(haQuantoTempo('2026-10-25T09:00:00Z', agora)).toBe('3 h');
    expect(haQuantoTempo('2026-10-23T11:00:00Z', agora)).toBe('2 d');
  });
});
