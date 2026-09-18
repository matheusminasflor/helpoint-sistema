import { Navigate, useLocation } from 'react-router-dom';

/**
 * Endereço antigo, de quando o sistema era multi-empresa (antes da ADR-010).
 * `/t/<qualquer-coisa>/resto` continua funcionando: tira o prefixo e segue
 * para `/resto` (ou `/inicio`, se não sobrar nada).
 */
export function TenantSlugRedirect() {
  const location = useLocation();
  const resto = location.pathname.replace(/^\/t\/[^/]+/, '');
  const destino = resto && resto !== '/' ? resto : '/inicio';
  return <Navigate to={destino + location.search + location.hash} replace />;
}
