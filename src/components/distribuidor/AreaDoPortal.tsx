// A moldura do Portal do Distribuidor (etapa 6) para quem já está liberado e aceitou os termos: o cabeçalho, a barra
// de baixo com os cinco destinos (proposta: "o do meio é a ação principal do perfil" — aqui, Vender) e a guarda das
// telas internas, que manda para a porta de entrada (/distribuidor) quem ainda não pode entrar.
import { PortalContext } from '@/hooks/useNoPortal';
import { Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, Loader2, LogOut, MessageSquare, Package, Plus, ShoppingCart, Store, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSituacaoDoDistribuidor, type NoPortal } from '@/hooks/useDistribuidor';
import { cn } from '@/lib/utils';

const DESTINOS = [
  { to: '/distribuidor', rotulo: 'Meu dia', icone: Home, fim: true },
  { to: '/distribuidor/saloes', rotulo: 'Salões', icone: Store },
  { to: '/distribuidor/vender', rotulo: 'Vender', icone: Plus, principal: true },
  { to: '/distribuidor/agenda', rotulo: 'Agenda', icone: CalendarDays },
  { to: '/distribuidor/estoque', rotulo: 'Estoque', icone: Package },
];

export function AreaDoPortal({ s, children }: { s: NoPortal; children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const sair = async () => { await signOut(); navigate('/distribuidor'); };
  return (
    <PortalContext.Provider value={s}>
      <div className="min-h-screen bg-surface-1 pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0">
        <header className="sticky top-0 z-20 border-b border-border bg-card">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-2">
            <span className="font-semibold text-[16px] flex-1 truncate">{s.distribuidor.razao_social}</span>
            <nav className="hidden sm:flex items-center gap-1" aria-label="Portal">
              {DESTINOS.map((d) => (
                <NavLink key={d.to} to={d.to} end={d.fim}
                  className={({ isActive }) => cn('px-3 h-10 inline-flex items-center rounded-md text-[14px]',
                    isActive ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}>
                  {d.rotulo}
                </NavLink>
              ))}
            </nav>
            <Button asChild variant="ghost" size="icon" className="h-11 w-11" aria-label="Pedir à Minasflor" title="Pedir à Minasflor">
              <Link to="/distribuidor/pedidos"><ShoppingCart className="w-5 h-5" aria-hidden="true" /></Link>
            </Button>
            {s.papel === 'dono' && (
              <Button asChild variant="ghost" size="icon" className="h-11 w-11" aria-label="Minha equipe" title="Minha equipe">
                <Link to="/distribuidor/equipe"><Users className="w-5 h-5" aria-hidden="true" /></Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="icon" className="h-11 w-11" aria-label="Falar com a Minasflor" title="Falar com a Minasflor">
              <Link to="/sac/meus-chamados"><MessageSquare className="w-5 h-5" aria-hidden="true" /></Link>
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Sair" title="Sair" onClick={sair}>
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">{children}</main>
        <nav aria-label="Portal" className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5">
            {DESTINOS.map((d) => (
              <li key={d.to}>
                <NavLink to={d.to} end={d.fim}
                  className={({ isActive }) => cn('h-16 flex flex-col items-center justify-center gap-0.5 text-[12px]',
                    isActive ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  <span className={cn('inline-flex items-center justify-center', d.principal && 'w-9 h-9 rounded-full bg-primary text-primary-foreground')}>
                    <d.icone className="w-5 h-5" aria-hidden="true" />
                  </span>
                  {d.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </PortalContext.Provider>
  );
}

/** As telas internas do portal: só com o distribuidor liberado e os termos aceitos; senão, a porta de entrada. */
export function GuardaDoPortal({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const situacao = useSituacaoDoDistribuidor();
  if (isLoading || (user && situacao.isLoading)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando" /></div>;
  }
  const s = situacao.data;
  if (!user || !s || !('termos_ok' in s) || s.situacao !== 'liberado' || !s.termos_ok) return <Navigate to="/distribuidor" replace />;
  return <AreaDoPortal s={s}>{children}</AreaDoPortal>;
}
