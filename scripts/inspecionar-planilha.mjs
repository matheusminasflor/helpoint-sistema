// Lista as abas de um .xlsx, com o tamanho e o cabeçalho de cada uma, e
// mostra as primeiras linhas de uma aba escolhida.
//
// Existe para ler a planilha CURVA_ABC_<AAAA-MM>.xlsx que o dono gera hoje
// fora do sistema (INSTRUCOES v7 §10): a aba BASE é a fonte de verdade da
// rotina dele, e as outras são análises sobre ela.
//
// Uso:
//   node scripts/inspecionar-planilha.mjs <arquivo.xlsx>
//   node scripts/inspecionar-planilha.mjs <arquivo.xlsx> BASE 5
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const [caminho, aba, quantasStr] = process.argv.slice(2);
if (!caminho) {
  console.error('uso: node scripts/inspecionar-planilha.mjs <arquivo.xlsx> [aba] [linhas]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });

if (!aba) {
  console.log(`${caminho.split(/[\\/]/).pop()} — ${wb.SheetNames.length} abas\n`);
  for (const nome of wb.SheetNames) {
    const m = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false, defval: '' });
    const cabecalho = (m[0] ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);
    console.log(`  ${nome.padEnd(16)} ${String(m.length).padStart(6)} linhas × ${(m[0]?.length ?? 0)} colunas`);
    if (cabecalho.length) console.log(`  ${''.padEnd(16)} ${cabecalho.join(' | ')}`);
  }
  process.exit(0);
}

const folha = wb.Sheets[aba];
if (!folha) {
  console.error(`aba "${aba}" não existe. Abas: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const matriz = XLSX.utils.sheet_to_json(folha, { header: 1, blankrows: false, defval: '' });
const quantas = Number(quantasStr ?? 5);
console.log(`${aba}: ${matriz.length} linhas\n`);
for (let i = 0; i < Math.min(quantas + 1, matriz.length); i++) {
  console.log(`[${String(i).padStart(4)}] ${matriz[i].map((c) => String(c ?? '')).join(' | ')}`);
}
