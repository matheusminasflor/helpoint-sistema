// O log dos jobs que falharam no CI de um commit, filtrado pelas linhas de erro. Complementa o `ci-status.mjs` quando
// não há o `gh` na máquina. Uso: node scripts/ci-log.mjs [sha] [padrão]   (padrão padrão: erro do Postgres e do pgTAP)
import { execSync } from 'node:child_process';

const sha = execSync(`git rev-parse ${process.argv[2] ?? 'HEAD'}`, { encoding: 'utf8' }).trim();
const padrao = new RegExp(process.argv[3] ?? 'ERROR|error:|SQLSTATE|not ok|Failed|# Looks like', 'i');
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exitCode = 1;
} else {
  const repo = 'matheusminasflor/helpoint-sistema';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-log' };
  const runs = await fetch(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=5`, { headers }).then((r) => r.json());
  for (const run of runs.workflow_runs ?? []) {
    const jobs = await fetch(run.jobs_url, { headers }).then((r) => r.json());
    for (const job of (jobs.jobs ?? []).filter((j) => j.conclusion === 'failure')) {
      const texto = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`, { headers }).then((r) => r.text());
      console.log(`=== ${job.name}`);
      console.log(texto.split('\n').filter((l) => padrao.test(l)).slice(0, 40).join('\n'));
    }
  }
}
