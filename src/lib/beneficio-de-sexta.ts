// A regra do Benefício de sexta (dono, 2026-10-20), a mesma de `beneficio_retirar` no banco, para avisar antes de
// salvar: até 3 produtos da mesma linha; misturando linhas, até 2.
export function conferirRegra(itens: { quantidade: number; linha: string }[]): string | null {
  const total = itens.reduce((s, i) => s + i.quantidade, 0);
  const linhas = new Set(itens.filter((i) => i.quantidade > 0).map((i) => i.linha)).size;
  if (total === 0) return 'Escolha pelo menos um produto.';
  if (linhas === 1 && total > 3) return 'Da mesma linha o máximo é 3 produtos.';
  if (linhas > 1 && total > 2) return 'Misturando linhas o máximo é 2 produtos.';
  return null;
}
