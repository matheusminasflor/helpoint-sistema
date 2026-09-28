// Inspeciona os relatórios de Contas a Pagar e Contas a Receber do Forteplus.
//
// POR QUE POR POSIÇÃO, E NÃO PELO CABEÇALHO. Nos dois relatórios o cabeçalho impresso
// aponta para colunas DIFERENTES das dos dados — medido no arquivo real de 2026-09-28:
//
//   Contas a Receber: "Vencimento" no cabeçalho está na coluna 9, o dado na 10;
//                     "Valor Parcela" no 23, o dado no 22; e a coluna 13 diz
//                     "Cliente Razão Social", mas são DUAS colunas de dado — o
//                     código do cliente na 14 e a razão social na 16.
//   Contas a Pagar:   mesma história: "Vencimento" 9 → dado 10, "Valor Parcela"
//                     21 → dado 19, fornecedor em 14 (código) e 16 (nome).
//
// É o mesmo motivo de `src/lib/comercial-import.ts` ler o relatório de vendas por
// posição: célula de título mesclada desloca o cabeçalho, e quem casa por nome de
// coluna lê o campo errado sem nada acusar.
//
// Este script não importa nada. Ele responde "o que dá para puxar daqui", que foi o
// que o dono pediu ao mandar os exemplos.
//
// Uso: node scripts/inspecionar-fin-forteplus.mjs <arquivo.xlsx> [receber|pagar]
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const [caminho, tipoArg] = process.argv.slice(2);
if (!caminho) {
  console.error('uso: node scripts/inspecionar-fin-forteplus.mjs <arquivo.xlsx> [receber|pagar]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });
const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, blankrows: true, defval: '',
});

const texto = (v) => String(v ?? '').trim();
const cel = (row, i) => texto((row ?? [])[i]);

// O tipo sai do título (linha 4), não do nome do arquivo: arquivo se renomeia.
const titulo = matriz.slice(0, 8).map((r) => (r ?? []).map(texto).join(' ')).join(' ').toLowerCase();
const tipo = tipoArg ?? (titulo.includes('receber') ? 'receber' : titulo.includes('pagar') ? 'pagar' : null);
if (!tipo) { console.error('não reconheci se é Contas a Pagar ou a Receber pelo título'); process.exit(1); }

/** As posições medidas no arquivo real. Mudou o relatório? Rode este script antes. */
const COL = tipo === 'receber'
  ? { cod: 0, documento: 4, parcela: 5, emissao: 7, vencimento: 10, tp: 12,
      contraparteCod: 14, contraparteNome: 16, valor: 22, saldo: 27,
      acrescimo: 33, desconto: 38, total: 43, meioPgto: 47, vendedor: 53 }
  : { cod: 0, documento: 4, parcela: 6, emissao: 8, vencimento: 10, tp: 12,
      contraparteCod: 14, contraparteNome: 16, valor: 19, saldo: 23,
      acrescimo: 26, desconto: 28, total: 30, planoContas: 35, meioPgto: 40 };

const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

/** Linha de dado: tem código, documento e vencimento em data. Título, agrupamento
 *  por data e linha de total não passam nos três ao mesmo tempo. */
const ehDado = (row) =>
  cel(row, COL.cod) !== '' && cel(row, COL.documento) !== '' && DATA_BR.test(cel(row, COL.vencimento));

const dados = matriz.filter(ehDado);

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\./g, '.').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const distintos = (i) => new Set(dados.map((r) => cel(r, i)).filter((v) => v !== ''));
const preenchidos = (i) => dados.filter((r) => cel(r, i) !== '').length;
const pct = (n) => `${Math.round((n / (dados.length || 1)) * 100)}%`;

console.log(`${caminho}`);
console.log(`tipo: CONTAS A ${tipo.toUpperCase()} — ${matriz.length} linhas no arquivo, ${dados.length} linhas de dado\n`);

const campos = Object.entries(COL).map(([nome, i]) => ({
  campo: nome,
  coluna: i,
  preenchido: `${preenchidos(i)} de ${dados.length}`,
  '%': pct(preenchidos(i)),
  exemplo: (dados.find((r) => cel(r, i) !== '') ? cel(dados.find((r) => cel(r, i) !== ''), i) : '—').slice(0, 34),
}));
console.table(campos);

const datas = dados.map((r) => cel(r, COL.vencimento)).filter((d) => DATA_BR.test(d))
  .map((d) => d.split('/').reverse().join('-')).sort();
const soma = dados.reduce((s, r) => s + num(cel(r, COL.valor)), 0);

console.log(`\nvencimentos: de ${datas[0]} a ${datas[datas.length - 1]}`);
console.log(`soma de "Valor Parcela": ${soma.toFixed(2)}`);
console.log(`contrapartes distintas (código): ${distintos(COL.contraparteCod).size}`);
if (COL.vendedor !== undefined) {
  const vs = distintos(COL.vendedor);
  console.log(`vendedores distintos: ${vs.size} — ${[...vs].slice(0, 8).join(' | ')}`);
}
if (COL.planoContas !== undefined) {
  const pc = distintos(COL.planoContas);
  console.log(`planos de conta distintos: ${pc.size} — ${[...pc].slice(0, 8).join(' | ')}`);
}
const tps = distintos(COL.tp);
console.log(`tipos de documento: ${[...tps].join(' | ')}`);
const meios = distintos(COL.meioPgto);
console.log(`meios de pagamento: ${[...meios].join(' | ')}`);
