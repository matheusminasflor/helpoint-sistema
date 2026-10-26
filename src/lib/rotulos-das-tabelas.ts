// No celular a tabela vira lista (index.css, "ETAPA 2, 2ª PARTE"): cada célula precisa dizer de que coluna é, porque o
// cabeçalho some. Em vez de mexer nas 78 telas que têm tabela, um observador põe em cada `<td>` o `data-label` com o
// texto do `<th>` da mesma coluna (contando `colSpan`). Coluna sem nome (a dos botões, a da caixinha) fica sem rótulo.

const texto = (n: Node) => (n.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * O nome da coluna. Cabeçalho de duas linhas (o nome e, embaixo, a explicação: "Comprou em out/26" / "embaixo: o mês
 * anterior", na Carteira) vira só a primeira — o `textContent` juntava as duas sem espaço ("out/26embaixo", R3).
 */
function nomeDoCabecalho(th: HTMLTableCellElement): string {
  const soltos = Array.from(th.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && texto(n) !== '');
  const linhas = Array.from(th.children).filter((e) => texto(e) !== '');
  return !soltos && linhas.length >= 2 ? texto(linhas[0]) : texto(th);
}

/** Os nomes das colunas de uma tabela, na ordem das colunas (uma posição por coluna, mesmo com `colSpan`). */
export function nomesDasColunas(tabela: HTMLTableElement): string[] {
  const linha = tabela.tHead?.rows[tabela.tHead.rows.length - 1];
  if (!linha) return [];
  const nomes: string[] = [];
  for (const th of Array.from(linha.cells)) {
    const nome = nomeDoCabecalho(th);
    for (let i = 0; i < th.colSpan; i++) nomes.push(nome);
  }
  return nomes;
}

export function rotularTabela(tabela: HTMLTableElement): void {
  const nomes = nomesDasColunas(tabela);
  if (!nomes.length) return;
  for (const corpo of Array.from(tabela.tBodies)) {
    for (const linha of Array.from(corpo.rows)) {
      let coluna = 0;
      for (const celula of Array.from(linha.cells)) {
        const nome = nomes[coluna];
        if (nome && celula.getAttribute('data-label') !== nome) celula.setAttribute('data-label', nome);
        if (!nome && celula.hasAttribute('data-label')) celula.removeAttribute('data-label');
        coluna += celula.colSpan;
      }
    }
  }
}

/** Observa a área e rotula toda tabela que aparece ou muda. Devolve o que desliga. */
export function rotularTabelasDe(area: HTMLElement): () => void {
  let pendente = 0;
  const rotularTudo = () => {
    pendente = 0;
    area.querySelectorAll('table').forEach((t) => rotularTabela(t));
  };
  // Só filhos entrando e saindo: pôr o atributo não dispara de novo o observador.
  const observador = new MutationObserver(() => { if (!pendente) pendente = requestAnimationFrame(rotularTudo); });
  observador.observe(area, { childList: true, subtree: true });
  rotularTudo();
  return () => { observador.disconnect(); if (pendente) cancelAnimationFrame(pendente); };
}
