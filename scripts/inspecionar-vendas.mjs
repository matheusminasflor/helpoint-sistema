// Script descartável de inspeção — não faz parte do produto. Lê o xlsx real
// do Forteplus e classifica linha a linha com as mesmas regras que
// `lerRelatorioVendas` vai usar, para conferir contra os números do plano
// (§3.1, §3.4, §3.8) antes de escrever o leitor de verdade.
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const mode = process.argv[3] || 'dump';
const from = Number(process.argv[4] ?? 0);
const to = Number(process.argv[5] ?? 15);

const buf = readFileSync(path);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: '' });

if (mode === 'dump') {
  console.log('total linhas:', matrix.length, 'largura linha0:', matrix[0].length);
  for (let i = from; i < Math.min(to, matrix.length); i++) {
    console.log(i, JSON.stringify(matrix[i]));
  }
  process.exit(0);
}

if (mode === 'find') {
  const cfopAlvo = process.argv[4];
  const serieAlvo = process.argv[5];
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    const cfop = String(row[12] ?? '').trim();
    const serie = String(row[11] ?? '').trim();
    if (cfop === cfopAlvo && (!serieAlvo || serie === serieAlvo)) {
      console.log(i, JSON.stringify(row));
    }
  }
  process.exit(0);
}

const CFOP = {
  venda: ['5101','5102','5401','5403','6101','6102','6107','6401','6403','7101','7949'],
  devolucao: ['1201','1202','1410','1411','2201'],
  bonificacao: ['5910','5911','6910','6911'],
  industrializacao: ['5901','5902','6901','6902','6903','1901','1902'],
};
function classificarCfop(cfop) {
  for (const [classe, lista] of Object.entries(CFOP)) if (lista.includes(cfop)) return classe;
  return 'outros';
}

function isBlank(row) {
  return row.every((c) => String(c ?? '').trim() === '');
}

const descartes = { cabecalho_repetido: 0, em_branco: 0, rodape: 0, grupo_cliente: 0 };
const itens = [];
const anomalias = [];

for (let i = 0; i < matrix.length; i++) {
  const row = matrix[i];
  if (isBlank(row)) { descartes.em_branco++; continue; }
  const rowStr = row.join('|');
  if (String(row[1]).trim() === 'Cod' && String(row[4]).trim() === 'Emissão' && String(row[12]).trim() === 'CFOP') {
    descartes.cabecalho_repetido++; continue;
  }
  if (rowStr.includes('Página:')) { descartes.cabecalho_repetido++; continue; }
  if (rowStr.includes('Relatório Mercadorias Vendidas')) { descartes.cabecalho_repetido++; continue; }
  if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(rowStr)) { descartes.cabecalho_repetido++; continue; }
  const grupoMatch = row[0] && row.slice(1).every((c) => String(c ?? '').trim() === '') && /-\s*\d+\s*$/.test(String(row[0]));
  if (grupoMatch) { descartes.grupo_cliente++; continue; }
  const cfop = String(row[12] ?? '').trim();
  const isCfop = /^[0-9]{4}$/.test(cfop);
  if (isCfop) {
    itens.push({
      i,
      emissao: row[4], documento: row[6], serie: String(row[11]).trim(), cfop,
      produtoCodigo: row[13], produtoNome: row[16],
      quantidade: Number(row[21]), valorNota: Number(row[23]), desconto: Number(row[26]),
      vendedorCodigo: row[30], vendedorNome: row[34],
      classe: classificarCfop(cfop),
    });
    continue;
  }
  if (rowStr.includes('Telefone:')) { descartes.rodape++; continue; }
  if (rowStr.includes('www.')) { descartes.rodape++; continue; }
  descartes.rodape++; // catch-all: "Totais:", linha de totais numéricos, etc.
  anomalias.push({ i, row });
}

console.log('total linhas:', matrix.length);
console.log('descartes:', descartes, 'soma descartes:', Object.values(descartes).reduce((a,b)=>a+b,0));
console.log('itens:', itens.length);
console.log('anomalias (foram para rodape, só para eu ver o que era):', anomalias.length);

const soma = itens.length + Object.values(descartes).reduce((a,b)=>a+b,0);
console.log('linhasLidas confere?', soma === matrix.length, soma, matrix.length);

const porClasse = {};
const porClasseSerie = {};
for (const it of itens) {
  porClasse[it.classe] ??= { linhas: 0, valor: 0, unidades: 0 };
  porClasse[it.classe].linhas++;
  porClasse[it.classe].valor += it.valorNota;
  porClasse[it.classe].unidades += it.quantidade;

  const key = `${it.serie}|${it.classe}`;
  porClasseSerie[key] ??= { linhas: 0, valor: 0 };
  porClasseSerie[key].linhas++;
  porClasseSerie[key].valor += it.valorNota;
}
console.log('por classe:', porClasse);
console.log('por serie+classe:', porClasseSerie);
