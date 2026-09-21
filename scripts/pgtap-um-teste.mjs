// Monta UM arquivo de teste pgTAP para rodar sem Docker: troca o `\ir
// _helpers.psql` pelo conteúdo do helper e imprime o SQL inteiro, pronto para
// colar num cliente (ou para o agente mandar pelo MCP do Supabase). O arquivo
// já vem com `begin;` e `rollback;`, então nada fica gravado.
//
// Por que existe: `supabase test db` precisa do Docker, e sem ele um teste
// quebrado passa despercebido — foi o que aconteceu na EXP-1 (auditoria de
// 2026-09-12). Com isto dá para rodar o teste contra o `test-helpoint` antes
// de empurrar para o CI.
//
// Uso: node scripts/pgtap-um-teste.mjs expedicao_estoque
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests/database';
const nome = process.argv[2];
if (!nome) { console.error('uso: node scripts/pgtap-um-teste.mjs <nome-do-teste-sem-.test.sql>'); process.exit(1); }

const helpers = readFileSync(join(DIR, '_helpers.psql'), 'utf8');
const teste = readFileSync(join(DIR, `${nome}.test.sql`), 'utf8');

// A função no lugar da string **não é estilo**: é o conserto de um defeito que
// deixou este script produzindo SQL inválido desde sempre.
//
// Na string de substituição de `String.replace`, `$$` é a sequência de escape
// para um `$` literal. O `_helpers.psql` declara as seis funções com
// `as $$ … $$`, então toda saída saía com `as $ … $`, e o Postgres recusava:
//
//   ERROR: 42601: syntax error at or near "$"
//
// Ou seja: **o caminho documentado no CLAUDE.md para provar regra de banco sem
// Docker não funcionava**. Quem seguisse a receita à risca não conseguia rodar
// o teste antes de commitar, e contornava colando o SQL à mão — que foi o que
// aconteceu a sessão inteira, com o sintoma confundido com problema de
// exibição do terminal. Achado da auditoria da L11b, 2026-09-18.
//
// Com a função, `replace` entrega o texto verbatim e nada é interpretado.
process.stdout.write(teste.replace(/^\s*\\ir\s+_helpers\.psql\s*$/m, () => helpers));
