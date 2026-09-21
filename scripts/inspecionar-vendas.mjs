// Inspeciona o relatório "Mercadorias Vendidas" do Forteplus sem interpretá-lo:
// mostra as linhas cruas, numeradas, com o índice de cada célula preenchida.
//
// É a ferramenta que descobriu as posições de coluna de
// `src/lib/comercial-import.ts` — e o motivo de a leitura ser por POSIÇÃO e
// não por nome: o cabeçalho impresso aponta para a coluna errada em três
// campos, porque as células do título são mescladas. Sem olhar a linha crua
// isso não aparece.
//
// A auditoria da L6a achou este script citado em dois comentários e
// inexistente no repositório (achado 10.4). Ele existe agora: quem precisar
// repetir a medição, ou conferir um relatório novo do Forteplus, roda isto.
//
// Uso:
//   node scripts/inspecionar-vendas.mjs <arquivo.xlsx>            (as 12 primeiras e as 12 últimas)
//   node scripts/inspecionar-vendas.mjs <arquivo.xlsx> 1690 1700  (uma faixa de linhas)
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const [caminho, de, ate] = process.argv.slice(2);
if (!caminho) {
  console.error('uso: node scripts/inspecionar-vendas.mjs <arquivo.xlsx> [linha-de] [linha-ate]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });
const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, blankrows: true, defval: '',
});

console.log(`${caminho}: ${matriz.length} linhas, ${matriz[0]?.length ?? 0} colunas\n`);

function mostrar(i) {
  const row = matriz[i] ?? [];
  const preenchidas = row
    .map((c, idx) => [idx, String(c ?? '').trim()])
    .filter(([, v]) => v !== '')
    .map(([idx, v]) => `${idx}:${v.length > 28 ? `${v.slice(0, 28)}…` : v}`);
  console.log(`[${String(i).padStart(4)}] ${preenchidas.length === 0 ? '(em branco)' : preenchidas.join('  ')}`);
}

if (de !== undefined) {
  for (let i = Number(de); i < Math.min(Number(ate ?? Number(de) + 10), matriz.length); i++) mostrar(i);
} else {
  console.log('--- as 12 primeiras (cabeçalho; a assinatura que o leitor confere está na linha 4) ---');
  for (let i = 0; i < Math.min(12, matriz.length); i++) mostrar(i);
  console.log('\n--- as 12 últimas (rodapé; é aqui que o Forteplus imprime o próprio total) ---');
  for (let i = Math.max(0, matriz.length - 12); i < matriz.length; i++) mostrar(i);
}
