// Traz o log de um job do CI que falhou, sem abrir o navegador. O token vem do
// `git credential fill` (o mesmo do push); nada é gravado.
// Uso: node scripts/ci-log.mjs <run_id> [filtro-regex] [linhas-de-contexto]
import { execSync } from 'node:child_process';

const [runId, filtro, ctx = '3'] = process.argv.slice(2);
if (!runId) { console.error('uso: node scripts/ci-log.mjs <run_id> [filtro] [contexto]'); process.exit(1); }
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) { console.error('sem credencial do GitHub'); process.exit(1); }

const repo = 'matheusminasflor/helpoint-sistema';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-log' };
const jobs = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, { headers }).then((r) => r.json());

for (const job of jobs.jobs ?? []) {
  if (job.conclusion === 'success') continue;
  console.log(`\n===== ${job.name} (${job.conclusion}) =====`);
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`, { headers, redirect: 'follow' });
  const text = await res.text();
  const lines = text.split('\n');
  if (!filtro) {
    console.log(lines.slice(-120).join('\n'));
    continue;
  }
  const re = new RegExp(filtro, 'i');
  const n = Number(ctx);
  const shown = new Set();
  lines.forEach((l, i) => {
    if (!re.test(l)) return;
    for (let j = Math.max(0, i - n); j <= Math.min(lines.length - 1, i + n); j++) shown.add(j);
  });
  console.log([...shown].sort((a, b) => a - b).map((i) => lines[i]).join('\n'));
}
