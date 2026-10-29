import { NavLink } from 'react-router-dom';
import { Home, ListChecks, Menu, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNaoLidas } from '@/hooks/useChat';

/**
 * A barra de baixo do celular e do tablet em pé. Rodada 3 (decisão 2, aprovada em 2026-10-26): Início · Meus · Novo ·
 * Chat · Menu — "Meus" são os meus pedidos e chamados num lugar só. Em 2026-10-28 o Chat voltou para a barra no lugar
 * dos Avisos (Jakob: é o dia a dia, e os avisos já aparecem no Início), com o número de não lidas. O "Novo" fica no meio,
 * no alcance do polegar (Fitts), no quadrado azul da DashStack. Alvos de 56 px, e nada sob a barra de gestos do iPhone.
 * Acima de 860 px o menu lateral continua sendo o caminho.
 */
export function BarraDeBaixo({ abrirMenu }: { abrirMenu: () => void }) {
  const tp = useTenantPath();
  const { data: naoLidas = [] } = useNaoLidas();
  const total = naoLidas.reduce((soma, n) => soma + n.qtd, 0);
  const item = 'flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-bold';
  const cor = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-primary' : 'text-muted-foreground');
  return (
    <nav
      aria-label="Navegação principal"
      className="min-[861px]:hidden fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavLink to={tp('/inicio')} className={cor}><Home className="w-5 h-5" aria-hidden="true" />Início</NavLink>
      <NavLink to={tp('/meus')} className={cor}><ListChecks className="w-5 h-5" aria-hidden="true" />Meus</NavLink>
      <NavLink to={tp('/nova-solicitacao')} className={cn(item, 'text-foreground')}>
        <span className="w-12 h-12 -mt-4 rounded-[12px] bg-primary text-primary-foreground flex items-center justify-center shadow-elevated">
          <Plus className="w-6 h-6" aria-hidden="true" />
        </span>
        Novo
      </NavLink>
      <NavLink to={tp('/chat')} className={cor}>
        <span className="relative">
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
          {total > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-aviso text-primary-foreground text-[11px] font-bold flex items-center justify-center"
              aria-label={`${total} mensagens não lidas`}>{total > 99 ? '99+' : total}</span>
          )}
        </span>
        Chat
      </NavLink>
      <button type="button" onClick={abrirMenu} className={cn(item, 'text-muted-foreground')}>
        <Menu className="w-5 h-5" aria-hidden="true" />Menu
      </button>
    </nav>
  );
}
