// As notas de um cliente a partir dos itens importados do Forteplus (`com_vendas_itens` tem uma linha por item):
// a ficha do distribuidor no Comercial mostra as compras dele à Minasflor nota a nota (rodada 2, R5).

export interface ItemDeNota {
  filial: string; documento: string; serie: string | null; emissao: string; classe: string;
  produto_nome: string; quantidade: number; valor_nota: number;
}
export interface NotaDoCliente {
  chave: string; filial: string; documento: string; emissao: string; classe: string; valor: number; itens: number; produtos: string[];
}

/** Agrupa os itens por nota (filial + série + número), da mais nova para a mais antiga. */
export function notasDoCliente(itens: ItemDeNota[]): NotaDoCliente[] {
  const notas = new Map<string, NotaDoCliente>();
  for (const i of itens) {
    const chave = `${i.filial}|${i.serie ?? ''}|${i.documento}`;
    const n = notas.get(chave) ?? { chave, filial: i.filial, documento: i.documento, emissao: i.emissao, classe: i.classe, valor: 0, itens: 0, produtos: [] };
    n.valor += Number(i.valor_nota) || 0;
    n.itens += 1;
    n.produtos.push(`${Number(i.quantidade)}× ${i.produto_nome}`);
    notas.set(chave, n);
  }
  return [...notas.values()].sort((a, b) => b.emissao.localeCompare(a.emissao) || b.documento.localeCompare(a.documento));
}
