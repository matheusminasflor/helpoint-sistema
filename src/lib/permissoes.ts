// A conta única que decide se uma ação de perfil de acesso passa — pensada
// para módulos cujas policies de RLS leem `access_profiles` (hoje só o
// Comercial, L6a). Ver `.scratch/plano-painel-comercial-correcoes.md`, item
// 2b: achado da auditoria.
import { resolvePermission, type PermissionsMap } from '@/config/access-profile-schemas';

/**
 * A MESMA conta que o banco faz nas policies deste módulo: `is_admin_or_higher(...)
 * or tem_permissao(...)`. Existe porque o Comercial é o primeiro módulo cujas
 * policies leem perfil de acesso — aqui, tela e banco discordarem significa
 * botão que aparece e escrita que o Postgres recusa com 42501.
 *
 * `manager` NÃO passa direto: `is_admin_or_higher` no banco (`user_roles.role
 * in ('owner','admin')`) é só owner e admin — diferente de
 * `useDepartmentPermissions.isAdmin`, que também deixa `manager` passar
 * (correto para os módulos que só usam `can` como cosmético; errado aqui,
 * onde a RLS de verdade recusa o gestor).
 */
export function podeComoOBanco(
  papel: string | null | undefined,
  permissoesDoPerfil: PermissionsMap | null | undefined,
  overridesDoUsuario: PermissionsMap | null | undefined,
  modulo: string,
  acao: string,
): boolean {
  if (papel === 'owner' || papel === 'admin') return true;
  return resolvePermission(permissoesDoPerfil, overridesDoUsuario, modulo, acao);
}
