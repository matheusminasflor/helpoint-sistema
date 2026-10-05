// Detalhe dos jobs de um run do CI: quando começou, em qual máquina, passos e as anotações do
// GitHub (onde aparece o motivo de um job "cancelled" sem log). Só lê; token do `git credential`.
// Uso: node scripts/ci-job-detalhe.mjs <run-id>
import { execSync } from 'node:child_process';

const runId = process.argv[2];
if (!runId) {
  console.error('uso: node scripts/ci-job-detalhe.mjs <run-id>');
  process.exit(1);
}
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
const repo = 'matheusminasflor/helpoint-sistema';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-job' };
const get = (url) => fetch(url, { headers }).then((r) => r.json());

const jobs = await get(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?filter=all`);
for (const j of jobs.jobs ?? []) {
  console.log(`${j.name}: ${j.status}/${j.conclusion} início ${j.started_at} fim ${j.completed_at} máquina ${j.runner_name ?? '-'}`);
  for (const s of j.steps ?? []) console.log(`   passo ${s.number} ${s.name}: ${s.conclusion}`);
  const notas = await get(`https://api.github.com/repos/${repo}/check-runs/${j.id}/annotations`);
  for (const n of Array.isArray(notas) ? notas : []) console.log(`   nota [${n.annotation_level}] ${n.message}`);
}
