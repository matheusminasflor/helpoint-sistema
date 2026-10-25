import { Link } from 'react-router-dom';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import { rotaDaVisao } from '@/config/comercial-insights';

/**
 * Ranking e curva ABC moram num lugar (etapa 4 · Diretoria, 2026-10-25): Comercial › Vendas, o completo (série, filial,
 * critério). A Diretoria leva até lá. Só para quem abre Vendas — quem tem só a Diretoria continua com o resumo daqui,
 * que nada perde (nenhuma opção nova tira acesso).
 */
export function OndeMoraORanking() {
  const perfil = useConfiguracaoDosSetores();
  const tenantPath = useTenantPath();
  if (perfil.isLoading || perfil.isError || !perfil.pode('comercial', 'vendas', 'view')) return null;
  return (
    <p className="text-[13px] text-muted-foreground">
      O ranking completo de clientes e a curva ABC dos produtos, com série e filial, ficam em{' '}
      <Link to={tenantPath(rotaDaVisao('vendas'))} className="text-primary underline">Comercial › Vendas</Link>.
    </p>
  );
}
