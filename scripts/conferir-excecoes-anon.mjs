// Confere que toda função citada na lista de exceções da migration
// `20261028010000_anon_sai_das_rpcs.sql` é CRIADA por alguma migration do
// repositório.
//
// Por que existe: aquela migration levanta exceção se um nome da lista não
// existir no banco. Isso é bom (erro alto em vez de silêncio), mas se alguma
// dessas funções só existir no `test-helpoint` porque foi criada à mão no painel,
// o CI — que roda as migrations num banco do zero — reprova, e eu só descubro
// depois do push. Esta conferência é a mesma pergunta, feita antes.
//
// Uso: node scripts/conferir-excecoes-anon.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const MIGRATION = '20261028010000_anon_sai_das_rpcs.sql';

const texto = readFileSync(join(DIR, MIGRATION), 'utf8');

// Os nomes moram em três `array[...]` do bloco `declare`. Pega o que está entre
// aspas simples dentro de cada um.
function listaDeclarada(nomeDaVariavel) {
  const re = new RegExp(`${nomeDaVariavel}\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, 'i');
  const m = re.exec(texto);
  if (!m) return null;
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

const publicas = listaDeclarada('v_publicas');
const daRls = listaDeclarada('v_da_rls');
const soPorDentro = listaDeclarada('v_so_por_dentro');

if (!publicas || !daRls || !soPorDentro) {
  console.error('não achei as três listas na migration — o formato do `declare` mudou?');
  process.exit(2);
}

const nomes = [...publicas, ...daRls, ...soPorDentro];

// Todo o SQL das migrations, concatenado. Procurar `create ... function
// public.<nome>(` cobre `create function` e `create or replace function`.
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')
  .toLowerCase();

const semMigration = nomes.filter((n) => !sql.includes(`function public.${n}(`) && !sql.includes(`function ${n}(`));

console.log(`${nomes.length} exceção(ões): ${publicas.length} públicas, ${daRls.length} da RLS, ${soPorDentro.length} só por dentro.`);
if (semMigration.length === 0) {
  console.log('Todas são criadas por migration — o CI vai encontrá-las no banco do zero.');
  process.exit(0);
}
console.error('\nNÃO criadas por nenhuma migration (o CI vai reprovar):');
for (const n of semMigration) console.error(`  ${n}`);
process.exit(1);
