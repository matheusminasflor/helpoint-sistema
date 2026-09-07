import { Navigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AccessDenied from '@/pages/AccessDenied';

/**
 * Protege rotas administrativas:
 * - Clientes do SAC nunca conseguem acessar o painel interno.
 * - Defesa em profundidade: se o slug da URL difere do tenant do usuário,
 *   renderiza Acesso negado (não confia só no TenantSlugGuard).
 */
export function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isCustomer, profile, isLoading } = useAuth();
  const { slug } = useParams();
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

  if (isLoading || (profile?.tenant_id && !resolved)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isCustomer) return <Navigate to="/sac/meus-chamados" replace />;
  if (!profile?.tenant_id) return <Navigate to="/onboarding/empresa" replace />;

  if (slug && userTenant?.slug && userTenant.slug !== slug) {
    return (
      <AccessDenied
        currentTenantName={userTenant.name}
        currentTenantSlug={userTenant.slug}
        attemptedTenantSlug={slug}
      />
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
