// Divide o pacote por rota: `import X from '@/telas/X'` vira `lazy(...)`
// (leva L, passo 4 — 2026-09-26).
//
// POR QUE ISTO É O PASSO 4 E NÃO UM ENFEITE. O build do Vite sai com UM pedaço de
// **4,1 MB** (o plano dizia 3,4; cresceu). Quem abre o Login baixa o RH, o
// Comercial, a Diretoria, o editor de automações e a biblioteca de gráficos — tudo,
// para ver um formulário de e-mail e senha. É a mesma conta no Next, e é o que
// `docs/plano-geral.md` chamava de "vem de graça no caminho".
//
// O QUE ELE NÃO TOCA, de propósito:
//
//   - os **guardas** (`StaffRoute`, `RequireDiretoria`, `RequireComercial`,
//     `RequireOwnerOrAdmin`) e as **views** de chamado (`CollaboratorView`,
//     `TechnicianView`): eles decidem SE a tela aparece, e carregar isso em pedaço
//     separado poria um piscar entre "entrei" e "posso";
//   - `NotFound` e `EmConstrucao`: são o fallback. Um fallback que precisa baixar
//     um pedaço para dizer "não existe" é o pior momento para uma espera.
//
// Uso: node scripts/porte-next-lazy.mjs [--aplicar]
import { readFileSync, writeFileSync } from 'node:fs';

const ARQUIVO = 'src/routes/StaffAppRoutes.tsx';
const aplicar = process.argv.includes('--aplicar');

/** Ficam diretos: fallback e o que decide acesso. Ver o comentário acima. */
const DIRETOS = new Set(['EmConstrucao', 'NotFound', 'Dashboard']);

const texto = readFileSync(ARQUIVO, 'utf8');
const linhas = texto.split('\n');

const lazies = [];
const mantidas = [];

for (const linha of linhas) {
  const m = /^import\s+(\w+)\s+from\s+'(@\/telas\/[^']+)';$/.exec(linha);
  if (!m) { mantidas.push(linha); continue; }
  const [, nome, caminho] = m;
  if (DIRETOS.has(nome)) { mantidas.push(linha); continue; }
  lazies.push(`const ${nome} = lazy(() => import('${caminho}'));`);
}

if (lazies.length === 0) {
  console.log('nada a converter — já está por rota.');
  process.exit(0);
}

// O `lazy` entra no import do react (primeira linha de import do arquivo), e o
// bloco de `const` fica junto, depois dos imports — em vez de espalhado.
const saida = mantidas.join('\n').replace(
  /^import \{ Routes, Route, Navigate, useParams \} from 'react-router-dom';$/m,
  [
    "import { Suspense, lazy } from 'react';",
    "import { Routes, Route, Navigate, useParams } from 'react-router-dom';",
  ].join('\n'),
);

const comLazies = saida.replace(
  /^(export function StaffAppRoutes\(\) \{)/m,
  [
    '// ── Uma tela, um pedaço (leva L, passo 4) ──────────────────────────────────',
    '// Antes daqui eram 76 imports diretos, e o pacote saía com 4,1 MB num pedaço',
    '// só: quem abria o Login baixava o RH, o Comercial e a Diretoria para ver um',
    '// formulário. `lazy` faz cada tela virar um pedaço que chega quando alguém',
    '// abre a rota dela. O que decide acesso continua direto — ver o script.',
    ...lazies,
    '',
    '$1',
  ].join('\n'),
);

console.log(`${lazies.length} telas convertidas para carregamento por rota${aplicar ? '' : ' (nada gravado — use --aplicar)'}.`);
if (aplicar) writeFileSync(ARQUIVO, comLazies);
