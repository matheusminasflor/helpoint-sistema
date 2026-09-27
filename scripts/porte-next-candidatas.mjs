// Quais telas o passo 2 do porte alcança HOJE (leva L — 2026-09-26).
//
// A REGRA DO PASSO 2, escrita em `docs/plano-geral.md`: *uma tela vira rota do
// Next quando deixa de precisar do roteador.* Só que "precisar" é transitivo, e
// foi por aí que eu quase errei: `grep react-router-dom src/telas/*` devolve 28
// telas "limpas", e a primeira que eu abri (`FinSettings`) chama `useFinImports`
// — banco, react-query, sessão. Ela não é candidata a nada: componente de
// servidor não tem sessão do usuário.
//
// Então o que este script mede é o FECHO: partindo da tela, segue todo import
// local (`@/…` e `./…`) e responde se em algum ponto o caminho encosta em
//
//   - `react-router-dom`   → a tela navega, ou algo que ela desenha navega;
//   - o cliente do Supabase / react-query → precisa de sessão no navegador;
//   - `AuthContext` / `useAuth` → idem, explicitamente;
//   - `useState`/`useEffect`/`onClick` → precisa ser componente de cliente
//     (isso NÃO impede a rota do Next: impede só o ganho de virar servidor).
//
// A saída separa as três situações, porque elas têm remédios diferentes:
//
//   SERVIDOR  — nada de cliente no fecho. Vira rota do Next igual `/termos`, com
//               HTML pronto. É o ganho de verdade.
//   CLIENTE   — precisa de estado ou sessão, mas NÃO do roteador. Pode virar rota
//               do Next com `'use client'`: ganha o endereço próprio e o pedaço
//               próprio, não ganha o HTML pronto.
//   FICA      — encosta no roteador. Continua na rota coringa até alguém trocar
//               `navigate`/`<Link>` por `<a href>` — o que só vale quando a
//               navegação daquela tela não perde nada com a ida ao servidor.
//
// Uso: node scripts/porte-next-candidatas.mjs [--detalhe <arquivo>]
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const RAIZ = process.cwd();
const detalhe = process.argv.includes('--detalhe') ? process.argv[process.argv.indexOf('--detalhe') + 1] : null;

/** O que torna o módulo dependente do navegador, e por quê. */
const MARCAS = [
  ['roteador', /from '(react-router-dom)'/],
  ['sessão', /from '@\/contexts\/AuthContext'|useAuth\(/],
  ['banco', /from '@\/integrations\/supabase\/client'|from '@tanstack\/react-query'/],
  ['estado', /\buse(State|Effect|Reducer|Ref|Callback|Memo|LayoutEffect)\b|onClick=|onChange=|onSubmit=/],
];

/** Resolve um import local para um arquivo de verdade; `null` para pacote externo. */
function resolver(espec, deQuem) {
  let base;
  if (espec.startsWith('@/')) base = join(RAIZ, 'src', espec.slice(2));
  else if (espec.startsWith('.')) base = resolve(dirname(deQuem), espec);
  else return null;

  for (const tent of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(tent) && !tent.endsWith('/')) {
      try { if (readFileSync(tent).length >= 0) return tent; } catch { /* diretório */ }
    }
  }
  return null;
}

const cache = new Map();

/** As marcas encontradas no fecho de `arquivo`, cada uma com o módulo que a trouxe. */
function marcasDoFecho(arquivo) {
  const achados = new Map();
  const vistos = new Set();
  const fila = [arquivo];

  while (fila.length) {
    const atual = fila.shift();
    if (vistos.has(atual)) continue;
    vistos.add(atual);

    let texto;
    try { texto = cache.get(atual) ?? readFileSync(atual, 'utf8'); } catch { continue; }
    cache.set(atual, texto);

    for (const [marca, re] of MARCAS) {
      if (re.test(texto) && !achados.has(marca)) achados.set(marca, atual);
    }

    for (const m of texto.matchAll(/from '([^']+)'/g)) {
      const alvo = resolver(m[1], atual);
      if (alvo) fila.push(alvo);
    }
  }
  return { achados, tamanho: vistos.size };
}

// Sem glob no comando: `git ls-files` roda pelo cmd.exe no Windows, e lá as aspas
// simples não agrupam — o glob chegava literal e a lista vinha vazia.
const telas = execSync('git ls-files src/telas', { encoding: 'utf8' })
  .split('\n').filter((l) => l.endsWith('.tsx'));

if (detalhe) {
  const { achados, tamanho } = marcasDoFecho(resolve(RAIZ, detalhe));
  console.log(`${detalhe} — ${tamanho} módulos no fecho`);
  for (const [marca, onde] of achados) console.log(`  ${marca.padEnd(9)} veio de ${onde.replace(`${RAIZ}\\`, '').replace(/\\/g, '/')}`);
  if (achados.size === 0) console.log('  nada de cliente: pode virar componente de SERVIDOR.');
  process.exit(0);
}

const grupos = { SERVIDOR: [], CLIENTE: [], FICA: [] };

for (const tela of telas) {
  const { achados } = marcasDoFecho(resolve(RAIZ, tela));
  const grupo = achados.has('roteador') ? 'FICA' : achados.size > 0 ? 'CLIENTE' : 'SERVIDOR';
  grupos[grupo].push([tela, [...achados.keys()].join(', ')]);
}

for (const [grupo, lista] of Object.entries(grupos)) {
  console.log(`\n${grupo}: ${lista.length} tela(s)`);
  for (const [tela, marcas] of lista) console.log(`  ${tela}${marcas ? `  — ${marcas}` : ''}`);
}
console.log(`\ntotal ${telas.length} telas.`);
