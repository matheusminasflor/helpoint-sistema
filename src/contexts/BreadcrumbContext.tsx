import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Permite que telas de detalhe (chamado, SAC, tutorial) informem o rótulo real
 * do último nível do breadcrumb — ex.: "#1042 — Notebook não liga".
 * Sem isso o breadcrumb pararia no módulo e a tela ficaria sem título.
 */
interface BreadcrumbLeafValue {
  leaf: string | null;
  setLeaf: (label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbLeafValue>({ leaf: null, setLeaf: () => {} });

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState<string | null>(null);
  return <BreadcrumbContext.Provider value={{ leaf, setLeaf }}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbLeaf() {
  return useContext(BreadcrumbContext);
}

/** Define o rótulo do último nível enquanto a tela estiver montada. */
export function useSetBreadcrumbLeaf(label: string | null | undefined) {
  const { setLeaf } = useBreadcrumbLeaf();
  useEffect(() => {
    setLeaf(label ?? null);
    return () => setLeaf(null);
  }, [label, setLeaf]);
}
