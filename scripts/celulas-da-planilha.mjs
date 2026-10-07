// Imprime células INTEIRAS (sem cortar) de uma planilha — só leitura.
// Uso: node scripts/celulas-da-planilha.mjs <arquivo> <primeira-linha> <ultima-linha> [colunas: "A,B,C"]
import XLSX from 'xlsx';

const [arq, de, ate, cols] = process.argv.slice(2);
const wb = XLSX.readFile(arq, { raw: false });
const aba = wb.Sheets[wb.SheetNames[0]];
const letras = cols ? cols.split(',') : null;
for (let r = Number(de); r <= Number(ate); r++) {
  const linha = Object.keys(aba)
    .filter((k) => /^[A-Z]+\d+$/.test(k) && Number(k.replace(/[A-Z]+/, '')) === r)
    .filter((k) => !letras || letras.includes(k.replace(/\d+/, '')))
    .map((k) => `${k}=${aba[k].w ?? aba[k].v}`);
  if (linha.length) console.log(linha.join(' | '));
}
