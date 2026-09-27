// Onde estão as cores fixas que travam o modo escuro (leva J).
//
// `npm run lint` diz QUANTAS são (425 avisos de `helpoint/cor-fixa`); esta lista
// diz ONDE, agrupado por arquivo e ordenado pelo que dói mais — sem isso, o
// trabalho começa pelo arquivo que estava aberto, e não pelo que aparece mais na
// tela.
//
// Uso: node scripts/cor-fixa-por-arquivo.mjs [quantos]
import { ESLint } from 'eslint';

const quantos = Number(process.argv[2] ?? 30);
const eslint = new ESLint();
const resultados = await eslint.lintFiles(['src']);

const porArquivo = new Map();
const porClasse = new Map();

for (const r of resultados) {
  const avisos = r.messages.filter((m) => m.ruleId === 'helpoint/cor-fixa');
  if (avisos.length === 0) continue;
  const relativo = r.filePath.replace(process.cwd() + '\\', '').replace(/\\/g, '/');
  porArquivo.set(relativo, avisos.length);
  for (const a of avisos) {
    // A mensagem não traz a classe; o texto da linha traz. Pega as classes
    // Tailwind de paleta fixa que a regra acusa.
    const linha = (r.source ?? '').split('\n')[a.line - 1] ?? '';
    for (const m of linha.matchAll(/\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g)) {
      porClasse.set(m[0], (porClasse.get(m[0]) ?? 0) + 1);
    }
  }
}

const total = [...porArquivo.values()].reduce((s, n) => s + n, 0);
console.log(`${total} avisos de cor fixa em ${porArquivo.size} arquivos.\n`);

console.log(`Os ${quantos} arquivos que mais concentram:`);
for (const [arquivo, n] of [...porArquivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, quantos)) {
  console.log(`  ${String(n).padStart(3)}  ${arquivo}`);
}

const quantasClasses = Number(process.argv[3] ?? 25);
console.log(`\nAs classes mais repetidas (o que um token resolveria de uma vez):`);
for (const [classe, n] of [...porClasse.entries()].sort((a, b) => b[1] - a[1]).slice(0, quantasClasses)) {
  console.log(`  ${String(n).padStart(3)}  ${classe}`);
}
console.log(`\n(${porClasse.size} classes distintas no total.)`);
