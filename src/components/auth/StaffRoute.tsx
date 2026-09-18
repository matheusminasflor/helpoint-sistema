import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

/**
 * Protege rotas administrativas: clientes do SAC nunca conseguem acessar o
 * painel interno. Desde a ADR-010 não há mais slug na URL para conferir
 * contra o tenant do usuário — isso tirou uma das consultas repetidas à
 * mesma linha de `tenants` (docs/nao-funciona.md), a que remontava a cada
 * navegação.
 */
export function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isCustomer, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isCustomer) return <Navigate to="/sac/meus-chamados" replace />;
  if (!profile?.tenant_id) return <Navigate to="/conta-sem-empresa" replace />;

  return <AppLayout>{children}</AppLayout>;
}
