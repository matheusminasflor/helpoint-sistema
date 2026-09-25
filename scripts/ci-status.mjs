// Uma pergunta só ao GitHub: em que pé está o CI de um commit. Sem laço — o
// `ci-esperar.mjs` fica minutos aberto e o watcher morre antes da resposta
// (feedback do dono: "conferir pela API, watchers morrem").
// Uso: node scripts/ci-status.mjs [sha]   (sem sha = HEAD)
import { execSync } from 'node:child_process';

// `head_sha` da API do GitHub só casa com o SHA INTEIRO: passar o curto
// (833ba35) devolve zero runs e parece "o CI nem rodou", que é exatamente a
// leitura errada. Por isso o argumento passa por `git rev-parse` antes.
const sha = execSync(`git rev-parse ${process.argv[2] ?? 'HEAD'}`, { encoding: 'utf8' }).trim();
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exit(1);
}
const repo = 'matheusminasflor/helpoint-sistema';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-status' };

// `process.exitCode` e NÃO `process.exit()`: chamar `exit()` com o socket do
// `fetch` ainda aberto derruba o Node nesta máquina com
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … src\win\async.c`
// e devolve 127 — ou seja, o script existe para ser consultado por código e
// entregava um código de saída que não é nenhum dos documentados aqui.
// Com `exitCode`, o Node fecha os sockets e sai sozinho, com o número certo.
// Achado da auditoria de 2026-09-25, reproduzido.
const body = await fetch(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=5`, { headers }).then((r) => r.json());
const run = body.workflow_runs?.[0];
if (!run) {
  console.log(`sem run para ${sha.slice(0, 7)}`);
  process.exitCode = 3;
} else {
  console.log(`${run.name} #${run.run_number} ${run.status} ${run.conclusion ?? ''} ${run.html_url}`);
  if (run.status === 'completed' && run.conclusion !== 'success') {
    const jobs = await fetch(run.jobs_url, { headers }).then((r) => r.json());
    for (const j of jobs.jobs ?? []) {
      const falhos = (j.steps ?? []).filter((s) => s.conclusion === 'failure').map((s) => s.name);
      console.log(`  job ${j.name}: ${j.conclusion}${falhos.length ? ` — passos: ${falhos.join(', ')}` : ''}`);
    }
  }
  process.exitCode = run.status !== 'completed' ? 1 : run.conclusion === 'success' ? 0 : 2;
}
