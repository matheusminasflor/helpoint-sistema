import { Navigate } from 'react-router-dom';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Tranca de Configurações › Cadastro de clientes (2026-10-01): dono/admin ou quem tem
 * `comercial.clientes.cadastrar` — a mesma conta do INSERT de `com_clientes` no banco. O menu já
 * esconde o item; isto impede a URL de abrir mesmo assim. Não redireciona enquanto o perfil carrega.
 */
export function RequireCadastrarClientes({ children }: { children: React.ReactNode }) {
  const { canComoOBanco, isLoading } = useDepartmentPermissions('comercial');
  const tenantPath = useTenantPath();
  if (isLoading) return null;
  if (!canComoOBanco('clientes', 'cadastrar')) return <Navigate to={tenantPath('/inicio')} replace />;
  return <>{children}</>;
}
