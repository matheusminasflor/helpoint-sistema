import { Navigate } from 'react-router-dom';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Só dono ou administrador passa.
 *
 * É a mesma condição que esconde o grupo "Configurações" no sidebar
 * (`showSettings`). Esconder o item nunca foi fronteira: a URL continuava
 * aberta, e um `member` que digitasse `/configuracoes/sistema` via a tela de
 * gestão de usuários. `StaffRoute` checa login e tenant, não cargo — este
 * componente fecha o que faltava.
 *
 * Redireciona para a home em vez de mostrar "acesso negado": o único caminho
 * até aqui sem permissão é URL digitada ou a busca global, e a home é onde
 * essa pessoa deveria estar.
 */
export function RequireOwnerOrAdmin({ children }: { children: React.ReactNode }) {
  const { showSettings } = useVisibleModules();
  const tenantPath = useTenantPath();

  if (!showSettings) return <Navigate to={tenantPath('/inicio')} replace />;
  return <>{children}</>;
}
