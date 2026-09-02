import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Mantém um pedaço de estado de UI (filtro, ordenação, aba ativa, página)
 * na query string, para que a lista seja compartilhável e sobreviva ao refresh.
 */
export function useQueryState<T extends string = string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T) || defaultValue;

  const setValue = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!next || next === defaultValue) p.delete(key);
          else p.set(key, next);
          return p;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );

  return [value, setValue];
}

/** Variante numérica (paginação). */
export function useQueryNumberState(
  key: string,
  defaultValue = 1,
): [number, (value: number) => void] {
  const [raw, setRaw] = useQueryState(key, String(defaultValue));
  const parsed = Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  return [value, (next: number) => setRaw(String(next))];
}
