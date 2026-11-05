import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDitado } from './useDitado';

// O que o Chrome do Android faz: resultados acumulados, `isFinal` em trecho provisório e a fala de novo na escuta seguinte.
class Falso {
  static ultimo: Falso;
  lang = ''; interimResults = false; continuous = true;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  constructor() { Falso.ultimo = this; }
  ouve(...transcritos: string[]) {
    this.onresult?.({ resultIndex: 0, results: transcritos.map((transcript) => Object.assign([{ transcript }], { isFinal: true })) });
  }
}

describe('useDitado', () => {
  beforeEach(() => { (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Falso; });
  afterEach(() => { delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition; });

  it('a fala repetida pelo Android entra uma vez só', () => {
    const texto = vi.fn();
    const { result } = renderHook(() => useDitado(texto));
    act(() => result.current.iniciar());
    const r = Falso.ultimo;
    act(() => { r.ouve('abre'); r.ouve('abre', 'abre um'); r.ouve('abre', 'abre um', 'abre um chamado'); r.onend?.(); });
    act(() => { r.ouve('abre um chamado'); r.onend?.(); });
    expect(texto.mock.calls).toEqual([['abre um chamado']]);
    expect(r.start).toHaveBeenCalledTimes(3);
  });

  it('parar entrega o que estava sendo dito, sem repetir no fim da escuta', () => {
    const texto = vi.fn();
    const { result } = renderHook(() => useDitado(texto));
    act(() => result.current.iniciar());
    const r = Falso.ultimo;
    act(() => { r.ouve('abre um chamado'); result.current.parar(); r.onend?.(); });
    expect(texto.mock.calls).toEqual([['abre um chamado']]);
    expect(result.current.ouvindo).toBe(false);
  });

  it('silêncio seguido desliga o microfone', () => {
    const { result } = renderHook(() => useDitado(vi.fn()));
    act(() => result.current.iniciar());
    const r = Falso.ultimo;
    act(() => { r.onend?.(); r.onend?.(); r.onend?.(); });
    expect(result.current.ouvindo).toBe(false);
    expect(r.start).toHaveBeenCalledTimes(3);
  });
});
