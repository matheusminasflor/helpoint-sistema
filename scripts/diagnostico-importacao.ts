// Diagnóstico da importação de vendas: lê os 2 arquivos como a tela e imprime o resumo e as anomalias.
// Uso: npx vite-node scripts/diagnostico-importacao.ts <arquivo-tudo.xlsx> <arquivo-5910.xlsx>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as XLSX from 'xlsx';
import { combinarAeB, lerRelatorioVendas, CFOPS_DA_REMESSA } from '../src/lib/comercial-import';

const leituras = process.argv.slice(2).map((p) => {
  const wb = XLSX.read(readFileSync(p), { type: 'buffer' });
  const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true, defval: '' });
  const leitura = lerRelatorioVendas(m);
  const remessa = leitura.itens.filter((i) => CFOPS_DA_REMESSA.has(i.cfop));
  const meses = [...new Set(leitura.itens.map((i) => i.emissao.slice(0, 7)))];
  console.log(`${basename(p)}: ${leitura.itens.length} itens, ${remessa.length} de 5910/6910, meses ${meses.join(',')}, total ${leitura.totalImpresso}`);
  return { nome: basename(p), leitura };
});

const cliente = process.env.CLIENTE;
if (cliente) {
  for (const { nome, leitura } of leituras) {
    console.log(`\n${nome} — cliente ${cliente} ${leitura.itens.find((x) => x.cliente_codigo === cliente)?.cliente_nome ?? ''}:`);
    for (const i of leitura.itens.filter((x) => x.cliente_codigo === cliente)) {
      console.log(`  nota ${i.documento} ${i.emissao} s${i.serie} cfop ${i.cfop} pedido ${i.pedido} prod ${i.produto_codigo} qtd ${i.quantidade} R$ ${i.valor_nota}`);
    }
  }
}

const vizinhas = process.env.NOTAS; // ex.: 18570-18590
if (vizinhas) {
  const [de, ate] = vizinhas.split('-').map(Number);
  const vistas = new Set<string>();
  for (const i of leituras[0].leitura.itens) {
    const n = Number(i.documento);
    if (n < de || n > ate || vistas.has(i.documento + i.cfop)) continue;
    vistas.add(i.documento + i.cfop);
    console.log(`  nota ${i.documento} ${i.emissao} s${i.serie} cfop ${i.cfop} cliente ${i.cliente_codigo}`);
  }
}

const r = combinarAeB(leituras);
for (const c of r.casos) {
  console.log(`\nCaso ${c.cliente_codigo} ${c.cliente_nome} — notas ${c.documentos.join(',')} — diferença ${c.valor}`);
  const fmt = (ls: { documento: string; serie: string; cfop: string; quantidade: number }[]) =>
    ls.map((x) => `${x.documento} s${x.serie} ${x.cfop} ${x.quantidade}un`).join(' + ') || 'não traz';
  for (const l of c.linhas) console.log(`  ${l.produto_codigo}: tudo ${fmt(l.noTudo)} | só remessa ${fmt(l.noSoRemessa)} | dif ${l.quantidade}un ${l.valor}`);
}
console.log(`\nAnomalias: ${r.anomalias.length}`);
for (const a of r.anomalias) console.log('-', a);
