/**
 * A lista de setores da empresa — UMA, para todo o sistema.
 *
 * Antes da leva I havia três listas diferentes e nenhuma mandava:
 *
 * - o convite oferecia NOVE setores (`InviteUserDialog`), incluindo Produção e
 *   Expedição;
 * - o perfil de acesso conhecia SETE (`DEPARTMENT_LIST`), e era essa lista que
 *   a tela de teto de gasto percorria — então Produção e Expedição nunca podiam
 *   ter teto, apesar de o convite pôr gente lá;
 * - a tela de perfil da pessoa deixava **digitar** o setor, e o banco guardou
 *   `ti` (3 pessoas) e `TI` (2). Para um teto gravado em `ti`, quem escreveu
 *   `TI` era outro setor.
 *
 * A lista de setores NÃO é a lista de módulos com perfil de acesso
 * (`DEPARTMENT_LIST` em `config/access-profile-schemas.ts`): quem trabalha na
 * Produção tem setor e não tem módulo. Por isso as duas continuam separadas, e
 * esta é a mais larga das duas.
 */

export const SETORES = [
  { value: 'ti', label: 'TI' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'rh', label: 'RH' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'producao', label: 'Produção' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'educacional', label: 'Educacional' },
  { value: 'qualidade', label: 'Qualidade' },
  // O décimo, em 2026-09-27: Compras saiu de dentro do Financeiro e virou módulo,
  // e o dono confirmou que é setor também — então quem trabalha nele tem esse setor
  // no cadastro e o setor ganha teto de gasto próprio. Migration
  // `20261110010000` acrescentou o valor aos quatro CHECKs de uma vez.
  { value: 'compras', label: 'Compras' },
] as const;

export type Setor = (typeof SETORES)[number]['value'];

export const SETOR_VALUES: readonly string[] = SETORES.map(s => s.value);

export function isSetor(valor: unknown): valor is Setor {
  return typeof valor === 'string' && SETOR_VALUES.includes(valor);
}

/**
 * Devolve o setor canônico, ou `null` quando o texto não é um setor conhecido.
 *
 * Existe porque `profiles.department` nasceu texto livre: o dado antigo tem
 * `TI` de gente que digitou em caixa alta. A migration
 * `20261103010000` normalizou o que estava gravado e pôs um CHECK no banco;
 * esta função é a mesma regra do lado da tela, para um valor herdado não virar
 * "setor desconhecido" silencioso na hora de sugerir.
 */
export function normalizarSetor(valor: string | null | undefined): Setor | null {
  const limpo = (valor ?? '').trim().toLowerCase();
  return isSetor(limpo) ? limpo : null;
}

export function rotuloDoSetor(valor: string | null | undefined): string {
  const setor = normalizarSetor(valor);
  if (setor) return SETORES.find(s => s.value === setor)!.label;
  // Setor herdado que não está na lista aparece como está, não como "—": some
  // do seletor, mas quem lê a compra antiga precisa ver o que foi gravado.
  return (valor ?? '').trim() || 'Sem setor';
}
