// Confere, para TODA suíte pgTAP do repositório, se o acumulador embrulha
// cada chamada de asserção. Uma chamada não embrulhada RODA no banco mas o
// resultado nunca é capturado — ou seja, uma asserção que falha pode não
// aparecer, e a suíte "passa".
//
// É a mesma família do que esta sessão vem perseguindo: o teste verde que
// não prova nada. Só que um degrau abaixo — na ferramenta que roda o teste.
//
// Uso: node scripts/pgtap-conferir-embrulho.mjs
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PASTA = 'supabase/tests/database';
const ASSERTS = [
  'plan', 'finish', 'ok', 'is', 'isnt', 'matches', 'imatches', 'alike', 'cmp_ok',
  'throws_ok', 'lives_ok', 'throws_like', 'performs_ok',
  'results_eq', 'results_ne', 'set_eq', 'bag_eq', 'is_empty',
  'has_table', 'has_column', 'has_function', 'has_view', 'has_index',
  'hasnt_table', 'hasnt_column', 'hasnt_function', 'hasnt_view', 'hasnt_index',
  'col_is_pk', 'col_is_fk', 'enum_has_labels', 'policies_are', 'pass', 'fail',
];

// Uma chamada de asserção "de nível 0": começa um statement.
const CHAMADA = new RegExp(`(^|;)\\s*(--[^\\n]*\\n\\s*)*select\\s+(\\*\\s+from\\s+)?(${ASSERTS.join('|')})\\s*\\(`, 'gi');

const suites = readdirSync(PASTA)
  .filter((f) => f.endsWith('.test.sql'))
  .map((f) => f.replace(/\.test\.sql$/, ''));

let problemas = 0;
for (const suite of suites) {
  let montado, acumulado;
  try {
    montado = execFileSync('node', ['scripts/pgtap-um-teste.mjs', suite], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    acumulado = execFileSync('node', ['scripts/pgtap-acumular.mjs'], { input: montado, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.log(`${suite.padEnd(38)} ERRO ao montar: ${e.message.split('\n')[0]}`);
    problemas++;
    continue;
  }

  const chamadas = [...montado.matchAll(CHAMADA)].length;
  const embrulhadas = [...acumulado.matchAll(/insert into pgtap_out\(line\)/g)].length;
  const ok = chamadas === embrulhadas;
  if (!ok) problemas++;
  console.log(
    `${suite.padEnd(38)} chamadas ${String(chamadas).padStart(3)} · embrulhadas ${String(embrulhadas).padStart(3)}  ${ok ? 'ok' : '*** PERDEU ' + (chamadas - embrulhadas) + ' ***'}`,
  );
}

console.log(problemas === 0
  ? '\nToda chamada de asserção é capturada.'
  : `\n${problemas} suíte(s) com asserção que roda e não é capturada.`);
process.exitCode = problemas === 0 ? 0 : 1;
