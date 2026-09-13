// Manda o GitHub repetir os jobs que falharam num run do CI. Serve para falha
// de infraestrutura (a `setup-cli` do Supabase bate o limite de requisições do
// GitHub e o job morre com exit 127 antes de tocar no código).
// Token vem do `git credential fill`, o mesmo que o push usa; nada é gravado.
// Uso: node scripts/ci-repetir.mjs <run-id>
import { execSync } from 'node:child_process';

const [runId] = process.argv.slice(2);
if (!runId) {
  console.error('uso: node scripts/ci-repetir.mjs <run-id>');
  process.exit(1);
}
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exit(1);
}
const repo = 'matheusminasflor/helpoint-sistema';
const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'helpoint-ci-repetir',
  },
});
if (res.status === 201) {
  console.log(`run ${runId}: jobs que falharam foram reenfileirados`);
} else {
  console.error(`run ${runId}: ${res.status} ${await res.text()}`);
  process.exit(1);
}
