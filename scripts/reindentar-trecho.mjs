// Tira N espaços do começo das linhas de um intervalo — para quando um
// trecho é recortado de dentro de um componente e fica com a indentação do
// lugar de onde veio. O allowlist bloqueia `node -e`, então isto é arquivo.
//
// Uso: node scripts/reindentar-trecho.mjs <arquivo> <espacos> <de-ate> [<de-ate> ...]
import { readFileSync, writeFileSync } from 'node:fs';

const [arquivo, espacosArg, ...faixas] = process.argv.slice(2);
if (!arquivo || !espacosArg || faixas.length === 0) {
  console.error('uso: node scripts/reindentar-trecho.mjs <arquivo> <espacos> <de-ate> [...]');
  process.exit(1);
}
const espacos = Number(espacosArg);
const prefixo = ' '.repeat(espacos);
const intervalos = faixas.map((f) => f.split('-').map(Number));

const linhas = readFileSync(arquivo, 'utf8').split('\n');
let mexidas = 0;
const saida = linhas.map((linha, i) => {
  const n = i + 1;
  const dentro = intervalos.some(([de, ate]) => n >= de && n <= ate);
  if (dentro && linha.startsWith(prefixo)) {
    mexidas++;
    return linha.slice(espacos);
  }
  return linha;
});
writeFileSync(arquivo, saida.join('\n'));
console.log(`${mexidas} linhas reindentadas em ${arquivo}`);
