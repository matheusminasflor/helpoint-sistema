// `/comercial/insights?visao=…` — o endereço do antigo balde "Insights". Desde 2026-10-14 (dono: o Comercial "é o
// mais bagunçado"; cada análise virou item do menu, no grupo de quem usa) cada visão tem rota própria; aqui só se
// redireciona, levando o resto da query (`?cliente=` da ficha), para os links salvos continuarem chegando.
import { Navigate, useSearchParams } from 'react-router-dom';
import { resolverVisao, rotaDaVisao } from '@/config/comercial-insights';
import { useTenantPath } from '@/hooks/useTenantPath';

export default function ComercialInsights() {
  const [params] = useSearchParams();
  const tenantPath = useTenantPath();
  const resto = new URLSearchParams(params);
  resto.delete('visao');
  const query = resto.toString();
  return <Navigate to={tenantPath(`${rotaDaVisao(resolverVisao(params.get('visao')))}${query ? `?${query}` : ''}`)} replace />;
}
