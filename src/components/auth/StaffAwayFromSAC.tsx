import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Se um usuário staff (com profile + tenant_id e SEM customer_profile)
 * abrir qualquer rota pública do SAC, mandamos para o painel interno
 * do tenant. SAC é exclusivo para clientes finais.
 */
export function StaffAwayFromSAC() {
  const { user, profile, isCustomer, isLoading } = useAuth();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || isCustomer || !profile?.tenant_id) { setSlug(null); return; }
      const { data } = await supabase
        .from('tenants').select('slug').eq('id', profile.tenant_id).maybeSingle();
      if (!cancelled) setSlug(data?.slug ?? null);
    })();
    return () => { cancelled = true; };
  }, [user, isCustomer, profile?.tenant_id]);

  if (isLoading || (user && !isCustomer && profile?.tenant_id && slug === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user && !isCustomer && profile?.tenant_id && slug) {
    return <Navigate to={`/t/${slug}/inicio`} replace />;
  }

  return <Outlet />;
}
