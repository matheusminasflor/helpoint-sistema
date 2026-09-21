// Empacota a saída de um teste pgTAP (já montado por pgtap-um-teste.mjs) para
// rodar pelo MCP do Supabase (`execute_sql`) sem Docker.
//
// Por que existe: o MCP roda um bloco de SQL como uma única ida ao banco, e
// quando o bloco tem vários `select` separados por `;`, só o resultado do
// ÚLTIMO volta — confirmado na prática (`select 1; select 2;` devolve só o
// 2). Um teste pgTAP tem uma linha de TAP por `select is(...)/plan(...)/...`;
// se só a última voltasse, cada falha exigiria rodar o arquivo de novo até
// isolar a asserção quebrada.
//
// A saída: envolve cada chamada que PRODUZ linha de TAP (plan, is, isnt, ok,
// throws_ok, finish, ...) num `insert into pgtap_out(line) select ...`, e
// troca o `select * from finish(); rollback;` do fim por um `select * from
// pgtap_out order by id;` ANTES do rollback — assim a única coisa que volta
// é a suíte inteira, linha por linha, e nada fica gravado no banco.
//
// Uso: node scripts/pgtap-um-teste.mjs <nome> | node scripts/pgtap-acumular.mjs
import { readFileSync } from 'node:fs';

const ASSERTS = [
  'plan', 'finish',
  'ok', 'is', 'isnt', 'matches', 'imatches', 'alike', 'cmp_ok',
  'throws_ok', 'lives_ok', 'throws_like', 'performs_ok',
  'results_eq', 'results_ne', 'set_eq', 'bag_eq', 'is_empty',
  'has_table', 'has_column', 'has_function', 'has_view', 'has_index',
  'hasnt_table', 'hasnt_column', 'hasnt_function', 'hasnt_view', 'hasnt_index',
  'col_is_pk', 'col_is_fk', 'enum_has_labels', 'policies_are', 'pass', 'fail',
];
// `select plan(N);`, `select is(...);`, `select * from finish();` — as duas
// formas que o arquivo usa para chamar uma função pgTAP.
const TAP_CALL = new RegExp(`^select\\s+(\\*\\s+from\\s+)?(${ASSERTS.join('|')})\\s*\\(`, 'i');

// Divide em statements de nível 0, sem se confundir com `;` dentro de
// string ('...'), dollar-quote ($$...$$, $sql$...$sql$, $items$...$items$)
// ou comentário de linha (-- ...). É a mesma classe de problema que
// pgtap-um-teste.mjs já resolveu para `\ir` — aqui o alvo é `;`.
function dividirEmStatements(sql) {
  const statements = [];
  let atual = '';
  let i = 0;
  let dollarTag = null; // null = fora de dollar-quote; senão, a tag inteira ($$, $sql$, ...)
  let emStringSimples = false;
  let emComentario = false;

  while (i < sql.length) {
    const c = sql[i];
    const resto = sql.slice(i);

    if (emComentario) {
      atual += c;
      if (c === '\n') emComentario = false;
      i++;
      continue;
    }
    if (dollarTag) {
      if (resto.startsWith(dollarTag)) {
        atual += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      atual += c;
      i++;
      continue;
    }
    if (emStringSimples) {
      atual += c;
      if (c === "'") emStringSimples = false;
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') { emComentario = true; atual += c; i++; continue; }
    if (c === "'") { emStringSimples = true; atual += c; i++; continue; }
    if (c === '$') {
      const m = /^\$[a-zA-Z_]*\$/.exec(resto);
      if (m) { dollarTag = m[0]; atual += m[0]; i += m[0].length; continue; }
    }
    if (c === ';') {
      statements.push(atual.trim());
      atual = '';
      i++;
      continue;
    }
    atual += c;
    i++;
  }
  if (atual.trim()) statements.push(atual.trim());
  return statements;
}

const entrada = readFileSync(0, 'utf8'); // stdin — encadeia com pgtap-um-teste.mjs
const statements = dividirEmStatements(entrada);

const saida = [];
let acumuladorCriado = false;
let rollbackVisto = false;

for (const stmt of statements) {
  if (!stmt) continue;

  // Cada statement pode chegar com comentários de linha inteira grudados na
  // frente (o texto entre o `;` anterior e o comando de verdade) — testa o
  // tipo pelo NÚCLEO, sem esses comentários, mas mantém o statement inteiro
  // (comentários inclusos) na saída, porque `insert into t(x) -- nota\n
  // select ...` é SQL válido e não vale a pena reescrever.
  const nucleo = stmt.replace(/^(\s*--[^\n]*\n)+/g, '').trim();

  if (/^rollback$/i.test(nucleo)) {
    // Antes do rollback: a única leitura que volta pro MCP.
    saida.push('select line from pgtap_out order by id');
    saida.push(stmt);
    rollbackVisto = true;
    continue;
  }

  if (/^begin$/i.test(nucleo)) {
    saida.push(stmt);
    // O acumulador nasce logo depois do begin — vive só dentro da
    // transação, como qualquer outra tabela temporária da suíte. O GRANT é
    // necessário porque `tests.authenticate_as` troca o papel para
    // `authenticated` (regra 1 do pgTAP: SET ROLE), e sem ele o INSERT do
    // acumulador falha com "permission denied for table pgtap_out" assim
    // que a primeira asserção roda autenticada — mesma classe de problema
    // que o `grant select on f, u, perfil to authenticated` já resolve
    // para as tabelas de fixture.
    saida.push('create temporary table pgtap_out (id serial primary key, line text)');
    saida.push('grant insert, select on pgtap_out to authenticated, anon, service_role');
    // `serial` cria uma sequence própria (pgtap_out_id_seq) — sem USAGE
    // nela o INSERT autenticado falha em "permission denied for sequence",
    // um degrau depois do erro de tabela que o grant acima já resolveu.
    saida.push('grant usage, select on sequence pgtap_out_id_seq to authenticated, anon, service_role');
    acumuladorCriado = true;
    continue;
  }

  if (TAP_CALL.test(nucleo)) {
    // `select is(...)`  →  `insert into pgtap_out(line) select is(...)`
    // `select * from finish()` → idem, mesma forma.
    saida.push(`insert into pgtap_out(line) ${stmt}`);
    continue;
  }

  saida.push(stmt);
}

if (!acumuladorCriado) {
  console.error('pgtap-acumular: não achei "begin;" no início do arquivo — nada para acumular.');
  process.exit(1);
}
if (!rollbackVisto) {
  console.error('pgtap-acumular: não achei "rollback;" no fim do arquivo — recusando gerar SQL sem ele.');
  process.exit(1);
}

process.stdout.write(saida.join(';\n') + ';\n');
