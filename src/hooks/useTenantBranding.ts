import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TenantBranding {
  id: string;
  name: string;
  slug: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  sidebar_bg?: string | null;
  sidebar_fg?: string | null;
  font_family?: string | null;
  login_banner_url?: string | null;
  welcome_text?: string | null;
  tagline?: string | null;
}

export function useTenantBranding(slugOrNull: string | null | undefined) {
  const [tenant, setTenant] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let row: any = null;
      if (slugOrNull) {
        const { data, error } = await supabase.rpc('get_sac_tenant_branding', { _slug: slugOrNull });
        if (error) {
          console.error(error);
        } else {
          row = Array.isArray(data) ? data[0] : data;
          // get full branding from tenants.settings for extra fields
          if (row?.id) {
            const { data: t, error: tError } = await supabase.from('tenants').select('settings').eq('id', row.id).maybeSingle();
            if (tError) {
              console.error(tError);
            } else {
              const b = (t?.settings as any)?.branding || {};
              row = {
                ...row,
                accent_color: b.accentColor || null,
                sidebar_bg: b.sidebarBg || null,
                sidebar_fg: b.sidebarFg || null,
                font_family: b.fontFamily || null,
                tagline: b.tagline || null,
              };
            }
          }
        }
      }
      if (!cancelled) {
        setTenant(row ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slugOrNull]);

  return { tenant, loading };
}

const GOOGLE_FONTS: Record<string, string> = {
  Figtree: 'Figtree:wght@400;500;600;700;800',
  Inter: 'Inter:wght@400;500;600;700;800',
  Roboto: 'Roboto:wght@400;500;700;900',
  Manrope: 'Manrope:wght@400;500;600;700;800',
  Poppins: 'Poppins:wght@400;500;600;700;800',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
};

function loadGoogleFont(name: string) {
  if (typeof document === 'undefined' || !name) return;
  const spec = GOOGLE_FONTS[name];
  if (!spec) return;
  const id = `gf-${name.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Aplica as cores/fonte do tenant nas CSS vars HSL globais.
 *
 * As CORES valem só no tema CLARO (2026-10-06): antes iam como estilo em linha no `<html>`, que
 * vence qualquer seletor — no escuro o menu lateral ficava com o fundo branco e a letra escura da
 * identidade da empresa. Agora vão numa folha `:root:not(.dark)`, e o `.dark` do `index.css`
 * manda no escuro. A fonte vale nos dois.
 */
export function applyTenantBrandingVars(t: TenantBranding | null | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const cores: Array<[string, string | null | undefined]> = [
    ['--primary', t?.primary_color],
    ['--accent', t?.accent_color],
    ['--ring', t?.accent_color || t?.primary_color],
    ['--sidebar-background', t?.sidebar_bg],
    ['--sidebar-foreground', t?.sidebar_fg],
    ['--sidebar-border', t?.sidebar_bg ? darkenHex(t.sidebar_bg, 0.85) : null],
  ];
  const regras = cores
    .map(([k, hex]) => [k, hex ? hexToHsl(hex) : null] as const)
    .filter(([, hsl]) => hsl)
    .map(([k, hsl]) => `${k}: ${hsl};`)
    .join(' ');
  let folha = document.getElementById('tenant-branding') as HTMLStyleElement | null;
  if (!folha) {
    folha = document.createElement('style');
    folha.id = 'tenant-branding';
    document.head.appendChild(folha);
  }
  folha.textContent = regras ? `:root:not(.dark) { ${regras} }` : '';
  // Limpa o que a versão antiga deixou em linha (a aba aberta antes da atualização).
  cores.forEach(([k]) => root.style.removeProperty(k));
  if (t?.font_family) {
    loadGoogleFont(t.font_family);
    root.style.setProperty('--font-sans', `'${t.font_family}', system-ui, sans-serif`);
  } else {
    root.style.removeProperty('--font-sans');
  }
}

function hexToHsl(hex: string): string | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let v = m[1];
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function darkenHex(hex: string, factor: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return hex;
  let v = m[1]; if (v.length === 3) v = v.split('').map(c => c + c).join('');
  const r = Math.round(parseInt(v.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(v.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(v.slice(4, 6), 16) * factor);
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}
