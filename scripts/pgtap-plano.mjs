// Confere, em todo teste pgTAP, se o `plan(N)` bate com o número de asserções.
// Plano errado = "Looks like you planned N tests but ran M" e o pg_prove reprova
// o arquivo inteiro — a auditoria de 2026-09-12 pegou um assim, e desconfiou de
// outros dois. Roda em um segundo; vale antes de todo commit que mexe em teste.
//
// Uso: node scripts/pgtap-plano.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests/database';
// As funções de asserção do pgTAP que este repositório usa. Cada uma começa a
// própria linha (`select is(`), então contar linhas de início basta.
const ASSERTS = [
  'ok', 'is', 'isnt', 'matches', 'imatches', 'alike', 'cmp_ok',
  'throws_ok', 'lives_ok', 'throws_like', 'performs_ok',
  'results_eq', 'results_ne', 'set_eq', 'bag_eq', 'is_empty',
  'has_table', 'has_column', 'has_function', 'has_view', 'has_index',
  // Os opostos das cinco acima. Faltavam, e a falta **reprovava teste bom**:
  // a asserção não era reconhecida, o contador ficava abaixo do `plan(N)` e o
  // arquivo aparecia como "plano errado". Provar que algo **deixou de existir**
  // é asserção como qualquer outra — foi assim que a ADR-010 provou que a
  // função de criar empresa saiu do banco.
  'hasnt_table', 'hasnt_column', 'hasnt_function', 'hasnt_view', 'hasnt_index',
  'col_is_pk', 'col_is_fk', 'enum_has_labels', 'policies_are', 'pass', 'fail',
];
const START = new RegExp(`^\\s*select\\s+(${ASSERTS.join('|')})\\s*\\(`, 'i');

let bad = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.test.sql')).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  const planLine = lines.find((l) => /^\s*select\s+plan\s*\(/i.test(l));
  if (!planLine) { console.log(`${file}: SEM plan()`); bad++; continue; }
  const plan = Number(/plan\s*\(\s*(\d+)\s*\)/i.exec(planLine)?.[1]);
  const found = lines.filter((l) => START.test(l)).length;
  const ok = plan === found;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${file}: plan(${plan}) e ${found} asserções`);
}
if (bad) {
  console.error(`\n${bad} arquivo(s) com plano errado — o pg_prove reprova cada um deles.`);
  process.exit(1);
}
console.log('\nTodos os planos batem.');
