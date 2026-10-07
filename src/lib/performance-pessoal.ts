// "Sua Performance" mede só o que é dos setores da pessoa (decisão do dono, 2026-10-07: "respondi o
// RH porque hoje não tinha ninguém, não é correto eu ser penalizado"). O que ela atendeu em outro
// setor vira "Ajuda a outros setores", à parte — não pesa em prazo, entregas, sequência nem atrasos.

/**
 * Separa os chamados da pessoa em "dos meus setores" e "ajuda a outros". `meusSetores` são módulos
 * de chamado ('tickets' é a TI), como `meus_setores_de_chamado()` devolve. Sem setor nenhum
 * cadastrado não há "outro setor": tudo conta como dela, como era antes.
 */
export function separarPorSetor<T extends { module?: string | null }>(
  chamados: T[],
  meusSetores: readonly string[] | null | undefined,
): { meus: T[]; ajuda: T[] } {
  if (!meusSetores || meusSetores.length === 0) return { meus: chamados, ajuda: [] };
  const meus: T[] = [];
  const ajuda: T[] = [];
  for (const c of chamados) (meusSetores.includes(c.module ?? 'tickets') ? meus : ajuda).push(c);
  return { meus, ajuda };
}
