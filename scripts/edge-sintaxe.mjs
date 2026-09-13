// Sintaxe das edge functions — o portão que faltava.
//
// `supabase/functions/` não passa pelo `tsc` (o `tsconfig.app.json` inclui só
// `src`) nem pelo eslint. Em 2026-09-13 um `??` misturado com `||` sem
// parênteses — erro de **sintaxe**, não de tipo — atravessou lint, testes,
// build e navegação real: a função não subiria, e a tela desenhava "não
// conectado" do mesmo jeito. Este script pega essa classe de erro, que é a que
// impede o módulo de carregar.
//
// Faz o parse de cada arquivo com o esbuild, **sem** seguir import nenhum: nada
// de rede, nada de `node_modules` de Deno. O que ele não faz é conferir tipos —
// isso continua sem portão, e está registrado em `docs/nao-funciona.md`.
//
// Uso:  node scripts/edge-sintaxe.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../supabase/functions', import.meta.url));

function todosOsTs(dir, fora = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) todosOsTs(caminho, fora);
    else if (nome.endsWith('.ts')) fora.push(caminho);
  }
  return fora;
}

const arquivos = todosOsTs(RAIZ);
if (arquivos.length === 0) {
  console.error('nenhuma edge function encontrada — o caminho mudou?');
  process.exit(1);
}

// Uma invocação só, com todos os arquivos. Sem `--bundle`, que é o padrão: cada
// arquivo é analisado sozinho e os `import` ficam onde estão, sem resolver nada
// — é por isso que não há rede nem `node_modules` de Deno no caminho.
//
// A saída vai para uma pasta temporária e é apagada em seguida. `/dev/null` não
// serve porque o esbuild quer criar um **diretório** quando recebe vários
// arquivos, e no Windows `NUL` não é diretório.
const saidaTmp = mkdtempSync(join(tmpdir(), 'edge-sintaxe-'));
try {
  execFileSync(
    'npx',
    ['--yes', 'esbuild@0.24.0', '--log-level=warning', `--outdir=${saidaTmp}`, ...arquivos],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' },
  );
  console.log(`sintaxe ok — ${arquivos.length} arquivo(s) em supabase/functions/`);
} catch (e) {
  console.error(String(e.stderr ?? e.message).trim().split('\n').slice(0, 30).join('\n'));
  console.error('\nEDGE FUNCTION COM ERRO DE SINTAXE — a função não sobe assim.');
  process.exit(1);
} finally {
  rmSync(saidaTmp, { recursive: true, force: true });
}
