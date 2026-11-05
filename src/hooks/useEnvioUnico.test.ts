import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEnvioUnico } from './useEnvioUnico';

describe('useEnvioUnico', () => {
  it('cliques enquanto os anexos sobem não abrem outro chamado', async () => {
    let terminar = () => {};
    const envio = vi.fn(() => new Promise<void>((pronto) => { terminar = pronto; }));
    const { result } = renderHook(() => useEnvioUnico());

    let primeiro = Promise.resolve();
    act(() => {
      primeiro = result.current.enviarUmaVez(envio);
      void result.current.enviarUmaVez(envio);
      void result.current.enviarUmaVez(envio);
    });
    expect(envio).toHaveBeenCalledTimes(1);
    expect(result.current.enviando).toBe(true);

    await act(async () => { terminar(); await primeiro; });
    expect(result.current.enviando).toBe(false);
  });

  it('depois de um erro, dá para enviar de novo', async () => {
    const { result } = renderHook(() => useEnvioUnico());
    await act(async () => { await result.current.enviarUmaVez(() => Promise.reject(new Error('falhou'))).catch(() => {}); });
    const envio = vi.fn(async () => {});
    await act(async () => { await result.current.enviarUmaVez(envio); });
    expect(envio).toHaveBeenCalledTimes(1);
  });
});
