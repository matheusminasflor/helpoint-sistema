// Roda os leitores de verdade (`src/lib/forteplus-ficha.ts` e
// `src/lib/forteplus-fin.ts`) contra os arquivos do Forteplus e mostra o que sai.
//
// POR QUE ISTO EXISTE, tendo Vitest. O Vitest prova o leitor contra uma fixture
// pequena, e é ele que roda no CI. Este script serve à outra pergunta, que é do dono:
// *"o que vc consegue puxar atraves disso"* — respondida contra o arquivo INTEIRO,
// que não entra no repositório (tem dado de cliente real). Rodar aqui é o que diz se
// uma posição de coluna mudou no relatório antes de alguém subir na tela.
//
// Uso:
//   node scripts/ler-relatorios-forteplus.mjs "<pasta com os relatórios>"
// Os leitores são TypeScript e importam por alias `@/`. Por isso este script roda com
// `vite-node` (já instalado com o Vitest), que resolve o alias pelo vite.config do
// projeto — em vez de compilar à mão ou duplicar o leitor em JS:
//
//   npx vite-node scripts/ler-relatorios-forteplus.mjs -- "<pasta>"
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { lerFichaClientes } from '@/lib/forteplus-ficha';
import { lerForteplusFin, tipoDoRelatorio } from '@/lib/forteplus-fin';

const pasta = process.argv[2] ?? 'C:/Users/matheus.baeta/Desktop/relatorios exemplo';

const matrizDe = (caminho) => {
  const wb = XLSX.read(readFileSync(caminho), { type: 'buffer', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true, defval: '' });
};

for (const nome of readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.xlsx'))) {
  const matriz = matrizDe(join(pasta, nome));
  console.log(`\n=== ${nome} ===`);

  const tipoFin = tipoDoRelatorio(matriz);
  if (tipoFin) {
    const r = lerForteplusFin(matriz, tipoFin);
    console.log(`Contas a ${tipoFin} — ${r.linhas.length} títulos, ${r.descartadas.length} descartados, ${r.repetidos} repetidos`);
    console.log(`competências: ${r.competencias[0]} a ${r.competencias[r.competencias.length - 1]} (${r.competencias.length})`);
    console.log(`total: ${r.total.toFixed(2)}`);
    console.log(`pagos: ${r.linhas.filter((l) => l.status === 'paid').length} · pendentes: ${r.linhas.filter((l) => l.status === 'pending').length}`);
    if (r.planosDeConta.length) console.log(`categorias (plano de contas): ${r.planosDeConta.join(' | ')}`);
    if (r.vendedores.length) console.log(`vendedores: ${r.vendedores.join(' | ')}`);
    if (r.descartadas.length) console.log(`descartes: ${JSON.stringify(r.descartadas.slice(0, 5))}`);
    console.log('primeiro título:', JSON.stringify(r.linhas[0], null, 2));
    continue;
  }

  const f = lerFichaClientes(matriz);
  console.log(`Ficha cadastral — ${f.fichas.length} clientes, ${f.repetidas.length} nomes repetidos no arquivo`);
  console.table(
    Object.entries(f.preenchidos).map(([campo, n]) => ({
      campo, preenchido: `${n} de ${f.fichas.length}`, '%': `${Math.round((n / f.fichas.length) * 100)}%`,
    })),
  );
  console.log('primeira ficha:', JSON.stringify(f.fichas[0], null, 2));
  console.log('uma sem telefone:', JSON.stringify(f.fichas.find((x) => !x.telefone) ?? null, null, 2));
}
