// Ordenar pela coluna e exportar (regra 4 da proposta "Helpoint no dia a dia", etapa 3, 2026-10-24: "toda tabela
// busca, ordena e exporta"). Puro, para a tela e o teste usarem a mesma conta.

export type Direcao = 'asc' | 'desc';
export interface Ordem<C extends string = string> { coluna: C; direcao: Direcao }

const comparador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordena sem mexer na lista original; vazio vai sempre para o fim; empate mantém a ordem de antes. */
export function ordenarPor<T>(linhas: T[], valor: (l: T) => string | number | null | undefined, direcao: Direcao): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return linhas
    .map((l, i) => ({ l, i, v: valor(l) }))
    .sort((a, b) => {
      const va = a.v ?? '', vb = b.v ?? '';
      if (va === '' && vb !== '') return 1;
      if (vb === '' && va !== '') return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : comparador.compare(String(va), String(vb));
      return c === 0 ? a.i - b.i : c * sinal;
    })
    .map((x) => x.l);
}

/** Clicar no título da coluna: crescente → decrescente → volta à ordem da tela. */
export function proximaOrdem<C extends string>(atual: Ordem<C> | null, coluna: C): Ordem<C> | null {
  if (!atual || atual.coluna !== coluna) return { coluna, direcao: 'asc' };
  return atual.direcao === 'asc' ? { coluna, direcao: 'desc' } : null;
}

/** Busca sem acento e sem diferença de maiúscula em qualquer dos textos da linha. */
export function casaBusca(textos: Array<string | number | null | undefined>, busca: string): boolean {
  const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = limpa(busca.trim());
  if (!q) return true;
  return textos.some((t) => t != null && limpa(String(t)).includes(q));
}

/** Baixa a planilha (Excel). A biblioteca só carrega quando alguém exporta. */
export async function exportarPlanilha(nomeDoArquivo: string, linhas: Array<Record<string, string | number | null>>) {
  const XLSX = await import('xlsx');
  const folha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Dados');
  XLSX.writeFile(livro, `${nomeDoArquivo}.xlsx`);
}
