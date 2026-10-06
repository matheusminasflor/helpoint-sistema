// Mostra as abas, o tamanho e as primeiras linhas de planilhas (.xls/.xlsx) — só leitura.
// Uso: node scripts/inspecionar-planilhas.mjs <linhas> <arquivo> [arquivo...]
// Para entender arquivos do dono antes de modelar uma importação (2026-10-06, cashback por CFOP).
import XLSX from 'xlsx';

const [linhasArg, ...arquivos] = process.argv.slice(2);
const N = Number(linhasArg) || 8;
const corta = (v) => {
  const s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s.length > 28 ? s.slice(0, 27) + '…' : s;
};

for (const arq of arquivos) {
  const wb = XLSX.readFile(arq, { cellDates: true });
  console.log(`\n=== ${arq.split(/[\\/]/).pop()} — abas: ${wb.SheetNames.join(' | ')}`);
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, blankrows: false, defval: '' });
    const ref = wb.Sheets[aba]['!ref'] ?? '';
    console.log(`--- aba "${aba}" (${linhas.length} linhas, ${ref})`);
    for (const l of linhas.slice(0, N)) console.log('  ' + l.slice(0, 18).map(corta).join(' | '));
  }
}
