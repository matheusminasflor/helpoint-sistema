import { useCallback, useEffect, useState } from 'react';

export type TableDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'helpoint.table.density';

export const DENSITY_ROW_HEIGHT: Record<TableDensity, number> = {
  comfortable: 44,
  compact: 34,
};

function read(): TableDensity {
  if (typeof window === 'undefined') return 'comfortable';
  return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
}

/** Alternância confortável/compacto persistida no navegador. */
export function useTableDensity() {
  const [density, setDensity] = useState<TableDensity>(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* storage indisponível */
    }
  }, [density]);

  const toggleDensity = useCallback(() => {
    setDensity(d => (d === 'compact' ? 'comfortable' : 'compact'));
  }, []);

  return { density, setDensity, toggleDensity, rowHeight: DENSITY_ROW_HEIGHT[density] };
}
