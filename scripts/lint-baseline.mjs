// Catraca do lint: o número só pode descer.
//
// `npm run lint` tem centenas de problemas herdados e sai com código 1, então
// ele não serve de portão como está — falharia sempre. Este script roda o
// ESLint, conta, e compara com a linha de base em `lint-baseline.json` (a
// mesma que `docs/nao-funciona.md` registra). Piorou: falha. Melhorou: avisa
// para abaixar a linha de base, para o ganho não se perder.
//
// Erros e avisos são contados separadamente. A linha de base só SOBE quando
// uma regra nova passa a contar dívida antiga (L0b: cores fixas viraram
// aviso) — no mesmo commit da regra, com o motivo no JSON.
//
// Uso:  node scripts/lint-baseline.mjs
// É o que o CI chama; local funciona igual.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync(new URL('../lint-baseline.json', import.meta.url), 'utf8'));

let raw;
try {
  raw = execSync('npx eslint . -f json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
} catch (e) {
  // ESLint sai com 1 quando há erro — e há 510. O relatório vem no stdout
  // do mesmo jeito; é ele que interessa.
  raw = e.stdout;
  if (!raw) throw e;
}

const results = JSON.parse(raw);
const errors = results.reduce((n, r) => n + r.errorCount, 0);
const warnings = results.reduce((n, r) => n + r.warningCount, 0);

console.log(`lint: ${errors} erros, ${warnings} avisos — linha de base ${baseline.errors}/${baseline.warnings}`);

if (errors > baseline.errors || warnings > baseline.warnings) {
  console.error(`PIOROU: +${Math.max(0, errors - baseline.errors)} erros, +${Math.max(0, warnings - baseline.warnings)} avisos. Corrija o que foi introduzido; nao suba a linha de base.`);
  process.exit(1);
}

if (errors < baseline.errors || warnings < baseline.warnings) {
  console.log(`melhorou — abaixe lint-baseline.json para ${errors}/${warnings} no mesmo commit, senao o ganho se perde.`);
}
