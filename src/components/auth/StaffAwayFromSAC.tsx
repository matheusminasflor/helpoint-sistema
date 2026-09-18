import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Se um usuário staff (com profile + tenant_id e SEM customer_profile)
 * abrir qualquer rota pública do SAC, mandamos para o painel interno.
 * SAC é exclusivo para clientes finais.
 */
export function StaffAwayFromSAC() {
  const { user, profile, isCustomer, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user && !isCustomer && profile?.tenant_id) return <Navigate to="/inicio" replace />;

  return <Outlet />;
}
