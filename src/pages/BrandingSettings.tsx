import { sanitizeFileName } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Upload, X, Copy, ExternalLink, Globe, Palette, Image as ImageIcon, Type, MonitorSmartphone, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { applyTenantBrandingVars } from '@/hooks/useTenantBranding';

const ONE_YEAR = 60 * 60 * 24 * 365 * 10;

interface Branding {
  logoUrl?: string;
  iconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  sidebarBg?: string;
  sidebarFg?: string;
  fontFamily?: string;
  loginBannerUrl?: string;
  welcomeText?: string;
  tagline?: string;
}

/** Tema claro Monday (espelha os tokens de src/index.css). */
const DEFAULTS: Required<Branding> = {
  logoUrl: '',
  iconUrl: '',
  primaryColor: '#0F6FDE',
  accentColor: '#0F6FDE',
  sidebarBg: '#FFFFFF',
  sidebarFg: '#33333A',
  fontFamily: 'Figtree',
  loginBannerUrl: '',
  welcomeText: '',
  tagline: 'Gestão integrada',
};

const COLOR_KEYS = ['primaryColor', 'accentColor', 'sidebarBg', 'sidebarFg'] as const;

/* ---------- contraste (WCAG) ---------- */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = (hex || '').replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let v = m[1];
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function relLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Razão de contraste 1..21; null se alguma cor for inválida. */
export function contrastRatio(fg: string, bg: string): number | null {
  const l1 = relLuminance(fg), l2 = relLuminance(bg);
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Converte hex em rgba() com a opacidade informada; fallback cinza se inválida. */
function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

const FONTS = ['Figtree', 'Inter', 'Roboto', 'Manrope', 'Poppins', 'Plus Jakarta Sans'];
const PRESETS: Array<{ name: string; b: Partial<Branding> }> = [
  { name: 'Helpoint Padrão (claro)', b: { primaryColor: '#0F6FDE', accentColor: '#0F6FDE', sidebarBg: '#FFFFFF', sidebarFg: '#33333A' } },
  { name: 'Azul Corporativo', b: { primaryColor: '#1E40AF', accentColor: '#3B82F6', sidebarBg: '#0F172A', sidebarFg: '#FFFFFF' } },
  { name: 'Verde Esmeralda', b: { primaryColor: '#059669', accentColor: '#10B981', sidebarBg: '#064E3B', sidebarFg: '#FFFFFF' } },
  { name: 'Roxo Premium', b: { primaryColor: '#7C3AED', accentColor: '#A78BFA', sidebarBg: '#1E1B4B', sidebarFg: '#FFFFFF' } },
  { name: 'Dark Mono', b: { primaryColor: '#111827', accentColor: '#F59E0B', sidebarBg: '#0B0B0F', sidebarFg: '#FFFFFF' } },
];


export default function BrandingSettings() {
  const { profile } = useAuth();
  const [tenant, setTenant] = useState<any>(null);
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'icon' | 'banner' | null>(null);
  const [companyName, setCompanyName] = useState('');
  /** true = o tenant já tem cores salvas OU o usuário mexeu nas cores agora. */
  const [hasCustomColors, setHasCustomColors] = useState(false);

  const setColor = (patch: Partial<Branding>) => {
    setHasCustomColors(true);
    setBranding(b => ({ ...b, ...patch }));
  };

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) return;
      const { data } = await supabase.from('tenants').select('*').eq('id', profile.tenant_id).single();
      setTenant(data);
      setCompanyName(data?.name || '');
      const b = (data?.settings as any)?.branding || {};
      setHasCustomColors(COLOR_KEYS.some(k => !!b[k]));
      setBranding({
        logoUrl: data?.logo_url || '',
        iconUrl: b.iconUrl || '',
        primaryColor: b.primaryColor || DEFAULTS.primaryColor,
        accentColor: b.accentColor || DEFAULTS.accentColor,
        sidebarBg: b.sidebarBg || DEFAULTS.sidebarBg,
        sidebarFg: b.sidebarFg || DEFAULTS.sidebarFg,
        fontFamily: b.fontFamily || DEFAULTS.fontFamily,
        loginBannerUrl: b.loginBannerUrl || '',
        welcomeText: b.welcomeText || '',
        tagline: b.tagline || DEFAULTS.tagline,
      });
    })();
  }, [profile?.tenant_id]);

  const sidebarContrast = contrastRatio(branding.sidebarFg!, branding.sidebarBg!);
  const primaryContrast = contrastRatio('#FFFFFF', branding.primaryColor!);
  const sidebarBlocked = sidebarContrast !== null && sidebarContrast < 1.6;
  const primaryBlocked = primaryContrast !== null && primaryContrast < 1.6;

  type UploadKind = 'logo' | 'icon' | 'banner';
  const FIELD_BY_KIND: Record<UploadKind, keyof Branding> = { logo: 'logoUrl', icon: 'iconUrl', banner: 'loginBannerUrl' };

  const upload = async (file: File, kind: UploadKind) => {
    if (!profile?.tenant_id) return null;
    const path = `${profile.tenant_id}/${kind}-${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from('tenant-branding').upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return null; }
    const { data: signed } = await supabase.storage.from('tenant-branding').createSignedUrl(path, ONE_YEAR);
    return signed?.signedUrl || null;
  };

  const onFile = (kind: UploadKind) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(kind);
    const url = await upload(f, kind);
    if (url) setBranding(b => ({ ...b, [FIELD_BY_KIND[kind]]: url }));
    setUploading(null);
  };

  const save = async () => {
    if (!profile?.tenant_id) return;
    if (hasCustomColors && (sidebarBlocked || primaryBlocked)) {
      toast.error('Combinação de cores ilegível. Ajuste o contraste antes de salvar.');
      return;
    }
    const trimmedName = (companyName || '').trim();
    const nameValid = trimmedName.length >= 2;
    if (!nameValid) toast.warning('Nome da empresa inválido (mínimo 2 caracteres). O nome atual foi mantido.');
    const finalName = nameValid ? trimmedName : (tenant?.name || '');
    setSaving(true);
    const currentBranding = (tenant?.settings as any)?.branding || {};
    // Só grava cores se o tenant já tinha cores OU o usuário escolheu ativamente.
    const colorPart = hasCustomColors
      ? {
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          sidebarBg: branding.sidebarBg,
          sidebarFg: branding.sidebarFg,
        }
      : {};
    const nextBranding = {
      ...currentBranding,
      ...colorPart,
      iconUrl: branding.iconUrl || '',
      fontFamily: branding.fontFamily,
      loginBannerUrl: branding.loginBannerUrl,
      welcomeText: branding.welcomeText,
      tagline: branding.tagline,
    };
    const mergedSettings = { ...(tenant?.settings || {}), branding: nextBranding };
    const { error } = await supabase.from('tenants').update({
      settings: mergedSettings,
      name: finalName || tenant?.name,
      logo_url: branding.logoUrl || null,
    }).eq('id', profile.tenant_id);
    if (error) toast.error(error.message);
    else {
      setTenant((t: any) => ({ ...(t || {}), settings: mergedSettings, name: finalName || t?.name, logo_url: branding.logoUrl || null }));
      setCompanyName(finalName);
      window.dispatchEvent(new CustomEvent('tenant-branding-updated'));
      toast.success('Identidade visual atualizada.');
      applyTenantBrandingVars({
        id: profile.tenant_id, name: finalName, slug: tenant?.slug, logo_url: branding.logoUrl,
        primary_color: hasCustomColors ? branding.primaryColor : null,
        accent_color: hasCustomColors ? branding.accentColor : null,
        sidebar_bg: hasCustomColors ? branding.sidebarBg : null,
        sidebar_fg: hasCustomColors ? branding.sidebarFg : null,
        font_family: branding.fontFamily, login_banner_url: branding.loginBannerUrl,
        welcome_text: branding.welcomeText, tagline: branding.tagline,
      });
    }
    setSaving(false);
  };

  /** Remove as cores do tenant e limpa as custom properties do :root. */
  const resetTheme = async () => {
    if (!profile?.tenant_id) return;
    if (!confirm('Restaurar o tema padrão do Helpoint? As cores personalizadas serão removidas. A logo e o nome da empresa são mantidos.')) return;
    setResetting(true);
    const currentBranding = { ...((tenant?.settings as any)?.branding || {}) };
    for (const k of COLOR_KEYS) delete currentBranding[k];
    delete currentBranding.fontFamily;
    const mergedSettings = { ...(tenant?.settings || {}), branding: currentBranding };
    const { error } = await supabase.from('tenants').update({ settings: mergedSettings }).eq('id', profile.tenant_id);
    setResetting(false);
    if (error) { toast.error(error.message); return; }
    setTenant((t: any) => ({ ...(t || {}), settings: mergedSettings }));
    setHasCustomColors(false);
    setBranding(b => ({
      ...b,
      primaryColor: DEFAULTS.primaryColor,
      accentColor: DEFAULTS.accentColor,
      sidebarBg: DEFAULTS.sidebarBg,
      sidebarFg: DEFAULTS.sidebarFg,
      fontFamily: DEFAULTS.fontFamily,
    }));
    // Remove os inline styles do :root — volta a valer puramente o index.css.
    applyTenantBrandingVars(null);
    window.dispatchEvent(new CustomEvent('tenant-branding-updated'));
    toast.success('Tema padrão restaurado.');
  };


  const tenantLoginUrl = tenant?.slug ? `${window.location.origin}/t/${tenant.slug}/login` : '';
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Link copiado'); };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Palette}
        title="Identidade visual"
        description="Personalize logo, cores, tipografia e a tela de login da sua empresa."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: editor */}
        <div>
          <Tabs defaultValue="logos">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="logos"><ImageIcon className="w-4 h-4 mr-1.5" />Logos</TabsTrigger>
              <TabsTrigger value="cores"><Palette className="w-4 h-4 mr-1.5" />Cores</TabsTrigger>
              <TabsTrigger value="tipografia"><Type className="w-4 h-4 mr-1.5" />Tipografia</TabsTrigger>
              <TabsTrigger value="login"><MonitorSmartphone className="w-4 h-4 mr-1.5" />Login</TabsTrigger>
            </TabsList>

            <TabsContent value="logos" className="mt-4 space-y-4">
              <Card className="p-5 space-y-3">
                <Label className="font-semibold" htmlFor="company-name">Nome da empresa</Label>
                <p className="text-xs text-muted-foreground">Aparece ao lado da logo na sidebar e na tela de login.</p>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Nome da sua empresa"
                  aria-label="Nome da empresa"
                  className="h-9 max-w-md"
                />
                {companyName.trim().length < 2 && (
                  <p className="text-xs text-amber-800">Informe pelo menos 2 caracteres — caso contrário, o nome atual será mantido.</p>
                )}
              </Card>

              <Card className="p-5 space-y-4">
                <Label className="font-semibold">Logo principal</Label>
                <p className="text-xs text-muted-foreground">Aparece no topo da sidebar e na tela de login.</p>
                <div className="flex items-center gap-4">
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt="Logo" className="w-20 h-20 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-surface-2 border flex items-center justify-center text-muted-foreground text-xs">Sem logo</div>
                  )}
                  <div className="flex gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2">
                      <Upload className="w-4 h-4" />{uploading === 'logo' ? 'Enviando...' : 'Enviar logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={onFile('logo')} />
                    </label>
                    {branding.logoUrl && (
                      <Button variant="outline" size="sm" onClick={() => setBranding(b => ({ ...b, logoUrl: '' }))}>
                        <X className="w-4 h-4 mr-1" />Remover
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-5 space-y-4">
                <Label className="font-semibold">Ícone (logo compacta)</Label>
                <p className="text-xs text-muted-foreground">
                  Usado quando o menu lateral está recolhido. Ideal: imagem quadrada, ex. 128×128px.
                  Sem ícone, o sistema usa a logo principal recortada.
                </p>
                <div className="flex items-center gap-4">
                  {branding.iconUrl ? (
                    <img src={branding.iconUrl} alt="Ícone" className="w-14 h-14 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-surface-2 border flex items-center justify-center text-muted-foreground text-[10px] text-center px-1">Sem ícone</div>
                  )}
                  <div className="flex gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2">
                      <Upload className="w-4 h-4" />{uploading === 'icon' ? 'Enviando...' : 'Enviar ícone'}
                      <input type="file" accept="image/*" className="hidden" onChange={onFile('icon')} />
                    </label>
                    {branding.iconUrl && (
                      <Button variant="outline" size="sm" onClick={() => setBranding(b => ({ ...b, iconUrl: '' }))}>
                        <X className="w-4 h-4 mr-1" />Remover
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="cores" className="mt-4 space-y-4">
              {/* Card 1: tema + presets */}
              <Card className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="font-semibold">Tema</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      O padrão é o tema claro: fundo claro, sidebar branca e azul {DEFAULTS.primaryColor}.
                      Escolha um preset abaixo ou ajuste cor a cor no próximo bloco.
                    </p>
                    {!hasCustomColors && (
                      <p className="text-xs text-muted-foreground mt-1">Nenhuma cor personalizada ativa — o sistema usa o tema padrão.</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={resetTheme} disabled={resetting} className="shrink-0">
                    <RotateCcw className="w-4 h-4 mr-1.5" />{resetting ? 'Restaurando...' : 'Restaurar tema padrão'}
                  </Button>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Presets</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                    {PRESETS.map(p => {
                      const active =
                        branding.primaryColor === p.b.primaryColor &&
                        branding.accentColor === p.b.accentColor &&
                        branding.sidebarBg === p.b.sidebarBg &&
                        branding.sidebarFg === p.b.sidebarFg;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setColor(p.b)}
                          aria-pressed={active}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left text-[13px] transition-colors ${
                            active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:bg-surface-2'
                          }`}
                        >
                          <span className="flex -space-x-1.5 shrink-0" aria-hidden="true">
                            <span className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: p.b.primaryColor }} />
                            <span className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: p.b.sidebarBg }} />
                          </span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Card 2: cores personalizadas */}
              <Card className="p-5 space-y-5">
                <div>
                  <Label className="font-semibold">Cores personalizadas</Label>
                  <p className="text-xs text-muted-foreground mt-1">Ajuste cor a cor. Os avisos de contraste aparecem abaixo de cada par.</p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cores da marca</p>
                  <div className="grid grid-cols-2 gap-4">
                    <ColorField label="Cor primária (botões, links)" value={branding.primaryColor!} onChange={v => setColor({ primaryColor: v })} />
                    <ColorField label="Cor de destaque (acentos)" value={branding.accentColor!} onChange={v => setColor({ accentColor: v })} />
                  </div>
                  <ContrastNotice
                    label="Texto branco sobre a cor primária"
                    ratio={primaryContrast}
                    blocked={primaryBlocked}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sidebar</p>
                  <div className="grid grid-cols-2 gap-4">
                    <ColorField label="Sidebar — fundo" value={branding.sidebarBg!} onChange={v => setColor({ sidebarBg: v })} />
                    <ColorField label="Sidebar — texto" value={branding.sidebarFg!} onChange={v => setColor({ sidebarFg: v })} />
                  </div>
                  <ContrastNotice
                    label="Texto da sidebar sobre o fundo da sidebar"
                    ratio={sidebarContrast}
                    blocked={sidebarBlocked}
                  />
                </div>
              </Card>
            </TabsContent>


            <TabsContent value="tipografia" className="mt-4">
              <Card className="p-5 space-y-3">
                <Label className="font-semibold">Fonte do sistema</Label>
                <p className="text-xs text-muted-foreground">Aplicada em todo o painel e na tela de login.</p>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f}
                      onClick={() => setBranding(b => ({ ...b, fontFamily: f }))}
                      className={`text-left px-3 py-3 rounded-md border ${branding.fontFamily === f ? 'border-primary ring-1 ring-primary' : 'hover:bg-surface-2'}`}
                      style={{ fontFamily: f }}
                    >
                      <div className="text-[13px] font-semibold">{f}</div>
                      <div className="text-[11px] text-muted-foreground">Ag — A quick brown fox.</div>
                    </button>
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="login" className="mt-4 space-y-4">
              <Card className="p-5 space-y-3">
                <Label className="font-semibold">Banner lateral do login</Label>
                <div className="flex items-start gap-4">
                  {branding.loginBannerUrl ? (
                    <img src={branding.loginBannerUrl} alt="Banner" className="w-48 h-28 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-48 h-28 rounded-lg bg-surface-2 border flex items-center justify-center text-muted-foreground text-xs">Sem banner</div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2 self-start">
                      <Upload className="w-4 h-4" />{uploading === 'banner' ? 'Enviando...' : 'Enviar banner'}
                      <input type="file" accept="image/*" className="hidden" onChange={onFile('banner')} />
                    </label>
                    {branding.loginBannerUrl && (
                      <Button variant="outline" size="sm" onClick={() => setBranding(b => ({ ...b, loginBannerUrl: '' }))}>
                        <X className="w-4 h-4 mr-1" />Remover
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">Recomendado: 1600×900px.</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5 space-y-3">
                <Label className="font-semibold">Mensagem de boas-vindas</Label>
                <Textarea rows={2} value={branding.welcomeText || ''} onChange={e => setBranding(b => ({ ...b, welcomeText: e.target.value }))} placeholder={`Ex.: Bem-vindo(a) ao painel da ${tenant?.name || 'sua empresa'}`} />
                <Label className="font-semibold">Tagline (legenda da logo)</Label>
                <Input value={branding.tagline || ''} onChange={e => setBranding(b => ({ ...b, tagline: e.target.value }))} placeholder="Gestão integrada" />
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end mt-4">
            <Button onClick={save} disabled={saving || (hasCustomColors && (sidebarBlocked || primaryBlocked))} size="lg">{saving ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </div>

        {/* Coluna 2: previews */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-surface-2 px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">Tela de login</span>
              <span className="text-[11px] text-muted-foreground font-mono truncate">{tenant?.slug ? `/t/${tenant.slug}/login` : ''}</span>
            </div>
            <LoginPreview branding={branding} tenantName={companyName.trim() || tenant?.name || 'Sua empresa'} />
          </Card>
          <Card className="overflow-hidden">
            <div className="bg-surface-2 px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">Painel interno</span>
              <span className="text-[11px] text-muted-foreground">Sidebar, KPIs e botões</span>
            </div>
            <PanelPreview branding={branding} tenantName={companyName.trim() || tenant?.name || 'Sua empresa'} />
          </Card>
        </div>
      </div>

      <Card className="p-5 space-y-4 border-primary/20 bg-primary/5">
        <h2 className="font-semibold flex items-center gap-2"><Globe className="w-5 h-5" />Acesso da sua empresa</h2>
        <div>
          <Label className="text-xs">Link de login com a sua identidade visual:</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={tenantLoginUrl} className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => copy(tenantLoginUrl)}><Copy className="w-4 h-4" /></Button>
            <a href={tenantLoginUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4" /></Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Após o login, o painel abre em <code>/t/{tenant?.slug}/inicio</code> e todas as páginas internas mantêm esse prefixo.
          </p>
        </div>
        <CustomDomainManager tenantSlug={tenant?.slug} />
      </Card>
    </div>
  );
}

function ContrastNotice({ label, ratio, blocked }: { label: string; ratio: number | null; blocked: boolean }) {
  if (ratio === null) return null;
  const value = ratio.toFixed(1).replace('.', ',');
  if (blocked) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span><strong>{label}:</strong> contraste {value}:1 — praticamente invisível. Ajuste as cores para poder salvar.</span>
      </div>
    );
  }
  if (ratio < 4.5) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span><strong>{label}:</strong> essa combinação pode ficar ilegível — contraste {value}:1, abaixo do recomendado (4,5:1).</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span><strong>{label}:</strong> contraste {value}:1 — legível.</span>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-stretch gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={`Seletor de cor — ${label}`}
          className="w-10 h-9 shrink-0 rounded-md border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={`Código hexadecimal — ${label}`}
          className="font-mono text-xs h-9"
        />
      </div>
    </div>
  );
}

function LoginPreview({ branding, tenantName }: { branding: Branding; tenantName: string }) {
  return (
    <div className="h-[260px] flex" style={{ fontFamily: branding.fontFamily }}>
      <div
        className="w-1/2 relative p-5 flex flex-col justify-between text-white overflow-hidden"
        style={{ background: branding.primaryColor }}
      >
        {branding.loginBannerUrl && (
          <img src={branding.loginBannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="relative z-10 flex items-center gap-2">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="w-8 h-8 rounded-md object-cover bg-white/20" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center font-bold text-sm">
              {tenantName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-bold text-sm">{tenantName}</span>
        </div>
        <div className="relative z-10">
          <div className="text-base font-bold leading-tight">{branding.welcomeText || `Bem-vindo(a) à ${tenantName}`}</div>
        </div>
      </div>
      <div className="w-1/2 flex items-center justify-center bg-white p-5">
        <div className="w-full">
          <div className="text-sm font-bold mb-3">Entrar</div>
          <div className="h-7 rounded border bg-surface-2 mb-2" />
          <div className="h-7 rounded border bg-surface-2 mb-3" />
          <div className="h-8 rounded text-white text-xs font-semibold flex items-center justify-center" style={{ background: branding.primaryColor }}>
            Acessar
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelPreview({ branding, tenantName }: { branding: Branding; tenantName: string }) {
  const subtle = withAlpha(branding.sidebarFg || '#33333A', 0.12);
  return (
    <div className="h-[260px] flex" style={{ fontFamily: branding.fontFamily }}>
      <div className="w-[160px] flex flex-col py-3" style={{ background: branding.sidebarBg, color: branding.sidebarFg }}>
        <div className="px-3 pb-3 flex items-center gap-2 border-b" style={{ borderColor: subtle }}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="w-7 h-7 rounded-md object-cover bg-white/10" />
          ) : (
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold" style={{ background: branding.accentColor, color: '#fff' }}>
              {tenantName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-[12px] font-bold truncate">{tenantName}</span>
        </div>
        <div className="px-2 pt-3 space-y-1.5 text-[11px]">
          {['Início', 'TI', 'Marketing', 'Qualidade', 'RH'].map((l, i) => (
            <div
              key={l}
              className="px-2 py-1.5 rounded"
              style={i === 0
                ? { background: subtle, color: branding.sidebarFg, fontWeight: 600 }
                : { color: branding.sidebarFg, opacity: 0.7 }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-background p-3 flex flex-col gap-2">
        <div className="h-8 bg-white border rounded flex items-center px-3 text-[11px] text-muted-foreground">Home · Início</div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border rounded p-2">
              <div className="text-[9px] text-muted-foreground">KPI {i}</div>
              <div className="text-base font-bold" style={{ color: branding.primaryColor }}>123</div>
            </div>
          ))}
        </div>
        <div className="h-9 rounded text-white text-xs font-semibold flex items-center justify-center self-start px-4" style={{ background: branding.primaryColor }}>
          Botão primário
        </div>
      </div>
    </div>
  );
}

function CustomDomainManager({ tenantSlug }: { tenantSlug?: string }) {
  const { profile } = useAuth();
  const [domains, setDomains] = useState<any[]>([]);
  const [hostname, setHostname] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = async () => {
    if (!profile?.tenant_id) return;
    const { data } = await supabase.from('tenant_domains').select('*').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false });
    setDomains(data || []);
  };
  useEffect(() => { load(); }, [profile?.tenant_id]);

  const addDomain = async () => {
    if (!profile?.tenant_id) return;
    const h = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) { toast.error('Informe um domínio válido (ex: suporte.empresa.com.br).'); return; }
    setLoading(true);
    const { error } = await supabase.from('tenant_domains').insert({ tenant_id: profile.tenant_id, hostname: h });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setHostname(''); toast.success('Domínio adicionado. Configure o DNS e clique em Verificar.'); load();
  };
  const removeDomain = async (id: string) => {
    if (!confirm('Remover este domínio?')) return;
    const { error } = await supabase.from('tenant_domains').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Domínio removido.'); load(); }
  };
  const verify = async (id: string) => {
    setVerifyingId(id);
    const { data, error } = await supabase.functions.invoke('verify-tenant-domain', { body: { domainId: id } });
    setVerifyingId(null);
    if (error) { toast.error(error.message); return; }
    if (data?.verified) toast.success('Domínio verificado'); else toast.error('Ainda não verificado. ' + (data?.errors?.join(' ') || ''));
    load();
  };
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado'); };

  return (
    <div className="border-t pt-4 space-y-4">
      <div>
        <h3 className="font-medium flex items-center gap-2"><Globe className="w-4 h-4" />Domínio próprio</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Acesse o painel por um endereço da sua empresa, ex.: <code>suporte.empresa.com.br</code>. O endereço padrão <code>helpoint.com.br/t/{tenantSlug}</code> continua funcionando.
        </p>
      </div>
      <div className="flex gap-2">
        <Input placeholder="suporte.suaempresa.com.br" value={hostname} onChange={e => setHostname(e.target.value)} />
        <Button onClick={addDomain} disabled={loading || !hostname}>{loading ? 'Adicionando...' : 'Adicionar domínio'}</Button>
      </div>
      {domains.length === 0 && (<p className="text-xs text-muted-foreground italic">Nenhum domínio próprio cadastrado.</p>)}
      {domains.map(d => (
        <div key={d.id} className="rounded-lg border p-3 space-y-3 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">{d.hostname}</div>
              <div className="text-xs mt-0.5">
                {d.verified_at ? (
                  <span className="text-green-600">Verificado em {new Date(d.verified_at).toLocaleString('pt-BR')}</span>
                ) : (<span className="text-amber-600">Aguardando verificação DNS</span>)}
              </div>
              {d.last_error && !d.verified_at && (<div className="text-xs text-red-600 mt-1">{d.last_error}</div>)}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => verify(d.id)} disabled={verifyingId === d.id}>{verifyingId === d.id ? 'Verificando...' : 'Verificar DNS'}</Button>
              <Button size="sm" variant="ghost" onClick={() => removeDomain(d.id)}><X className="w-4 h-4" /></Button>
            </div>
          </div>
          {!d.verified_at && (
            <details className="text-xs" open>
              <summary className="cursor-pointer font-medium">Como configurar o DNS</summary>
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>No seu provedor de DNS, crie estes 2 registros:</p>
                <div className="bg-surface-2 p-2 rounded border">
                  <div className="font-medium text-foreground mb-1">1) Registro CNAME</div>
                  <div className="grid grid-cols-[80px_1fr_auto] gap-1 items-center font-mono">
                    <span>Tipo:</span><span>CNAME</span><span></span>
                    <span>Nome:</span><span>{d.hostname.split('.')[0]}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => copy(d.hostname.split('.')[0])}><Copy className="w-3 h-3" /></Button>
                    <span>Valor:</span><span>helpoint.com.br</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => copy('helpoint.com.br')}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="bg-surface-2 p-2 rounded border">
                  <div className="font-medium text-foreground mb-1">2) Registro TXT (verificação)</div>
                  <div className="grid grid-cols-[80px_1fr_auto] gap-1 items-center font-mono">
                    <span>Tipo:</span><span>TXT</span><span></span>
                    <span>Nome:</span><span>_helpoint-verify.{d.hostname.split('.')[0]}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => copy(`_helpoint-verify.${d.hostname.split('.')[0]}`)}><Copy className="w-3 h-3" /></Button>
                    <span>Valor:</span><span className="break-all">{d.verification_token}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => copy(d.verification_token)}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <p>Após salvar, clique em <strong>Verificar DNS</strong>. A propagação pode levar até 1 hora.</p>
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
