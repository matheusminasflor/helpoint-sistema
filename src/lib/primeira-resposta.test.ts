import { describe, expect, it } from 'vitest';
import { primeiraRespostaDoChamado, rotuloDaPrimeiraResposta } from './primeira-resposta';

const agora = new Date('2026-10-14T13:00:00Z');
const prazo = '2026-10-14T12:00:00Z';

describe('primeiraRespostaDoChamado', () => {
  it('sem prazo fica fora da conta', () => {
    expect(primeiraRespostaDoChamado({ status: 'open' }, agora)).toBeNull();
  });

  it('respondida antes do prazo cumpre; depois, nao', () => {
    expect(primeiraRespostaDoChamado({ first_response_due_at: prazo, first_response_at: '2026-10-14T11:00:00Z' }, agora))
      .toEqual({ cumpriu: true, estourado: false });
    expect(primeiraRespostaDoChamado({ first_response_due_at: prazo, first_response_at: '2026-10-14T12:30:00Z' }, agora))
      .toEqual({ cumpriu: false, estourado: false });
  });

  it('sem resposta e correndo depois do prazo: estourado', () => {
    expect(primeiraRespostaDoChamado({ status: 'open', first_response_due_at: prazo }, agora))
      .toEqual({ cumpriu: false, estourado: true });
  });

  it('resolvido sem resposta: a entrega vale como resposta; cancelado sem nada nao tem veredito', () => {
    expect(primeiraRespostaDoChamado({ status: 'resolved', resolved_at: '2026-10-14T11:30:00Z', first_response_due_at: prazo }, agora))
      .toEqual({ cumpriu: true, estourado: false });
    expect(primeiraRespostaDoChamado({ status: 'cancelled', first_response_due_at: prazo }, agora)).toBeNull();
  });
});

describe('rotuloDaPrimeiraResposta', () => {
  it('respondida com atraso diz quanto', () => {
    const r = rotuloDaPrimeiraResposta({ first_response_due_at: prazo, first_response_at: '2026-10-14T14:00:00Z' });
    expect(r?.atrasada).toBe(true);
    expect(r?.texto).toContain('com atraso de 2h');
  });

  it('respondida no prazo', () => {
    expect(rotuloDaPrimeiraResposta({ first_response_due_at: prazo, first_response_at: '2026-10-14T11:00:00Z' })?.texto)
      .toContain('(no prazo)');
  });
});
