// As fórmulas (e o valor) de um trecho de uma aba de planilha — só leitura. Para entender a regra de uma planilha do
// dono antes de levá-la para o Helpoint (2026-11-03, a bonificação dos artistas do Marketing).
// Uso: node scripts/formulas-da-planilha.mjs <arquivo> "<aba>" <intervalo, ex. A7:Q9>
import XLSX from 'xlsx';

const [arq, nomeDaAba, intervalo] = process.argv.slice(2);
const wb = XLSX.readFile(arq, { cellFormula: true });
const aba = wb.Sheets[nomeDaAba];
if (!aba) {
  console.error(`Aba "${nomeDaAba}" não existe. Abas: ${wb.SheetNames.join(' | ')}`);
  process.exit(1);
}
const r = XLSX.utils.decode_range(intervalo);
for (let l = r.s.r; l <= r.e.r; l++) {
  for (let c = r.s.c; c <= r.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: l, c });
    const cel = aba[ref];
    if (!cel) continue;
    console.log(`${ref}\t${cel.f ? `=${cel.f}` : ''}\t${cel.w ?? cel.v}`);
  }
}
