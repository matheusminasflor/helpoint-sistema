// O distribuidor e o papel de quem está no Portal (etapa 6), dados pela `AreaDoPortal` às telas de dentro.
import { createContext, useContext } from 'react';
import type { NoPortal } from '@/hooks/useDistribuidor';

export const PortalContext = createContext<NoPortal | null>(null);

export function useNoPortal(): NoPortal {
  const s = useContext(PortalContext);
  if (!s) throw new Error('useNoPortal fora da AreaDoPortal');
  return s;
}
