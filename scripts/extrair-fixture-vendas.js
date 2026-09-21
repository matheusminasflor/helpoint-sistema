// Gera `src/lib/__fixtures__/forteplus-vendas.ts` a partir do xlsx REAL do
// Forteplus — não escrevo a fixture à mão porque um `-1234` digitado errado
// não se percebe na revisão, e a fixture existe para provar leitura por
// posição fixa (§3.3 do plano) contra dados verdadeiros.
//
// As faixas de linha abaixo foram escolhidas inspecionando o arquivo real
// diretamente (achado 10.4 da auditoria: um script `inspecionar-vendas.mjs`
// era citado aqui e em `comercial-import.ts` como a ferramenta usada, mas
// nunca existiu no repositório — as posições de coluna de `comercial-
// import.ts` vieram do mesmo tipo de inspeção manual) para cobrir, com
// linhas de verdade: o
// cabeçalho (com a assinatura da linha 5), um cabeçalho repetido NO MEIO do
// recorte (mudança de página), o rodapé (endereço + site), três cabeçalhos
// de grupo de cliente, uma linha de cada classe real de CFOP presente nestes
// arquivos (venda, bonificação em série 1, bonificação em série 75,
// industrialização) e linhas em branco. CFOP `9999` e a devolução `1202` não
// existem nos arquivos do dono — são inventadas no fim, no formato de uma
// linha real.
//
// Uso: node scripts/extrair-fixture-vendas.js <caminho-do-MF.xlsx>
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('uso: node scripts/extrair-fixture-vendas.js <caminho-do-MF.xlsx>');
  process.exit(1);
}

const buf = readFileSync(path);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: '' });

const faixas = [
  [0, 14],    // cabeçalho + assinatura (linha 5) + 1º grupo de cliente + 3 itens CFOP 5101 (venda)
  [55, 73],   // 2º grupo de cliente (AILSON JOSÉ MARTINS) + itens CFOP 5401 (venda) + MUDANÇA DE PÁGINA
              // (rodapé: endereço + www; cabeçalho repetido: página/empresa/título/rótulos) + mais 1 item
  [88, 92],   // 3º grupo de cliente + 2 itens CFOP 6910 série 75 (bonificação)
  [283, 285], // grupo de cliente + 1 item CFOP 5910 série 1 (bonificação — o eixo que a §3.8 corrige)
  [1696, 1698], // grupo de cliente + o item real de CFOP 6901 (industrialização, R$ 45.693,56 — §3.1)
];

const linhas = [];
for (const [de, ate] of faixas) {
  for (let i = de; i < ate; i++) linhas.push(matrix[i]);
}

// Duas linhas inventadas, no formato de uma linha real (mesma largura), para
// os dois casos que NÃO existem nos arquivos do dono: CFOP fora da lista
// (§3.2) e devolução com valor positivo na origem (§4.9 — o banco é quem
// inverte o sinal, não o importador).
const largura = matrix[0].length;
function linhaItemFicticia({ cfop, produtoCodigo, produtoNome, quantidade, valorNota }) {
  const row = new Array(largura).fill('');
  row[1] = '90000'; row[4] = '15/08/2026'; row[6] = '90000'; row[9] = 'NFe'; row[11] = '1';
  row[12] = cfop; row[13] = produtoCodigo; row[16] = produtoNome;
  row[21] = quantidade; row[23] = valorNota; row[26] = 0;
  row[30] = '9999'; row[34] = 'VENDEDOR FIXTURE TESTE';
  return row;
}
linhas.push(['CLIENTE FIXTURE TESTE-9999', ...new Array(largura - 1).fill('')]);
linhas.push(linhaItemFicticia({ cfop: '9999', produtoCodigo: '9001', produtoNome: 'CFOP DESCONHECIDO (FIXTURE)', quantidade: 1, valorNota: 250 }));
linhas.push(linhaItemFicticia({ cfop: '1202', produtoCodigo: '9002', produtoNome: 'DEVOLUCAO (FIXTURE)', quantidade: 2, valorNota: 100 }));

const corpo = linhas.map((r) => JSON.stringify(r)).join(',\n  ');

const out = `// GERADO por \`node scripts/extrair-fixture-vendas.js\` a partir do xlsx real
// do Forteplus (MF, agosto/2026) — não editar à mão. Ver o cabeçalho do
// script para o que cada faixa de linha prova.
//
// As duas últimas linhas são inventadas (não existem no arquivo do dono):
// um CFOP fora da lista (9999) e uma devolução (1202) com valor positivo na
// origem, para provar §3.2 e §4.9 sem esperar que eles aconteçam de verdade.
export const FORTEPLUS_VENDAS_FIXTURE: unknown[][] = [
  ${corpo},
];
`;

writeFileSync('src/lib/__fixtures__/forteplus-vendas.ts', out, 'utf8');
console.log(`Escrevi ${linhas.length} linhas em src/lib/__fixtures__/forteplus-vendas.ts`);
