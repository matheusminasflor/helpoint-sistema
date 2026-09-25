// Extrai do painel HTML antigo do dono os trechos que interessam: como ele
// CLASSIFICAVA cada nota (bonificação, cashback, publicidade, venda) e por
// qual CFOP. O painel é um arquivo só, com o JavaScript embutido — a regra de
// negócio mora lá dentro, e é ela que o sistema precisa reproduzir.
//
// Uso: node scripts/ler-painel-html.mjs <arquivo.html> [termo1 termo2 ...]
import { readFileSync } from 'node:fs';

const [arquivo, ...termos] = process.argv.slice(2);
if (!arquivo) {
  console.error('uso: node scripts/ler-painel-html.mjs <arquivo.html> [termos...]');
  process.exit(1);
}
const alvos = termos.length > 0 ? termos : ['bonific', 'cashback', 'publicid', 'cfop', 'brinde', 'amostra'];

const texto = readFileSync(arquivo, 'utf8');
const minusculo = texto.toLowerCase();
const JANELA = 260;

const vistos = new Set();
for (const alvo of alvos) {
  const termo = alvo.toLowerCase();
  let de = 0;
  let achados = 0;
  while (achados < 12) {
    const i = minusculo.indexOf(termo, de);
    if (i === -1) break;
    de = i + termo.length;
    const inicio = Math.max(0, i - JANELA);
    const trecho = texto.slice(inicio, i + JANELA).replace(/\s+/g, ' ').trim();
    // Trechos quase iguais (a mesma linha repetida) não voltam duas vezes.
    const impressao = trecho.slice(0, 120);
    if (vistos.has(impressao)) continue;
    vistos.add(impressao);
    achados++;
    console.log(`\n── ${alvo} @ ${i} ─────────────────────────────`);
    console.log(trecho);
  }
}
