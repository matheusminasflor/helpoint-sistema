// Inspeciona o "Relatório Geral de Cliente" do Forteplus — o de FICHA, não de tabela.
//
// POR QUE UM INSPETOR PRÓPRIO. O relatório de vendas é uma tabela: uma linha por
// item, e `inspecionar-vendas.mjs` mostra a linha crua com o índice de cada célula.
// Este é outro formato: **um bloco de ~23 linhas por cliente**, com RÓTULO numa
// coluna e VALOR em outra (`1:CNPJ/CPF:` … `4:31.481.298/0001-22`). Ler por posição
// de coluna aqui não diz nada; o que importa é o par rótulo→valor e onde um bloco
// termina e o outro começa.
//
// É a mesma postura do outro inspetor, e pela mesma razão: as posições que o
// importador vai usar saem daqui, medidas no arquivo real, nunca deduzidas da
// aparência do relatório impresso.
//
// Uso:
//   node scripts/inspecionar-ficha-clientes.mjs <arquivo.xlsx>           (os rótulos e quantos blocos)
//   node scripts/inspecionar-ficha-clientes.mjs <arquivo.xlsx> --bloco 2 (um bloco inteiro, valor por valor)
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const caminho = process.argv[2];
const bloco = process.argv.includes('--bloco') ? Number(process.argv[process.argv.indexOf('--bloco') + 1]) : null;
if (!caminho) {
  console.error('uso: node scripts/inspecionar-ficha-clientes.mjs <arquivo.xlsx> [--bloco N]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });
const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, blankrows: true, defval: '',
});

const texto = (v) => String(v ?? '').trim();

/** As células preenchidas de uma linha, como pares [coluna, valor]. */
function celulas(i) {
  return (matriz[i] ?? [])
    .map((c, idx) => [idx, texto(c)])
    .filter(([, v]) => v !== '');
}

// Um bloco começa onde aparece o rótulo `NOME:`. É o único rótulo que abre ficha.
const inicios = [];
for (let i = 0; i < matriz.length; i++) {
  if (celulas(i).some(([, v]) => v.toUpperCase() === 'NOME:')) inicios.push(i);
}

console.log(`${caminho}`);
console.log(`${matriz.length} linhas, ${matriz[0]?.length ?? 0} colunas`);
console.log(`${inicios.length} fichas de cliente (linhas com "NOME:")\n`);

if (bloco !== null) {
  const de = inicios[bloco - 1];
  const ate = inicios[bloco] ?? matriz.length;
  if (de === undefined) { console.error(`bloco ${bloco} não existe`); process.exit(1); }
  console.log(`--- ficha ${bloco}: linhas ${de} a ${ate - 1} ---`);
  for (let i = de; i < ate; i++) {
    const c = celulas(i);
    if (c.length === 0) continue;
    console.log(`[${String(i).padStart(5)}] ${c.map(([k, v]) => `${k}:${v}`).join('  |  ')}`);
  }
  process.exit(0);
}

// Sem `--bloco`: o catálogo de rótulos, com a coluna onde cada um aparece e em
// quantas fichas ele vem PREENCHIDO. É este último número que decide o que dá para
// importar — rótulo que existe e nunca tem valor não serve para nada.
const rotulos = new Map();
for (let b = 0; b < inicios.length; b++) {
  const de = inicios[b];
  const ate = inicios[b + 1] ?? matriz.length;
  for (let i = de; i < ate; i++) {
    const c = celulas(i);
    for (let k = 0; k < c.length; k++) {
      const [col, val] = c[k];
      if (!val.endsWith(':') && val.toUpperCase() !== 'CELULAR') continue;
      const nome = val.replace(/:$/, '').toUpperCase();
      const prox = c[k + 1];
      // O valor é a célula seguinte da MESMA linha, quando ela não é outro rótulo.
      const temValor = !!prox && !prox[1].endsWith(':') && prox[1].toUpperCase() !== 'CELULAR';
      const atual = rotulos.get(nome) ?? { colRotulo: new Set(), colValor: new Set(), comValor: 0, total: 0 };
      atual.colRotulo.add(col);
      atual.total++;
      if (temValor) { atual.comValor++; atual.colValor.add(prox[0]); }
      rotulos.set(nome, atual);
    }
  }
}

const linhas = [...rotulos.entries()]
  .sort((a, b) => b[1].comValor - a[1].comValor)
  .map(([nome, r]) => ({
    rotulo: nome,
    'col rótulo': [...r.colRotulo].sort((x, y) => x - y).join('/'),
    'col valor': [...r.colValor].sort((x, y) => x - y).join('/') || '—',
    'fichas com valor': `${r.comValor} de ${inicios.length}`,
    '%': `${Math.round((r.comValor / inicios.length) * 100)}%`,
  }));

console.table(linhas);
