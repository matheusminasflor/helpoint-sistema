// Confere o que o Painel Comercial vai mostrar, a partir dos xlsx REAIS do
// Forteplus — sem banco, sem tela: roda o mesmo leitor que o navegador roda
// (`src/lib/comercial-import.ts`) e faz a mesma conta que
// `com_painel_totais` (e, desde a L6b, `com_curva_abc`) fazem no banco.
//
// Existe por causa do achado grave 1 da auditoria da L6a: os KPIs "clientes
// ativos" e "SKUs vendidos" somavam `count(distinct ...)` de grupos
// diferentes, e a tela mostrava 129 clientes onde havia 58. Uma correção
// dessas não se confere por teste sintético: ou os arquivos do dono batem,
// ou não bateram. A seção da curva ABC (L6b) segue o mesmo princípio.
//
// Uso:
//   npx vite-node scripts/conferir-vendas-reais.ts <MF.xlsx> [INBRAS.xlsx ...]
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { lerRelatorioVendas, sugerirFilial } from '../src/lib/comercial-import';
import type { ItemVenda } from '../src/lib/comercial-import';

const caminhos = process.argv.slice(2);
if (caminhos.length === 0) {
  console.error('uso: npx vite-node scripts/conferir-vendas-reais.ts <MF.xlsx> [INBRAS.xlsx ...]');
  process.exit(1);
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const todos: { filial: string; item: ItemVenda }[] = [];

for (const caminho of caminhos) {
  const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, blankrows: true, defval: '',
  }) as unknown[][];

  const leitura = lerRelatorioVendas(matriz);
  const filial = sugerirFilial(caminho.split(/[\\/]/).pop() ?? '') ?? '?';
  const descartes = Object.values(leitura.descartes).reduce((s, n) => s + n, 0);

  console.log(`\n${filial}  (${caminho.split(/[\\/]/).pop()})`);
  console.log(`  linhas lidas ${leitura.linhasLidas} = ${leitura.itens.length} itens + ${descartes} descartes` +
    `  ${leitura.linhasLidas === leitura.itens.length + descartes ? 'confere' : 'NÃO FECHA'}`);

  // A conferência que vale mais: o relatório IMPRIME o próprio total, logo
  // acima do rótulo "Totais:". Comparar a soma dos itens lidos contra ele
  // prova que o arquivo foi lido inteiro — enquanto `itens + descartes =
  // linhasLidas` prova só que o laço é coerente consigo mesmo, porque os
  // dois lados saem da mesma matriz (achado 8 da auditoria da L6a).
  const iTotais = matriz.findIndex((r) => String(r?.[2] ?? '').trim() === 'Totais:');
  if (iTotais > 0) {
    let i = iTotais - 1;
    while (i > 0 && matriz[i].every((c) => String(c ?? '').trim() === '')) i--;
    const impresso = Number(matriz[i][23]);
    const somado = leitura.itens.reduce((s, it) => s + it.valor_nota, 0);
    const bate = Math.abs(impresso - somado) < 0.01;
    console.log(`  total impresso pelo Forteplus ${brl(impresso)} × soma dos itens lidos ${brl(somado)}` +
      `  ${bate ? 'confere' : 'NÃO BATE — o leitor perdeu ou inventou linha'}`);
    if (!bate) process.exitCode = 1;
  } else {
    console.log('  (este recorte não traz a linha "Totais:" — relatório parcial, sem conferência externa)');
  }
  if (leitura.cfopsDesconhecidos.length > 0) {
    console.log(`  CFOP fora da curva: ${leitura.cfopsDesconhecidos.map((c) => c.cfop).join(', ')}`);
  }

  for (const item of leitura.itens) todos.push({ filial, item });
}

// A conta do painel, ano a ano — a MESMA de `com_painel_totais`: distinto
// sobre o recorte inteiro, nunca somado por mês.
const anos = [...new Set(todos.map((t) => t.item.emissao.slice(0, 4)))].sort();

