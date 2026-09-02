import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve o slug do tenant ativo:
 *  1. `:slug` da rota `/t/:slug/...`
 *  2. domínio próprio verificado (hostname != helpoint.* / lovable.app)
 *  3. fallback: slug do tenant do usuário logado
 */
let _customHostSlugCache: string | null | undefined = undefined;

function isDefaultHost(host: string) {
  return (
    host === 'localhost' ||
    host.endsWith('.lovable.app') ||
    host.endsWith('.lovable.dev') ||
    host === 'helpoint.com.br' ||
    host === 'www.helpoint.com.br'
  );
}

export function useTenantSlug(): string | null {
  const { slug } = useParams();
  const { profile } = useAuth();
  const [hostSlug, setHostSlug] = useState<string | null>(_customHostSlugCache ?? null);

  useEffect(() => {
    if (slug) return;
    if (_customHostSlugCache !== undefined) return;
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (!host || isDefaultHost(host)) {
      _customHostSlugCache = null;
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('tenant-resolve-host', {
          body: { hostname: host },
        });
        const s = (data as any)?.tenant?.slug || null;
        _customHostSlugCache = s;
        setHostSlug(s);
      } catch {
        _customHostSlugCache = null;
      }
    })();
  }, [slug]);

  return slug || hostSlug || (profile as any)?.tenant?.slug || (profile as any)?.tenant_slug || null;
}

/**
 * Retorna função que prefixa caminhos com `/t/{slug}` quando aplicável.
 * Em domínio próprio (cache resolveu o tenant) **não** prefixa — o host já identifica.
 */
export function useTenantPath() {
  const { slug: paramSlug } = useParams();
  const { profile } = useAuth();
  const userSlug = paramSlug || (profile as any)?.tenant?.slug || null;

  return useCallback(
    (path: string) => {
      if (!path) return path;
      if (path.startsWith('/t/')) return path;
      // se estamos numa URL com :slug, mantém o prefixo
      if (paramSlug) return `/t/${paramSlug}${path.startsWith('/') ? path : '/' + path}`;
      // se domínio próprio resolveu, não prefixa
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host && !isDefaultHost(host) && _customHostSlugCache) return path;
      // host padrão: usa o slug do usuário se houver
      if (userSlug) return `/t/${userSlug}${path.startsWith('/') ? path : '/' + path}`;
      return path;
    },
    [paramSlug, userSlug],
  );
}

/** Helper estático para `navigate(...)` após login. */
export function buildTenantPath(slug: string | null | undefined, path: string) {
  if (!slug) return path;
  return `/t/${slug}${path.startsWith('/') ? path : '/' + path}`;
}
