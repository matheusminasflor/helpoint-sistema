// Prepara para commit SÓ um trecho de um arquivo que outro trabalho também está editando — sem
// tocar no arquivo de trabalho. Pega a versão de HEAD, insere o bloco que começa na linha-marca
// (no arquivo de trabalho) antes da âncora, e grava o resultado direto no índice do git.
// Uso: node scripts/preparar-trecho.mjs <arquivo> "<linha-marca>" "<âncora>"
//   ex.: node scripts/preparar-trecho.mjs src/config/x.ts "  // ─── Cashback" "} satisfies"
// O bloco vai da marca até a linha anterior à âncora no arquivo de trabalho.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [arquivo, marca, ancora] = process.argv.slice(2);
const trabalho = readFileSync(arquivo, 'utf8').split('\n');
const ini = trabalho.findIndex((l) => l.startsWith(marca));
const fim = trabalho.findIndex((l, i) => i > ini && l.startsWith(ancora));
if (ini < 0 || fim < 0) throw new Error('marca ou âncora não encontrada no arquivo de trabalho');
const bloco = trabalho.slice(ini, fim);

const head = execFileSync('git', ['show', `HEAD:${arquivo}`], { encoding: 'utf8' }).split('\n');
const iAncora = head.findIndex((l) => l.startsWith(ancora));
if (iAncora < 0) throw new Error('âncora não encontrada em HEAD');
const novo = [...head.slice(0, iAncora), '', ...bloco, ...head.slice(iAncora)].join('\n');

const hash = execFileSync('git', ['hash-object', '-w', '--stdin'], { input: novo, encoding: 'utf8' }).trim();
execFileSync('git', ['update-index', '--cacheinfo', `100644,${hash},${arquivo}`]);
console.log(`índice de ${arquivo}: +${bloco.length} linhas do bloco "${marca.trim()}"`);
