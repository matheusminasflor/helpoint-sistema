import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const acoes: Array<() => void> = [];
vi.mock('sonner', () => ({
  toast: { success: (_m: string, o: { action: { onClick: () => void } }) => acoes.push(o.action.onClick) },
}));

import { TEMPO_PARA_DESFAZER, feitoComDesfazer, gravarTudoAgora, temGravacaoEsperando } from './desfazer';

describe('Feito · Desfazer (regra 1 da proposta, 2026-10-24)', () => {
  beforeEach(() => { vi.useFakeTimers(); acoes.length = 0; });
  afterEach(() => { gravarTudoAgora(); vi.useRealTimers(); });

  const agenda = (chave = 'chamado:1') => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const aoDesfazer = vi.fn();
    const depois = vi.fn();
    feitoComDesfazer({ chave, mensagem: 'Feito', gravar, aoDesfazer, depois });
    return { gravar, aoDesfazer, depois };
  };

  it('só grava depois dos 8 segundos', async () => {
    const { gravar, depois } = agenda();
    await vi.advanceTimersByTimeAsync(TEMPO_PARA_DESFAZER - 1);
    expect(gravar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(gravar).toHaveBeenCalledOnce();
    expect(depois).toHaveBeenCalledWith();
  });

  it('desfazer não grava nada e devolve a tela', async () => {
    const { gravar, aoDesfazer } = agenda();
    acoes[0]();
    await vi.advanceTimersByTimeAsync(TEMPO_PARA_DESFAZER * 2);
    expect(gravar).not.toHaveBeenCalled();
    expect(aoDesfazer).toHaveBeenCalledOnce();
    expect(temGravacaoEsperando()).toBe(false);
  });

  it('desfazer depois de gravado não faz nada', async () => {
    const { aoDesfazer } = agenda();
    await vi.advanceTimersByTimeAsync(TEMPO_PARA_DESFAZER);
    acoes[0]();
    expect(aoDesfazer).not.toHaveBeenCalled();
  });

  it('a segunda ação no mesmo chamado grava a primeira na hora', async () => {
    const primeira = agenda();
    agenda();
    await vi.advanceTimersByTimeAsync(0);
    expect(primeira.gravar).toHaveBeenCalledOnce();
  });

  it('a falha chega a quem chamou, para a tela voltar à verdade do banco', async () => {
    const erro = new Error('42501');
    const depois = vi.fn();
    feitoComDesfazer({ chave: 'x', mensagem: 'Feito', gravar: () => Promise.reject(erro), aoDesfazer: vi.fn(), depois });
    await vi.advanceTimersByTimeAsync(TEMPO_PARA_DESFAZER);
    expect(depois).toHaveBeenCalledWith(erro);
  });

  it('fechar a página grava o que estava esperando', async () => {
    const { gravar } = agenda('compra:9');
    expect(temGravacaoEsperando()).toBe(true);
    gravarTudoAgora();
    await vi.advanceTimersByTimeAsync(0);
    expect(gravar).toHaveBeenCalledOnce();
    expect(temGravacaoEsperando()).toBe(false);
  });
});
