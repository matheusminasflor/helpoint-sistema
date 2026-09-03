import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

function isDefaultHost(host: string) {
  return (
    host === 'localhost' ||
    host === 'helpoint.com.br' ||
    host === 'www.helpoint.com.br'
  );
}

/**
 * Garante isolamento visual de tenant nas rotas legadas (`/*`):
 *  - Se o host é padrão (helpoint.com.br) e o usuário está logado,
 *    redireciona para `/t/{slug}/...` preservando o path atual.
 *  - Se for domínio próprio do tenant, mantém URL sem prefixo.
 *  - Se não houver login, segue normalmente (rotas internas tratam o redirect p/ login).
 */
export function LegacyTenantRedirect() {
  const { user, profile, isCustomer, isLoading } = useAuth();
  const location = useLocation();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const onDefaultHost = isDefaultHost(host);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.tenant_id) { setSlug(null); return; }
      const { data } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', profile.tenant_id)
        .maybeSingle();
      if (!cancelled) setSlug(data?.slug ?? null);
    })();
    return () => { cancelled = true; };
  }, [profile?.tenant_id]);

  if (isLoading || (user && !isCustomer && slug === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Usuário staff logado em host padrão sem prefixo → manda pro `/t/{slug}`
  if (user && !isCustomer && onDefaultHost && slug) {
    const path = location.pathname === '/' ? '/inicio' : location.pathname;
    return <Navigate to={`/t/${slug}${path}${location.search}`} replace />;
  }

  return <Outlet />;
}
