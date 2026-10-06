// Conta as combinações distintas de colunas de uma planilha (primeira aba, cabeçalho na 1ª linha
// que tiver todas as colunas pedidas) — só leitura.
// Uso: node scripts/contar-combinacoes.mjs <arquivo> "<Coluna A>" "<Coluna B>" [...]
import XLSX from 'xlsx';

const [arq, ...nomes] = process.argv.slice(2);
const wb = XLSX.readFile(arq);
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
const iCab = linhas.findIndex((l) => nomes.every((n) => l.some((c) => String(c).trim() === n)));
const idx = nomes.map((n) => linhas[iCab].findIndex((c) => String(c).trim() === n));
const cont = new Map();
for (const l of linhas.slice(iCab + 1)) {
  const k = idx.map((i) => String(l[i]).trim()).join(' | ');
  if (k.replace(/[| ]/g, '')) cont.set(k, (cont.get(k) ?? 0) + 1);
}
for (const [k, n] of [...cont].sort()) console.log(`${String(n).padStart(4)}  ${k}`);
