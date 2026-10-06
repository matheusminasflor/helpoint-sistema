// Soma, por cliente, o que conta para o cashback (CFOP de venda, qualquer série — docs/regra-cashback.md)
// direto de relatórios "Mercadorias Vendidas" do Forteplus — só leitura. Serve para conferir o sistema
// contra a planilha do Comercial (2026-10-06).
// Uso: node scripts/cashback-do-relatorio-forteplus.mjs <relatorio.xlsx> [relatorio2.xlsx ...]
// Saída: codigo;nome;venda;bonificacao_e_outros;primeira_emissao;ultima_emissao
import XLSX from 'xlsx';

const VENDA = new Set(['5101', '5102', '5401', '5403', '5405', '6101', '6102', '6107', '6401', '6403', '7101']);
const DEVOLUCAO = new Set(['1201', '1202', '1410', '1411', '2201']);
const porCliente = new Map();
let cliente = null;

for (const arq of process.argv.slice(2)) {
  const wb = XLSX.readFile(arq);
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  const iCab = linhas.findIndex((l) => l.some((c) => String(c).trim() === 'CFOP'));
  const cab = linhas[iCab].map((c) => String(c).trim());
  const col = (n) => cab.indexOf(n);
  const [iCfop, iValor, iEmissao] = [col('CFOP'), col('Total Venda'), col('Emissão')];
  for (const l of linhas.slice(iCab + 1)) {
    const cfop = String(l[iCfop]).trim();
    if (!/^\d{4}$/.test(cfop)) {
      // Linha de cabeçalho de cliente: "NOME-CODIGO" na primeira coluna.
      const m = /^(.*)-(\d+)\s*$/.exec(String(l[0]).trim());
      if (m) cliente = { codigo: m[2], nome: m[1].trim() };
      continue;
    }
    if (!cliente) continue;
    // MES=2026-09 limita às emissões daquele mês (o relatório "SET" do Forteplus traz notas de outubro).
    const emissao = String(l[iEmissao]).trim().split('/').reverse().join('-');
    if (process.env.MES && !emissao.startsWith(process.env.MES)) continue;
    const v = typeof l[iValor] === 'number' ? l[iValor] : Number(String(l[iValor]).replace(/\./g, '').replace(',', '.')) || 0;
    const c = porCliente.get(cliente.codigo) ?? { nome: cliente.nome, venda: 0, outros: 0, de: '9', ate: '0' };
    if (VENDA.has(cfop)) c.venda += v;
    else if (DEVOLUCAO.has(cfop)) c.venda -= Math.abs(v);
    else c.outros += v;
    const e = String(l[iEmissao]).trim().split('/').reverse().join('-');
    if (e < c.de) c.de = e;
    if (e > c.ate) c.ate = e;
    porCliente.set(cliente.codigo, c);
  }
}
for (const [codigo, c] of porCliente) {
  console.log([codigo, c.nome, c.venda.toFixed(2), c.outros.toFixed(2), c.de, c.ate].join(';'));
}
