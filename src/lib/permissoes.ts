// A conta única que decide se uma ação de perfil de acesso passa — pensada
// para módulos cujas policies de RLS leem `access_profiles` (hoje só o
// Comercial, L6a). Ver `.scratch/plano-painel-comercial-correcoes.md`, item
// 2b: achado da auditoria.
import { resolvePermission, type Department, type PermissionsMap } from '@/config/access-profile-schemas';

const MODULOS_DA_TI = new Set(['tickets', 'inventory', 'contracts', 'licenses', 'maintenances']);
const SETORES_COM_PERFIL = new Set<string>(['marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional', 'expedicao', 'producao']);

/**
 * O setor de perfil a que um módulo das tabelas responde — a mesma conta de
 * `public.setor_do_modulo` no banco (migration `20261116010000`). Chamados e cadastros da TI são
 * `tickets`, `inventory`…; o CRM responde ao Comercial. Nulo = módulo sem setor de perfil.
 */
export function setorDoModulo(modulo: string): Department | null {
  if (MODULOS_DA_TI.has(modulo)) return 'ti';
  if (modulo === 'crm') return 'comercial';
  return SETORES_COM_PERFIL.has(modulo) ? (modulo as Department) : null;
}

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
