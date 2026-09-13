// Sintaxe das edge functions, sem Docker e sem Deno.
//
// `supabase/functions/` não passa pelo `tsc` (o tsconfig inclui só `src`) nem
// pelo eslint. Em 2026-09-13 um `??` misturado com `||` sem parênteses — erro
// de sintaxe, não de tipo — atravessou lint, testes, build e navegação real: a
// função não subiria, e a tela desenhava "não conectado" do mesmo jeito.
//
// O portão de verdade é o `deno check` do CI, que confere tipos também. Este
// script é a rede local de quem não tem o Deno instalado: pega o que impede o
// módulo de carregar, que é a classe de erro mais cara.
//
// Uso:  node scripts/edge-sintaxe.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('../supabase/functions', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const funcoes = readdirSync(RAIZ, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_'))
  .map(d => d.name)
  .filter(nome => existsSync(join(RAIZ, nome, 'index.ts')));

let ruins = 0;
for (const nome of funcoes) {
  try {
    execFileSync('npx', [
      '--yes', 'esbuild@0.24.0', '--log-level=warning', '--bundle',
      '--platform=neutral', '--external:https://*', '--external:npm:*',
      '--outfile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
      join(RAIZ, nome, 'index.ts'),
    ], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' });
    console.log(`ok   ${nome}`);
  } catch (e) {
    ruins++;
    console.error(`ERRO ${nome}`);
    console.error(String(e.stderr ?? e.message).trim().split('\n').slice(0, 6).map(l => '     ' + l).join('\n'));
  }
}

console.log(`\n${funcoes.length} função(ões), ${ruins} com erro.`);
if (ruins > 0) process.exit(1);
