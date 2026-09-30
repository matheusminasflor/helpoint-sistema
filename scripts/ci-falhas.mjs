// As execuções recentes do GitHub Actions que NÃO passaram — de onde vêm os e-mails de falha que o
// dono recebe. Mostra o nome, o motivo que disparou, o branch e a data. O token vem do
// `git credential fill` (o mesmo do push); nada é gravado.
// Uso: node scripts/ci-falhas.mjs [quantas=40]
import { execSync } from 'node:child_process';

const quantas = Number(process.argv[2] ?? 40);
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) { console.error('sem credencial do GitHub'); process.exit(1); }

const repo = 'matheusminasflor/helpoint-sistema';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-falhas' };
const { workflow_runs: runs = [] } = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=${quantas}`, { headers }).then((r) => r.json());

const contagem = {};
for (const r of runs) {
  const chave = `${r.name} · ${r.event} · ${r.conclusion ?? r.status}`;
  contagem[chave] = (contagem[chave] ?? 0) + 1;
}
console.log(`Últimas ${runs.length} execuções:`);
for (const [k, n] of Object.entries(contagem)) console.log(`  ${n}× ${k}`);
console.log('\nAs que não passaram:');
for (const r of runs.filter((x) => x.conclusion && x.conclusion !== 'success' && x.conclusion !== 'skipped')) {
  console.log(`  #${r.run_number} ${r.created_at.slice(0, 16)} ${r.name} [${r.event}, ${r.head_branch}] → ${r.conclusion}  ${r.html_url}`);
}
