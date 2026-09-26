// Lista as funções que alguma migration FECHOU de propósito para
// `public, anon, authenticated` — as que só devem ser chamadas de dentro de
// outra função `security definer`, de gatilho, ou pelo `service_role`.
//
// POR QUE EXISTE. Na leva B eu escrevi um `grant execute ... to authenticated`
// em laço sobre todas as funções não-gatilho, para preservar quem já podia
// (28 dependiam de PUBLIC). Só que "preservar" virou "conceder": o laço não
// testava se a função já era alcançável — e **reabriu 24 funções que migrations
// anteriores tinham fechado a dedo**, cada uma por causa de uma auditoria.
//
// O CI pegou duas, porque só duas tinham asserção de pgTAP:
//   automacoes_modelos.test.sql            → automation_subject_row
//   crm_segmentos_tabelas_portoes.test.sql → crm_gate_label
//
// As outras 22 teriam passado em silêncio. Este script existe para a lista ser
// LIDA do repositório em vez de lembrada, e alimenta a asserção da suíte
// `anon_so_nas_portas_publicas.test.sql`.
//
// Uso: node scripts/funcoes-so-por-dentro.mjs [--sql]
//   sem argumento: um nome por linha
//   --sql: os `revoke` prontos, para reparar um banco onde o grant errado entrou
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const MINHA = '20261028010000_anon_sai_das_rpcs.sql';

// `revoke all on function public.x(args) from public, anon, authenticated;`
// e `revoke execute on function public.x(args) from public, anon, authenticated;`
// — as duas formas que o repositório usa. A assinatura importa: há sobrecarga
// (`crm_modelo_bloqueado_ate` tem duas, e só a de dois argumentos é fechada).
const RE = /revoke\s+(?:all|execute)\s+on\s+function\s+(public\.[a-z_]+\s*\(([^)]*)\))\s*from\s+([^;]+);/gi;

const achados = new Map(); // assinatura → arquivo

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
  if (f === MINHA) continue; // a minha é a que repara, não a que define
  const texto = readFileSync(join(DIR, f), 'utf8');
  for (const m of texto.matchAll(RE)) {
    const alvos = m[3].toLowerCase();
    // Só interessa quando `authenticated` está entre os revogados: revoke que
    // tira apenas de `public, anon` não fecha a porta de quem está logado.
    if (!alvos.includes('authenticated')) continue;
    const assinatura = m[1].replace(/\s+/g, ' ').trim();
    if (!achados.has(assinatura)) achados.set(assinatura, f);
  }
}

const lista = [...achados.entries()].sort((a, b) => a[0].localeCompare(b[0]));

if (process.argv.includes('--sql')) {
  for (const [assinatura] of lista) {
    console.log(`revoke all on function ${assinatura} from public, anon, authenticated;`);
  }
} else {
  console.log(`${lista.length} função(ões) fechada(s) de propósito por migration anterior:\n`);
  for (const [assinatura, arquivo] of lista) {
    console.log(`  ${assinatura}`);
    console.log(`      ${arquivo}`);
  }
  console.log('\nNomes (sem assinatura), para a asserção do pgTAP:');
  const nomes = [...new Set(lista.map(([a]) => a.replace(/^public\./, '').replace(/\s*\(.*$/, '')))].sort();
  console.log(nomes.map((n) => `'${n}'`).join(', '));
}
