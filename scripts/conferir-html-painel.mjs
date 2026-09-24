// Lê o PAINEL_COMERCIAL_*.htm gerado no fluxo antigo (Drive) e recalcula os
// totais a partir dos DADOS EMBUTIDOS nele, para comparar com o que o
// Helpoint mostra. Existe porque o dono viu números diferentes nos dois e a
// pergunta "qual está certo" só se responde medindo os dois com a mesma régua.
//
// Uso: node scripts/conferir-html-painel.mjs <arquivo.htm>
import { readFileSync } from 'node:fs';

const caminho = process.argv[2];
if (!caminho) {
  console.error('uso: node scripts/conferir-html-painel.mjs <arquivo.htm>');
  process.exit(1);
}

const html = readFileSync(caminho, 'latin1');

function bloco(chave) {
  const i = html.indexOf(`"${chave}":`);
  if (i < 0) throw new Error(`chave ${chave} não encontrada`);
  const inicio = html.indexOf('[', i);
  let nivel = 0;
  for (let j = inicio; j < html.length; j++) {
    if (html[j] === '[') nivel++;
    else if (html[j] === ']') {
      nivel--;
      if (nivel === 0) return JSON.parse(html.slice(inicio, j + 1));
    }
  }
  throw new Error(`bloco ${chave} não fecha`);
}

const meses = bloco('meses');
const rows = bloco('rows');

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

console.log(`arquivo: ${caminho.split(/[\\/]/).pop()}`);
console.log(`meses no HTML: ${meses[0]} a ${meses[meses.length - 1]} (${meses.length})`);
console.log(`linhas: ${rows.length}`);
console.log(`formato da 1a linha: ${JSON.stringify(rows[0])}`);

// Descobre quais posições são categóricas (poucos valores distintos) — é
// assim que se acha a coluna de empresa sem adivinhar.
const larguras = rows[0].length;
for (let p = 0; p < larguras; p++) {
  const distintos = new Set(rows.map((r) => r[p]));
  if (distintos.size <= 6) {
    console.log(`  posição ${p}: ${distintos.size} valores distintos -> ${[...distintos].sort().join(', ')}`);
  }
}

// Cruza as duas posições categóricas: uma é empresa, a outra é classe
// (venda/bonificação). O cruzamento mostra qual é qual — a combinação que
// reproduzir o total impresso do Forteplus por empresa é a certa.
const POS_MES = 0;
const POS_VALOR = 5;
const cruz = new Map();
for (const r of rows) {
  const ano = String(meses[r[POS_MES]] ?? '').slice(0, 4);
  const chave = `ano ${ano} | pos3=${r[3]} | pos6=${r[6]}`;
  cruz.set(chave, (cruz.get(chave) ?? 0) + Number(r[POS_VALOR] ?? 0));
}
console.log('\n-- cruzamento pos3 x pos6, valor na posição 5 --');
for (const [chave, soma] of [...cruz.entries()].sort()) {
  console.log(`   ${chave}  ${brl(soma)}`);
}

// E o mês a mês de 2026 para cada combinação, que é o que permite apontar
// onde exatamente os dois painéis se separam.
console.log('\n-- 2026, mes a mes, por pos3 x pos6 --');
const porMes = new Map();
for (const r of rows) {
  const mes = String(meses[r[POS_MES]] ?? '');
  if (!mes.startsWith('2026')) continue;
  const chave = `${mes} | pos3=${r[3]} pos6=${r[6]}`;
  porMes.set(chave, (porMes.get(chave) ?? 0) + Number(r[POS_VALOR] ?? 0));
}
for (const [chave, soma] of [...porMes.entries()].sort()) {
  console.log(`   ${chave}  ${brl(soma)}`);
}
