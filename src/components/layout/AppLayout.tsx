import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { SeletorDeTema } from './SeletorDeTema';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { AvisoDePrazos } from './AvisoDePrazos';
import { BarraDeBaixo } from './BarraDeBaixo';
import { useIsBelow } from '@/hooks/use-mobile';
import { rotularTabelasDe } from '@/lib/rotulos-das-tabelas';
import { ehRelatorio, LARGURA_DO_CELULAR } from '@/config/celular';
import { cn } from '@/lib/utils';

import { supabase } from '@/integrations/supabase/client';
import { applyTenantBrandingVars } from '@/hooks/useTenantBranding';
import { ContaNoTopo } from './ContaNoTopo';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';

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
  const isCompact = useIsBelow(1024);
  const resumido = useIsBelow(LARGURA_DO_CELULAR) && ehRelatorio(location.pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // No celular a tabela vira lista: o observador põe o nome da coluna em cada célula (index.css, etapa 2).
  const desligarRotulos = useRef<() => void>();
  const areaDoApp = useCallback((el: HTMLElement | null) => {
    desligarRotulos.current?.();
    desligarRotulos.current = el ? rotularTabelasDe(el) : undefined;
  }, []);

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


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'hsl(var(--accent))', borderTopColor: 'transparent' }} />
          <p className="text-sm text-muted-foreground font-medium">Carregando…</p>
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
        {/* O topo da DashStack (2026-10-28): 70px, a busca em cápsula à esquerda, o tema e a pessoa à direita. O caminho
            ("Início › TI › Chamados") saiu: o título grande da página diz onde se está. */}
        <header
          className="sticky top-0 z-30 h-[70px] bg-card flex items-center px-4 sm:px-8 gap-3 sm:gap-6 flex-shrink-0"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          {/* Abaixo de 860 px a barra de baixo já tem "Menu" (rodada 2, decisão 3): o botão do topo fica só no tablet. */}
          {isCompact && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu de navegação"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-[860px]:hidden"
            >
              <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}

          {/* Busca global (Ctrl/Cmd+K) */}
          <div className="flex-1 min-w-0 flex justify-start">
            <GlobalSearch />
          </div>

          {/* Claro × escuro × sistema (leva J) e a pessoa. O sino que ficava ao lado saiu em 2026-10-02 (decisão do
              dono): os avisos estão no "Lyra avisa" da tela inicial e no e-mail. */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <SeletorDeTema />
            <ContaNoTopo />
          </div>
        </header>
        {/* Prazos vencidos ou perto de vencer: faixa no topo, uma vez por dia (2026-10-24). */}
        <AvisoDePrazos />
        {/* No celular a barra de baixo cobre o fim da página: o espaço dela fica reservado. */}
        {/* Relatório aberto no celular vira a versão resumida (dono, 2026-10-28): os números ficam, tabelas e gráficos
            não (`.resumo-no-celular` em index.css; a lista das telas em `config/celular`). */}
        <main ref={areaDoApp} className={cn('area-do-app flex-1 overflow-auto w-full max-[860px]:pb-[calc(56px+env(safe-area-inset-bottom))]',
          resumido && 'resumo-no-celular')}>
          {resumido && (
            <p role="note" className="m-3 mb-0 rounded-lg border border-border bg-primary-soft px-3 py-2 text-[13px] text-foreground">
              <b>Versão resumida no celular.</b> As tabelas e os gráficos deste relatório abrem no computador.
            </p>
          )}
          {children}
        </main>
      </div>
      <BarraDeBaixo abrirMenu={() => setDrawerOpen(true)} />
      
    </div>
  );
}
