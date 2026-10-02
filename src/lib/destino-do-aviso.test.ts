import { describe, expect, it } from 'vitest';
import { destinoDoAviso } from './destino-do-aviso';

describe('destinoDoAviso — para onde cada aviso leva (era o sino; desde 2026-10-02 o "Lyra avisa")', () => {
  it.each([
    [{ reference_type: 'ticket', reference_id: 'abc' }, '/helpdesk/abc'],
    [{ reference_type: 'sac_ticket', reference_id: 'abc' }, '/qualidade/sacs/abc'],
    [{ reference_type: 'chat_channel', reference_id: 'abc' }, '/chat/abc'],
    [{ reference_type: 'rh_request', reference_id: null }, '/meu-rh'],
    [{ reference_type: 'fin_entry', reference_id: 'abc' }, '/financeiro/contas-a-pagar'],
    [{ reference_type: 'inventado', reference_id: 'abc' }, null],
  ])('%o → %s', (aviso, destino) => {
    expect(destinoDoAviso(aviso, true)).toBe(destino);
  });

  it('meta definida só leva à Diretoria para quem entra lá', () => {
    const meta = { reference_type: 'com_meta', reference_id: 'x' };
    expect(destinoDoAviso(meta, true)).toBe('/diretoria');
    expect(destinoDoAviso(meta, false)).toBeNull();
  });
});
