import { describe, expect, it } from 'vitest';
import { SETORES, SIGLA_DO_SETOR, corDoSetor, setorDoModulo } from './setores';
import { TICKET_STATUS_META } from '@/config/ticket-status';

describe('cor do setor (rodada 3)', () => {
  it('todo setor tem sigla e classe de cor', () => {
    for (const s of SETORES) {
      expect(SIGLA_DO_SETOR[s.value]).toBeTruthy();
      expect(corDoSetor(s.value)).toBe(`setor-${s.value}`);
    }
  });
  it('o módulo "tickets" é a TI e o resto vem pelo nome', () => {
    expect(setorDoModulo('tickets')).toBe('ti');
    expect(setorDoModulo('Financeiro')).toBe('financeiro');
    expect(setorDoModulo('inventory')).toBeNull();
  });
});

describe('família do estado do chamado (rodada 3)', () => {
  it('cada status cai na família da proposta', () => {
    expect(TICKET_STATUS_META.open.familia).toBe('recebido');
    expect(TICKET_STATUS_META.in_progress.familia).toBe('setor');
    expect(TICKET_STATUS_META.waiting_user.familia).toBe('espera');
    expect(TICKET_STATUS_META.scheduled.familia).toBe('espera');
    expect(TICKET_STATUS_META.resolved.familia).toBe('concluido');
    expect(TICKET_STATUS_META.cancelled.familia).toBe('recebido');
  });
});
