// As abas dos Relatórios do Comercial (revisão aprovada em 2026-11-12, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV):
// os relatórios saem do menu lateral (eram 8 itens) e viram abas, no alto de cada um. Lei de Hick: um item no menu, a
// escolha no lugar onde se lê. Cada aba só aparece para quem abre a tela dela (useAbasDosRelatorios).
import { NavLink, useLocation } from 'react-router-dom';
import { useAbasDosRelatorios } from '@/hooks/useAbasDosRelatorios';
import { useTenantPath } from '@/hooks/useTenantPath';
import { cn } from '@/lib/utils';

export function AbasDosRelatorios() {
  const abas = useAbasDosRelatorios();
  const tenantPath = useTenantPath();
  // O mesmo relatório abre também na Diretoria: lá as abas do Comercial não fazem sentido.
  const { pathname } = useLocation();
  if (abas.length < 2 || !pathname.includes('/comercial/')) return null;
  return (
    <nav aria-label="Relatórios do Comercial" className="px-4 lg:px-8 pt-1 pb-3 print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {abas.map((a) => (
          <NavLink key={a.to} to={tenantPath(a.to)}
            className={({ isActive }) => cn('rounded-full border px-3 py-1 text-[13px] font-semibold',
              isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
            {a.rotulo}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
