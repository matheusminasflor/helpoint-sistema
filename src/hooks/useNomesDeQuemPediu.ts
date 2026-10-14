import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import type { PurchaseRequestRow } from '@/hooks/usePurchases';

/** Quem pediu: só o nome, de quem está no quadro. */
export function useNomesDeQuemPediu(pedidos: PurchaseRequestRow[]): Record<string, string> {
  const { tenantId } = useAuth();
  const quem = useMemo(() => [...new Set(pedidos.map((p) => p.created_by).filter(Boolean))] as string[], [pedidos]);
  const { data: nomes = {} } = useQuery({
    queryKey: ['compras-quem-pediu', tenantId, quem],
    enabled: !!tenantId && quem.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const rows = (unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', quem)) ?? []) as
        Array<{ id: string; full_name: string | null; email: string }>;
      return Object.fromEntries(rows.map((r) => [r.id, r.full_name || r.email]));
    },
  });
  return nomes;
}
