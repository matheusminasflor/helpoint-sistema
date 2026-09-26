// Resume a saída de `get_advisors` do Supabase: ela vem como um JSON enorme
// (115 mil caracteres numa linha só) que não cabe em contexto e que o `Read`
// não fatia, porque a linha é longa demais.
//
// Cada aviso do Supabase é UM item com a lista de objetos afetados dentro do
// `detail`/`description` — então contar itens engana (parecem 5 avisos quando
// são centenas de objetos). Isto imprime a contagem por tipo e, com o segundo
// argumento, o texto inteiro do tipo pedido.
//
// Uso: node scripts/resumir-advisors.mjs <arquivo.txt> [nome-do-aviso]
import { readFileSync } from 'node:fs';

const [arquivo, filtro] = process.argv.slice(2);
if (!arquivo) {
  console.error('uso: node scripts/resumir-advisors.mjs <arquivo.txt> [nome-do-aviso]');
  process.exit(1);
}

const bruto = readFileSync(arquivo, 'utf8');

function extrairJson(texto) {
  const i = texto.indexOf('{');
  const f = texto.lastIndexOf('}');
  if (i === -1 || f === -1) return null;
  try {
    return JSON.parse(texto.slice(i, f + 1));
  } catch {
    return null;
  }
}

const dados = extrairJson(bruto);
if (!dados) {
  console.error('não consegui ler o JSON; primeiros 200 caracteres:');
  console.error(bruto.slice(0, 200));
  process.exit(2);
}

const lints = dados.lints ?? dados.result?.lints ?? [];
if (!Array.isArray(lints) || lints.length === 0) {
  console.log('nenhum aviso na saída.');
  process.exit(0);
}

console.log(`${lints.length} tipo(s) de aviso:\n`);
for (const l of lints) {
  const texto = String(l.detail ?? l.description ?? '');
  // Quantos objetos o aviso cita: o Supabase lista em texto, separado por
  // vírgula ou por backtick. Contar backticks dá a ordem de grandeza sem
  // depender do formato exato.
  const citados = (texto.match(/`[^`]+`/g) ?? []).length;
  console.log(`${String(l.level ?? '?').padEnd(5)} ${l.name ?? '?'} — ${citados} objeto(s) citado(s)`);
}

if (filtro) {
  console.log('');
  for (const l of lints) {
    if (!String(l.name ?? '').toLowerCase().includes(filtro.toLowerCase())) continue;
    console.log(`── ${l.level} · ${l.name} ──`);
    // Os objetos afetados NÃO moram no `detail` (que é o texto genérico do
    // aviso) — moram num campo próprio cujo nome varia por versão. Então imprime
    // o item inteiro, menos os campos longos que já foram mostrados.
    const { detail, description, remediation, ...resto } = l;
    console.log(String(detail ?? description ?? '(sem detalhe)'));
    console.log(JSON.stringify(resto, null, 2).slice(0, 4000));
    console.log('');
  }
}
