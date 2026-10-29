import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ChevronDown, LogOut, UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TEMAS } from '@/lib/tema';
import { cn } from '@/lib/utils';
import { getRoleLabel } from '@/types/database';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { supabase } from '@/integrations/supabase/client';
import { InstalarAplicativo } from './InstalarAplicativo';

/**
 * A pessoa no canto do topo, como na DashStack (dono, 2026-10-28): foto, nome, papel e a seta. Antes ficava no pé do menu
 * lateral. Abre o mesmo menu de antes: Meu perfil, instalar o aplicativo e Sair. No celular só a foto.
 */
export function ContaNoTopo() {
  const { profile, role, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.avatar_url) { setFoto(null); return; }
    (async () => {
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url!, 3600);
      if (error) { console.error(error); if (!cancelled) setFoto(null); return; }
      if (!cancelled) setFoto(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  if (!profile) return null;

  const partes = (profile.full_name || '').trim().split(/\s+/).filter(Boolean);
  const nome = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0] || profile.email || '';
  const iniciais = partes.map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Menu da conta de ${nome}`} title={nome}
            className="flex items-center gap-3 rounded-md py-1 pl-1 pr-1 sm:pr-2 hover:bg-muted transition-colors text-left">
            <Avatar className="w-10 h-10 sm:w-11 sm:h-11 shrink-0">
              {foto && <AvatarImage src={foto} alt="" />}
              <AvatarFallback className="text-[14px] font-extrabold bg-primary/20 text-primary">{iniciais}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:block min-w-0">
              <span className="block text-[14px] font-bold leading-tight truncate max-w-[160px]">{nome}</span>
              <span className="block text-[12px] font-semibold text-muted-foreground leading-tight truncate max-w-[160px]">
                {role && getRoleLabel(role)}
                {profile.department && ` · ${profile.department}`}
              </span>
            </span>
            <span className="hidden sm:flex w-[18px] h-[18px] rounded-full border border-muted-foreground/60 items-center justify-center ml-2 shrink-0">
              <ChevronDown className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-60 p-1.5">
          <button type="button" onClick={() => { setAberto(false); setProfileOpen(true); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-md text-[14px] font-semibold hover:bg-muted transition-colors text-left">
            <UserCog className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>Meu perfil</span>
          </button>
          <InstalarAplicativo aoClicar={() => setAberto(false)} />
          {/* No celular o claro/escuro sai do topo e mora aqui (dono, 2026-10-28). */}
          <div className="min-[861px]:hidden px-2.5 py-2">
            <p className="text-[12px] font-bold text-muted-foreground mb-1.5">Aparência</p>
            <div className="flex h-9 rounded-md border border-input overflow-hidden" role="group" aria-label="Aparência">
              {TEMAS.map((t) => (
                <button key={t.valor} type="button" onClick={() => setTheme(t.valor)} aria-pressed={theme === t.valor}
                  className={cn('flex-1 text-[13px] border-r border-input last:border-r-0',
                    theme === t.valor ? 'bg-primary text-primary-foreground font-bold' : 'font-semibold hover:bg-muted')}>
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => { setAberto(false); signOut(); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-md text-[14px] font-semibold text-destructive hover:bg-destructive/10 transition-colors text-left">
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sair</span>
          </button>
        </PopoverContent>
      </Popover>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
