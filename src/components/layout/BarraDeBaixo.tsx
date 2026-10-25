import { NavLink } from 'react-router-dom';
import { Home, Inbox, Menu, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * A barra de baixo do celular e do tablet em pé (proposta "Helpoint no dia a dia", etapa 2b, 2026-10-24): cinco
 * destinos com ícone e nome, o do meio é a ação principal (abrir uma solicitação). Alvos de 44 px, e nada sob a barra
 * de gestos do iPhone (`env(safe-area-inset-bottom)`). Acima de 860 px o menu lateral continua sendo o caminho.
 */
export function BarraDeBaixo({ abrirMenu }: { abrirMenu: () => void }) {
  const tp = useTenantPath();
  const item = 'flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-medium';
  const cor = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-foreground' : 'text-muted-foreground');
  return (
    <nav
      aria-label="Navegação principal"
      className="min-[861px]:hidden fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavLink to={tp('/inicio')} className={cor}><Home className="w-5 h-5" aria-hidden="true" />Início</NavLink>
      <NavLink to={tp('/helpdesk')} className={cor}><Inbox className="w-5 h-5" aria-hidden="true" />Chamados</NavLink>
      <NavLink to={tp('/nova-solicitacao')} className={cn(item, 'text-foreground')}>
        <span className="w-11 h-11 -mt-3 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Plus className="w-5 h-5" aria-hidden="true" />
        </span>
        Pedir
      </NavLink>
      <NavLink to={tp('/chat')} className={cor}><MessageSquare className="w-5 h-5" aria-hidden="true" />Chat</NavLink>
      <button type="button" onClick={abrirMenu} className={cn(item, 'text-muted-foreground')}>
        <Menu className="w-5 h-5" aria-hidden="true" />Menu
      </button>
    </nav>
  );
}
