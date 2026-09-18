import { Navigate } from 'react-router-dom';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Só quem tem a Diretoria — e é gestor — passa.
 *
 * Esconder o item do menu nunca foi fronteira: a URL continua aberta, e foi
 * assim que um `member` chegava à tela de gestão de usuários antes da
 * `RequireOwnerOrAdmin`. Aqui o problema é pior do que ver o que não devia:
 * **a RLS de `tickets` mostra a cada papel um conjunto diferente**, e quem tem
 * `viewer` enxerga só os próprios chamados. A tela somaria esses poucos e os
 * rotularia "chamados por setor" da empresa inteira — número errado, sem erro
 * nenhum na tela, num painel chamado Diretoria.
 *
 * Por isso a condição é a concessão **mais** o cargo de gestor, e não só a
 * concessão: é o único painel do sistema que apresenta o todo, e apresentar o
 * todo a quem só enxerga uma parte é mentir com a cara séria.
 */
export function RequireDiretoria({ children }: { children: React.ReactNode }) {
  const { showDiretoria, isManagerOrHigher, isLoading } = useVisibleModules();
  const tenantPath = useTenantPath();

  // Enquanto a concessão não chegou, ninguém é redirecionado: sem isto, quem
  // tem acesso seria jogado para a home no primeiro quadro e voltaria sozinho.
  if (isLoading) return null;
  if (!showDiretoria || !isManagerOrHigher) return <Navigate to={tenantPath('/inicio')} replace />;
  return <>{children}</>;
}
