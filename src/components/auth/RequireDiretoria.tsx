import { Navigate } from 'react-router-dom';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarDiretoria } from '@/lib/acesso-diretoria';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Quem tem a Diretoria concedida OU é gestor para cima passa — a mesma
 * dupla porta de `has_diretoria_access` (banco, migration 20261017010000),
 * de propósito: as três funções que a L6d promoveu a `security definer`
 * (`com_metas_x_realizado`, `com_conciliacao`, `com_pessoas_do_comercial`)
 * abrem para quem `has_diretoria_access` aceita, e nenhum guarda de tela
 * pode ser mais estreito do que a porta que o banco já abriu — senão o
 * diretor que só tem o módulo Diretoria (sem ser gestor do sistema) nunca
 * chega à tela que essas funções existem para servir. Achado da correção da
 * auditoria (item 3): a versão anterior exigia as duas coisas (`&&`), e
 * ninguém do caminho que a L6d abriu no banco chegava aqui.
 *
 * `podeAcessarDiretoria` (em `@/lib/acesso-diretoria`, módulo sem dependência
 * nenhuma) faz a conta; este componente só decide o redirecionamento. A regra
 * mora lá, e não aqui nem em `useVisibleModules.ts`, para o teste importá-la
 * sem arrastar o cliente do Supabase — ver o comentário do arquivo.
 *
 * Esconder o item do menu nunca foi fronteira: a URL continua aberta, e foi
 * assim que um `member` chegava à tela de gestão de usuários antes da
 * `RequireOwnerOrAdmin`. Aqui o problema é pior do que ver o que não devia:
 * **a RLS de `tickets` mostra a cada papel um conjunto diferente**, e quem tem
 * `viewer` enxerga só os próprios chamados. A tela somaria esses poucos e os
 * rotularia "chamados por setor" da empresa inteira — número errado, sem erro
 * nenhum na tela, num painel chamado Diretoria. Por isso a condição segue
 * exigente para quem NÃO tem a Diretoria concedida: só o cargo de gestor
 * substitui a concessão, nunca um papel menor.
 */
export function RequireDiretoria({ children }: { children: React.ReactNode }) {
  const { showDiretoria, isManagerOrHigher, isLoading } = useVisibleModules();
  const tenantPath = useTenantPath();

  // Enquanto a concessão não chegou, ninguém é redirecionado: sem isto, quem
  // tem acesso seria jogado para a home no primeiro quadro e voltaria sozinho.
  if (isLoading) return null;
  if (!podeAcessarDiretoria(showDiretoria, isManagerOrHigher)) return <Navigate to={tenantPath('/inicio')} replace />;
  return <>{children}</>;
}
