import { ReactNode, useEffect, useMemo, useState } from 'react';
import { AppSidebar, getBreadcrumb } from './AppSidebar';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ChevronRight, Home, Menu } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { useIsBelow } from '@/hooks/use-mobile';

import { supabase } from '@/integrations/supabase/client';
import { applyTenantBrandingVars } from '@/hooks/useTenantBranding';
import { useTenantPath } from '@/hooks/useTenantPath';
import { BreadcrumbProvider, useBreadcrumbLeaf } from '@/contexts/BreadcrumbContext';

// DailyEmailGate desativado: verificação diária por e-mail não é mais bloqueante.

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <BreadcrumbProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </BreadcrumbProvider>
  );
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { user, isLoading, profile } = useAuth();
  const location = useLocation();
  const tenantPath = useTenantPath();
  const isCompact = useIsBelow(1024);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {

    if (!profile?.tenant_id) return;
    (async () => {
      const { data, error } = await supabase.from('tenants').select('id,name,slug,logo_url,settings').eq('id', profile.tenant_id).maybeSingle();
      if (error) { console.error(error); return; }
      if (!data) return;
      const b = (data.settings as any)?.branding || {};
      applyTenantBrandingVars({
        id: data.id, name: data.name, slug: data.slug, logo_url: data.logo_url,
        primary_color: b.primaryColor || null,
        accent_color: b.accentColor || null,
        sidebar_bg: b.sidebarBg || null,
        sidebar_fg: b.sidebarFg || null,
        font_family: b.fontFamily || null,
        login_banner_url: b.loginBannerUrl || null,
        welcome_text: b.welcomeText || null,
        tagline: b.tagline || null,
      });
    })();
  }, [profile?.tenant_id]);


  const { leaf } = useBreadcrumbLeaf();
  const crumbs = useMemo(() => {
    const base = getBreadcrumb(location.pathname);
    if (!leaf) return base;
    // Telas de detalhe informam o rótulo real do último nível (#nº — assunto).
    return [...base.slice(0, -1), { label: leaf }];
  }, [location.pathname, leaf]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'hsl(var(--accent))', borderTopColor: 'transparent' }} />
          <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar
        isDrawer={isCompact}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Header — GLPI-style: breadcrumb left, search center, actions right */}
        <header
          className="sticky top-0 z-30 h-[56px] bg-card flex items-center px-4 sm:px-6 gap-3 sm:gap-6 flex-shrink-0"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          {isCompact && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu de navegação"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}

          {/* Breadcrumb */}
          <nav className="hidden sm:flex items-center gap-1.5 text-[13px] min-w-0">

            {crumbs.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 min-w-0">
                {i === 0 && <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={2} />}
                {c.path && i < crumbs.length - 1 ? (
                  <Link to={tenantPath(c.path)} className="text-muted-foreground hover:text-primary font-medium truncate">
                    {c.label}
                  </Link>
                ) : (
                  <span className={i === crumbs.length - 1 ? 'text-foreground font-semibold truncate' : 'text-muted-foreground font-medium truncate'}>
                    {c.label}
                  </span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" strokeWidth={2.2} />}
              </div>
            ))}
          </nav>

          {/* Busca global (Ctrl/Cmd+K) */}
          <div className="flex-1 flex justify-center">
            <GlobalSearch />
          </div>


          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto w-full">
          {children}
        </main>
      </div>
      
    </div>
  );
}
