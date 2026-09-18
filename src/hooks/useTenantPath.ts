import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';

/**
 * Resolve o slug do tenant ativo:
 *  1. domínio próprio verificado (hostname != helpoint.*)
 *  2. fallback: slug do tenant do usuário logado, buscado pelo tenant_id
 */
let _customHostSlugCache: string | null | undefined = undefined;

function isDefaultHost(host: string) {
  return (
    host === 'localhost' ||
    host === 'helpoint.com.br' ||
    host === 'www.helpoint.com.br'
  );
}

export function useTenantSlug(): string | null {
  const { tenantId } = useAuth();
  const [hostSlug, setHostSlug] = useState<string | null>(_customHostSlugCache ?? null);

  useEffect(() => {
    if (_customHostSlugCache !== undefined) return;
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (!host || isDefaultHost(host)) {
      _customHostSlugCache = null;
      return;
    }
    (async () => {
      try {
        const data = unwrap(await supabase.functions.invoke('tenant-resolve-host', {
          body: { hostname: host },
        }));
        const s = (data as any)?.tenant?.slug || null;
        _customHostSlugCache = s;
        setHostSlug(s);
      } catch {
        _customHostSlugCache = null;
      }
    })();
  }, []);

  // `profile` não traz a relação `tenants` (o AuthContext lê com `select('*')`,
  // sem join) e não há coluna `tenant_slug` em `profiles` — por isso a busca
  // pelo `tenant_id` (regra 3 das cinco: queryKey leva o tenantId).
  const { data: userSlug } = useQuery({
    queryKey: ['tenant-slug', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> =>
      unwrap(await supabase.from('tenants').select('slug').eq('id', tenantId!).single()).slug,
  });

  return hostSlug || userSlug || null;
}

// ADR-010: não há mais prefixo de empresa no endereço.
// A função continua existindo para não tocar em 44 arquivos que a chamam.
// ponytail: função virou identidade; some no dia em que alguém passar pelos 44 chamadores.
export function useTenantPath() {
  return useCallback((path: string) => path, []);
}
