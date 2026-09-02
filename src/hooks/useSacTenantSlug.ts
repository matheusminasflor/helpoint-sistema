import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEY = 'sac_tenant_slug';

/**
 * Resolve o slug do tenant no fluxo público do SAC.
 * - Lê `?tenant=` da URL e persiste em localStorage.
 * - Se a URL não tiver, usa o último valor salvo (cliente recarregou a página, etc).
 */
export function useSacTenantSlug() {
  const [search] = useSearchParams();
  const fromUrl = search.get('tenant');
  const [slug, setSlug] = useState<string | null>(() => {
    if (fromUrl) return fromUrl;
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(KEY);
  });

  useEffect(() => {
    if (fromUrl) {
      try { window.localStorage.setItem(KEY, fromUrl); } catch {}
      setSlug(fromUrl);
    }
  }, [fromUrl]);

  return slug;
}
