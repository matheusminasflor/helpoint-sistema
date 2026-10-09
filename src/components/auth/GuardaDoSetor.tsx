import { Navigate, useLocation } from 'react-router-dom';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { moduloDoEndereco } from '@/lib/modulo-do-endereco';
import { abreATela, telaDoPerfil } from '@/config/telas-do-perfil';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * A tranca de TODOS os setores, num lugar só (revisão do sistema, 2026-10-01).
 *
 * `StaffRoute` só confere login, staff e empresa — nunca o módulo. Esconder o item do menu não é
 * fronteira: qualquer pessoa logada abria `/financeiro/contas-a-pagar`, `/ti/licencas`, `/compras`…
 * digitando o endereço, e só o RLS limitava o que aparecia (e onde o RLS é por módulo, a tela vinha
 * zerada e parecia "não vendeu nada"). Só Comercial, Diretoria e Configurações tinham guarda própria.
 *
 * A régua é a de `RequireComercial`: o módulo concedido OU gestor para cima — nunca mais estreita do
 * que o banco abre (`has_*_access` deixa o gestor). Dono/admin passam (`useVisibleModules`).
 *
 * E A CAIXINHA DO PERFIL (2026-10-02, decisão do dono): a tela que tem seção no perfil
 * (`TELAS_DO_PERFIL`) só abre com "Ver" marcado — o mesmo critério do menu e do banco
 * (`tem_permissao`: dono e administrador passam; gestor, não por ser gestor).
 *
 * O DETALHE DO CHAMADO fica de fora (`/<setor>/chamados/<id>`): quem ABRIU um chamado para o RH abre
 * o próprio chamado por esse endereço sem ter o módulo RH. Quem decide ali é o RLS do chamado.
 */
export function GuardaDoSetor({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const modulos = useVisibleModules();
  const perfil = useConfiguracaoDosSetores();
  const tenantPath = useTenantPath();
  const modulo = moduloDoEndereco(pathname);
  const tela = telaDoPerfil(pathname.replace(/^\/t\/[^/]+/, ''));

  // Falha de leitura não é "não pode", e enquanto carrega ninguém é mandado embora (como as outras guardas).
  if (!modulo || modulos.isLoading || modulos.isError) return <>{children}</>;
  if (!modulos[modulo] && !modulos.isManagerOrHigher) return <Navigate to={tenantPath('/inicio')} replace />;
  if (tela && !perfil.isLoading && !perfil.isError
      && !abreATela(tela, perfil.pode)) {
    return <Navigate to={tenantPath('/inicio')} replace />;
  }
  return <>{children}</>;
}
