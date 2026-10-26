// O preço que a venda ao salão já traz (rodada 2, R5; decisão do dono de 2026-10-26): o último que ele cobrou DAQUELE
// salão por aquele produto; sem venda anterior a esse salão, o último que cobrou de qualquer salão. Não é a tabela dele
// (é o que ELE paga à Minasflor) e o Conecta ainda não manda preço nenhum. Ele sempre pode trocar o valor.

export interface VendaComPrecos {
  salao_id: string; data: string; created_at: string;
  itens: { produto_codigo: string; valor_unitario: number }[];
}

/** O preço sugerido, ou `null` quando ele nunca vendeu o produto com preço. Venda com preço zero não conta. */
export function precoSugerido(vendas: VendaComPrecos[], salaoId: string, produto: string): number | null {
  const recentes = [...vendas].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
  const preco = (v: VendaComPrecos) => v.itens.find((i) => i.produto_codigo === produto && Number(i.valor_unitario) > 0)?.valor_unitario;
  for (const v of recentes) if (v.salao_id === salaoId && preco(v) != null) return Number(preco(v));
  for (const v of recentes) if (preco(v) != null) return Number(preco(v));
  return null;
}

/** O aviso de venda acima do estoque (decisão do dono: avisa e deixa salvar), ou `null` quando ele tem o bastante. */
export function avisoDeEstoque(quantidade: number, tenho: number): string | null {
  if (!(quantidade > tenho)) return null;
  return tenho > 0
    ? `Você tem ${tenho} no estoque e está vendendo ${quantidade}. Dá para salvar; confira o estoque depois.`
    : `O estoque não mostra nenhum deste produto. Dá para salvar; confira o estoque depois.`;
}
