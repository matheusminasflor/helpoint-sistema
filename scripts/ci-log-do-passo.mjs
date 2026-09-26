// Baixa o log de um job do CI e imprime só o que interessa depois de uma
// reprovação: as linhas de TAP que falharam, com o contexto em volta.
//
// Por que existe: o log do job `banco` tem milhares de linhas (as migrations
// todas, mais o TAP de 30 suítes). Abrir no navegador para achar um `not ok`
// custa uma ida e volta que a API resolve, e `ci-status.mjs` só diz QUAL passo
// caiu, não por quê.
//
// Uso: node scripts/ci-log-do-passo.mjs [sha] [padrao]
//   padrao: regex do que procurar (padrão: linhas de falha do TAP e erros do psql)
import { execSync } from 'node:child_process';

const sha = execSync(`git rev-parse ${process.argv[2] ?? 'HEAD'}`, { encoding: 'utf8' }).trim();
const padrao = new RegExp(process.argv[3] ?? '^(not ok|# Failed|#\\s+(have|want)|psql:|ERROR:|FATAL:)', 'i');

const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /password=(.+)/.exec(cred)?.[1]?.trim();
if (!token) {
  console.error('sem credencial do GitHub no git credential');
  process.exitCode = 1;
} else {
  const repo = 'matheusminasflor/helpoint-sistema';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'helpoint-ci-log' };

  const runs = await fetch(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=5`, { headers }).then((r) => r.json());
  const run = runs.workflow_runs?.[0];
  if (!run) {
    console.log(`sem run para ${sha.slice(0, 7)}`);
    process.exitCode = 3;
  } else {
    const jobs = await fetch(run.jobs_url, { headers }).then((r) => r.json());
    for (const j of jobs.jobs ?? []) {
      if (j.conclusion === 'success') continue;
      console.log(`\n═══ ${j.name} (${j.conclusion}) ═══`);
      const log = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${j.id}/logs`, { headers }).then((r) => r.text());
      const linhas = log.split('\n');
      // Imprime a linha que casa e as 4 seguintes: no TAP, o "# have/want" vem
      // depois do "not ok", e é ele que diz o que realmente aconteceu.
      let restantes = 0;
      for (const l of linhas) {
        const limpa = l.replace(/^\S+\s/, '').trimEnd(); // tira o timestamp do Actions
        if (padrao.test(limpa)) {
          console.log(limpa);
          restantes = 4;
        } else if (restantes > 0) {
          console.log(`  ${limpa}`);
          restantes -= 1;
        }
      }
    }
  }
}
