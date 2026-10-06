// Lê o relatório "Mercadorias Vendidas" do Forteplus e mostra, por Série × CFOP, quantas linhas e
// quanto valor há — só leitura. Para decidir a regra do cashback por CFOP (dono, 2026-10-06).
// Uso: node scripts/cfop-do-relatorio-forteplus.mjs <arquivo.xlsx> [cabecalho]
//   com "cabecalho": imprime o cabeçalho (coluna → índice) e 4 linhas de dado, para achar a coluna do valor.
import XLSX from 'xlsx';

const [arq, modo] = process.argv.slice(2);
const wb = XLSX.readFile(arq);
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
const iCab = linhas.findIndex((l) => l.some((c) => String(c).trim() === 'CFOP'));
const cab = linhas[iCab].map((c) => String(c).trim());
const col = (nome) => cab.findIndex((c) => c === nome);

if (modo === 'cabecalho') {
  console.log('cabeçalho (linha ' + iCab + '):', cab.map((c, i) => (c ? `${i}=${c}` : '')).filter(Boolean).join('  '));
  const dados = linhas.slice(iCab + 1).filter((l) => String(l[col('CFOP')]).trim()).slice(0, 4);
  for (const l of dados) console.log('  ' + l.map((c, i) => (String(c).trim() ? `${i}:${String(c).trim().slice(0, 22)}` : '')).filter(Boolean).join('  '));
  process.exit(0);
}

const iSr = col('Sr');
const iCfop = col('CFOP');
const iValor = Number(process.env.COL_VALOR);
const grupos = new Map();
for (const l of linhas.slice(iCab + 1)) {
  const cfop = String(l[iCfop]).trim();
  if (!/^\d{4}$/.test(cfop)) continue;
  const chave = `série ${String(l[iSr]).trim() || '?'} · CFOP ${cfop}`;
  const g = grupos.get(chave) ?? { n: 0, v: 0 };
  g.n += 1;
  const bruto = l[iValor];
  g.v += typeof bruto === 'number' ? bruto : Number(String(bruto).replace(/\./g, '').replace(',', '.')) || 0;
  grupos.set(chave, g);
}
for (const [k, g] of [...grupos].sort()) console.log(`${k.padEnd(24)} ${String(g.n).padStart(5)} linhas  R$ ${g.v.toFixed(2)}`);
