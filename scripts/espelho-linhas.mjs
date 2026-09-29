// Mostra as linhas que o leitor do espelho enxerga num PDF do Forteplus — para conferir um layout
// novo antes de mexer nas expressões de `src/lib/espelho-do-pedido.ts`. Os PDFs têm dado de cliente
// e ficam FORA do repositório.
// Uso: node scripts/espelho-linhas.mjs caminho/do/espelho.pdf [...]
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

for (const arquivo of process.argv.slice(2)) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(arquivo)) }).promise;
  console.log(`\n===== ${arquivo}`);
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    const porY = new Map();
    for (const it of conteudo.items) {
      if (!it.str?.trim()) continue;
      const chave = Math.round(it.transform[5] / 3);
      porY.set(chave, [...(porY.get(chave) ?? []), { str: it.str, x: it.transform[4], w: it.width }]);
    }
    for (const [, grupo] of [...porY].sort((a, b) => b[0] - a[0])) {
      grupo.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim = null;
      for (const it of grupo) {
        if (fim !== null && it.x - fim > 4) texto += '  ';
        texto += it.str;
        fim = it.x + (it.w || 0);
      }
      console.log(texto.replace(/\s+/g, ' ').trim());
    }
  }
}
