// Espera o run do CI de um commit no `main` e imprime o resultado. Token vem do
// `git credential fill` (o mesmo que o push usa); nada é gravado.
// Uso: node scripts/ci-esperar.mjs <sha> [minutos-max]
import { execSync } from 'node:child_process';

const [sha, maxMin = '12'] = process.argv.slice(2);
if (!sha) {
  console.error('uso: node scripts/ci-esperar.mjs <sha> [minutos-max]');
  process.exit(1);
}
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exit(1);
}
const repo = 'matheusminasflor/helpoint-sistema';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-esperar' };
const deadline = Date.now() + Number(maxMin) * 60_000;
while (Date.now() < deadline) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=5`, { headers });
  const body = await res.json();
  const run = body.workflow_runs?.[0];
  if (run) {
    const line = `${run.name} #${run.run_number} ${run.status} ${run.conclusion ?? ''} ${run.html_url}`;
    if (run.status === 'completed') {
      console.log(line);
      if (run.conclusion !== 'success') {
        const jobs = await fetch(run.jobs_url, { headers }).then((r) => r.json());
        for (const j of jobs.jobs ?? []) {
          const failed = (j.steps ?? []).filter((s) => s.conclusion === 'failure').map((s) => s.name);
          console.log(`  job ${j.name}: ${j.conclusion}${failed.length ? ` — passos: ${failed.join(', ')}` : ''}`);
        }
      }
      process.exit(run.conclusion === 'success' ? 0 : 2);
    }
    console.log(`... ${line}`);
  } else {
    console.log('... sem run ainda');
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
console.log('tempo esgotado');
process.exit(3);
