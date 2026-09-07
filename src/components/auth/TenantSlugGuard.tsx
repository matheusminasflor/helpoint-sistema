import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import AccessDenied from '@/pages/AccessDenied';

/**
 * Verifica que o `:slug` da URL bate com o tenant do usuário logado.
 * - SAC clientes → /sac/meus-chamados.
 * - Staff de outra empresa → tela explícita de Acesso negado.
 */
export function TenantSlugGuard() {
  const { slug } = useParams();
  const { user, profile, isCustomer, isLoading } = useAuth();
  const [userTenant, setUserTenant] = useState<{ slug: string | null; name: string | null } | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.tenant_id) { setResolved(true); return; }
      const { data, error } = await supabase
        .from('tenants').select('slug,name').eq('id', profile.tenant_id).maybeSingle();
      if (error) { console.error(error); if (!cancelled) setResolved(true); return; }
      if (!cancelled) {
        setUserTenant({ slug: data?.slug ?? null, name: data?.name ?? null });
        setResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.tenant_id]);

  if (isLoading || !resolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/t/${slug}/login`} replace />;
  if (isCustomer) return <Navigate to="/sac/meus-chamados" replace />;
  if (!profile?.tenant_id) return <Navigate to="/onboarding/empresa" replace />;
  if (userTenant?.slug && slug && userTenant.slug !== slug) {
    return (
      <AccessDenied
        currentTenantName={userTenant.name}
        currentTenantSlug={userTenant.slug}
        attemptedTenantSlug={slug}
      />
    );
  }
  return <Outlet />;
}
