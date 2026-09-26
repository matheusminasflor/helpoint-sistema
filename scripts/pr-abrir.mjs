// Abre um pull request pela API do GitHub, sem `gh` e sem navegador.
//
// Por que existe: a CI deste repositório roda em `push` para `main` e em
// `pull_request`. Mudança que mexe no alicerce — RLS, uma função que está
// embaixo de todas as policies — não deve ir direto para a `main`, porque a
// única prova real é a suíte inteira contra um banco do zero, e é o job `banco`
// que faz isso. Sem PR, empurrar a branch não dispara nada, e o `gh` não está
// instalado nesta máquina.
//
// O token vem do `git credential fill`, o mesmo que o push usa; nada é gravado.
//
// Uso: node scripts/pr-abrir.mjs "<titulo>" [arquivo-com-o-corpo] [branch-base]
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [titulo, arquivoCorpo, base = 'main'] = process.argv.slice(2);
if (!titulo) {
  console.error('uso: node scripts/pr-abrir.mjs "<titulo>" [arquivo-com-o-corpo] [base]');
  process.exit(1);
}

const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (branch === base) {
  console.error(`a branch atual é a própria base (${base}): nada para abrir`);
  process.exit(1);
}

const corpo = arquivoCorpo
  ? readFileSync(arquivoCorpo, 'utf8')
  : execSync('git log -1 --pretty=%B', { encoding: 'utf8' });

const cred = execSync('git credential fill', {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
});
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exit(1);
}

const repo = 'matheusminasflor/helpoint-sistema';
const resposta = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'helpoint-pr-abrir',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ title: titulo, head: branch, base, body: corpo }),
});

const dados = await resposta.json();
if (!resposta.ok) {
  // O caso comum: já existe PR aberto para esta branch. Aí o útil é o link dele,
  // e não o erro.
  console.error(`falhou (${resposta.status}): ${dados?.message ?? 'sem mensagem'}`);
  for (const e of dados?.errors ?? []) console.error(`  - ${e.message ?? JSON.stringify(e)}`);
  process.exit(1);
}

console.log(`PR #${dados.number}: ${dados.html_url}`);