for (const ano of anos) {
  const doAno = todos.filter((t) => t.item.emissao.startsWith(ano));
  const vendas = doAno.filter((t) => t.item.classe === 'venda');
  const soma = (f: (i: ItemVenda) => number, classe: string) =>
    doAno.filter((t) => t.item.classe === classe).reduce((s, t) => s + f(t.item), 0);

  console.log(`\n=== ${ano} — as duas filiais, como o painel mostra ===`);
  console.log(`  Faturamento (venda)   ${brl(soma((i) => i.valor_nota, 'venda'))}`);
  console.log(`  Devolução             ${brl(soma((i) => i.valor_nota, 'devolucao'))}`);
  console.log(`  Bonificação           ${brl(soma((i) => i.valor_nota, 'bonificacao'))}`);
  console.log(`  Industrialização      ${brl(soma((i) => i.valor_nota, 'industrializacao'))}  (fora da venda, de propósito)`);
  console.log(`  Clientes ativos       ${new Set(vendas.map((t) => t.item.cliente_codigo)).size}`);
  console.log(`  SKUs vendidos         ${new Set(vendas.map((t) => t.item.produto_codigo)).size}`);

  // O que a tela mostrava ANTES da correção: somar os distintos de cada
  // (competência, filial, série). Fica aqui para a diferença não virar
  // lenda — é o número errado, reproduzido.
  const grupos = new Map<string, { clientes: Set<string>; skus: Set<string> }>();
  for (const t of vendas) {
    const chave = `${t.item.emissao.slice(0, 7)}|${t.filial}|${t.item.serie}`;
    const g = grupos.get(chave) ?? { clientes: new Set(), skus: new Set() };
    g.clientes.add(t.item.cliente_codigo);
    g.skus.add(t.item.produto_codigo);
    grupos.set(chave, g);
  }
  let clientesSomados = 0, skusSomados = 0;
  for (const g of grupos.values()) { clientesSomados += g.clientes.size; skusSomados += g.skus.size; }
  console.log(`  (antes da correção, somando os grupos: ${clientesSomados} clientes e ${skusSomados} SKUs)`);
}

// Curva ABC (Pareto) por produto, por filial, sobre TODO o recorte lido do
// arquivo — a MESMA conta de `com_curva_abc` no banco (L6b): o sinal é do
// banco (`venda` soma, `devolucao` abate), a fronteira é 80%/95% do
// ACUMULADO por linha, e o produto com saldo líquido ≤ 0 no período fica
// fora da classificação (faixa própria, não entra no Pareto).
const filiaisPresentes = [...new Set(todos.map((t) => t.filial))].sort();
for (const filial of filiaisPresentes) {
  const doFilial = todos.filter((t) =>
    t.filial === filial && (t.item.classe === 'venda' || t.item.classe === 'devolucao'));

  const porProduto = new Map<string, number>();
  for (const t of doFilial) {
    const sinal = t.item.classe === 'venda' ? t.item.valor_nota : -Math.abs(t.item.valor_nota);
    porProduto.set(t.item.produto_codigo, (porProduto.get(t.item.produto_codigo) ?? 0) + sinal);
  }

  const positivos = [...porProduto.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const foraDaCurva = [...porProduto.entries()].filter(([, v]) => v <= 0);
  const total = positivos.reduce((s, [, v]) => s + v, 0);

  let corrido = 0;
  let a = 0, b = 0, c = 0;
  for (const [, v] of positivos) {
    corrido += v;
    const acumulado = Math.round((corrido / total) * 100 * 100) / 100;
    if (acumulado <= 80) a++;
    else if (acumulado <= 95) b++;
    else c++;
  }

  console.log(`\n=== Curva ABC por valor — filial ${filial} (todo o recorte do arquivo) ===`);
  console.log(`  A ${a}  ·  B ${b}  ·  C ${c}  ·  fora da curva (saldo ≤ 0) ${foraDaCurva.length}`);
  console.log(`  ${positivos.length + foraDaCurva.length} produtos no total, ${positivos.length} classificados`);
}
