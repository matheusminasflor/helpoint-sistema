# Deploy

Como o sistema sobe. Dois alvos, e só dois:

| Alvo | O que roda lá | Como sobe |
|---|---|---|
| **Vercel** | O front (SPA Vite, saída em `dist/`) | `git push` no branch ligado ao projeto |
| **Supabase** | Banco, RLS, triggers, funções SQL, edge functions, GoTrue | CLI: `db push`, `functions deploy`, `config push` |

Não há servidor próprio, container, nem passo manual de build. O par de
projetos Supabase e o papel de cada um estão em `docs/ambientes.md`.

## Backend (Supabase)

A ordem importa: função nova que usa tabela nova quebra se as migrations não
foram antes.

```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                       # migrations
npx supabase functions deploy              # as 24 funções (`_shared/` é módulo, não função)
npx supabase config push --yes             # auth, SMTP, templates (SMTP_PASS no ambiente)
npx supabase test db --linked              # pgTAP (precisa do Docker Desktop de pé)
npm run types:gen                          # src/integrations/supabase/types.ts
```

`<ref>`: `gmvvxulubthkagmsngas` (test-helpoint) ou `joafqgmiirggohxkomrl`
(helpoint-producao). O `types:gen` do `package.json` está fixo no **teste** —
é de onde os tipos devem sair, porque é lá que o schema nasce.

Três regras que já custaram caro:

1. **Migration aplicada não se edita.** O que precisa mudar entra como
   migration nova. São 132 arquivos em `supabase/migrations/`, e desde
   2026-09-07 o CI prova que todos aplicam em sequência numa base do zero.
   Única exceção, decidida em 2026-09-07: migration que **quebra numa base do
   zero** (o job `banco` do CI acusa) pode ser editada para virar no-op onde
   falha — migration nova não resolve, porque a base nunca chega nela. O
   histórico da Supabase compara versão, não conteúdo, então onde já rodou
   nada muda. Caso registrado: `20260121175622`, semente com usuário fixo.
2. **`config push` não tem ensaio.** Sem terminal interativo ele responde
   "sim" sozinho e aplica o arquivo inteiro — inclusive o `[auth.email.smtp]`
   com a senha que estiver no ambiente. Rode de propósito, com `SMTP_PASS`
   exportado e conferido (`echo $env:SMTP_PASS`).
3. **Histórico de migration pode divergir do schema.** Se o projeto foi
   semeado por outro caminho, `db push` tenta reaplicar tudo. Confira com
   `npx supabase migration list --project-ref <ref>`: cada arquivo local tem
   de estar casado com uma versão remota. O conserto é
   `supabase migration repair --status reverted <versões só remotas>` e
   `--status applied <versões só locais>` — mexe na tabela de histórico, não
   no schema.

O que **não** sobe por CLI e precisa existir no painel de cada projeto:
secrets das edge functions e segredos do Vault. A lista está em
`docs/ambientes.md`.

## Front (Vercel)

Projeto ligado a `matheusminasflor/helpoint-sistema`.

| Ambiente da Vercel | Aponta para | Quando |
|---|---|---|
| Production | `helpoint-producao` | Push no branch de produção |
| Preview | `test-helpoint` | Push em qualquer outro branch |

As variáveis são as mesmas do `.env.example`, com valores por ambiente:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`. Todas são chave *publishable* — vão para o
navegador e não são segredo. `service_role` **nunca** entra aqui.

O host de preview (`https://helpoint-*.vercel.app`) já está na lista de
`additional_redirect_urls` do `supabase/config.toml`; sem isso o login de um
preview volta com erro de redirect.

## Go-live da produção

O `helpoint-producao` recebe migrations e funções, mas ainda não recebeu
dados nem usuários. Desde a ADR-010 (2026-09-18) **não há mais cadastro de
empresa** e **a produção começa do zero**: nenhum dado viaja do
`test-helpoint` — o que está lá é dado de teste, partido entre duas empresas
de mentira (`docs/ambientes.md`), e fica lá. A sequência, uma vez:

1. **Schema** — `db push` no ref de produção; conferir com `migration list`.
2. **Funções** — `functions deploy`.
3. **Secrets das edge functions** — painel → Edge Functions → Secrets. Sem
   `RESEND_API_KEY` (ou os `SMTP_*`) as quatro funções que mandam e-mail
   respondem `email_not_configured` e nada mais acontece.
4. **Vault** — `functions_base_url` e `service_role_key`, senão os jobs de
   `pg_cron` (`check-alerts-hourly`, `mkt-publish-due-5min`) não chamam nada.
5. **E-mails de login** — `config push` com `SMTP_PASS`, e um "esqueci a
   senha" de verdade para ver o e-mail chegar em português.
6. **Uma empresa, um dono — sem carga de dados.** O caminho de cadastro
   público foi removido (ADR-010): não existe mais tela nem função para criar
   empresa. Só o `service_role` cria, nesta ordem:
   1. Uma linha em `tenants` (nome e slug da Minasflor) pelo SQL Editor do
      painel, com o `service_role`. É a única vez que alguém insere ali —
      depois da migration `20261010010000_helpoint_uma_empresa.sql`,
      `authenticated` e `anon` não têm mais permissão de INSERT nem DELETE
      nessa tabela.
   2. O usuário do dono, pelo **Admin API** do Supabase
      (`supabase.auth.admin.createUser` ou painel → Authentication → Add
      user) — nunca por INSERT direto em `auth.users`: o GoTrue lê
      `confirmation_token`, `recovery_token` etc. como string, e essas
      colunas nulas passam no SQL e só quebram no login real, com um erro
      que não aponta a causa (a mesma lição do pgTAP, `CLAUDE.md`).
   3. Uma linha em `profiles` para esse usuário (com o `tenant_id` da
      empresa criada no passo 1) e uma linha em `user_roles` com
      `role = 'owner'`.
   4. A partir daí, toda pessoa nova entra por convite (`/convite/:id`),
      enviado pelo próprio dono já dentro do painel.
7. **Domínio** — `helpoint.com.br` apontado para a Vercel; `APP_A_RECORD` na
   função `verify-tenant-domain` tem de ser o IP que a Vercel pede, senão a
   verificação de domínio próprio de tenant reprova todo mundo.
8. **Conferir no navegador** — logar, abrir uma URL profunda
   (`/ti/indicadores`) e **recarregar a página**: um SPA sem o
   fallback para `index.html` devolve 404 aqui, e só aqui.

## O que ainda não existe

- ~~CI~~ — existe desde 2026-09-06: `.github/workflows/ci.yml`. Dois jobs
  independentes a cada push em `main` e a cada PR: **front** (lint como
  catraca que só pode descer, Vitest, build) e **banco** (`supabase start` num
  Postgres do zero, todas as migrations, `supabase test db`). É a única prova
  de que as migrations formam um todo aplicável — contra o `test-helpoint`
  isso não se prova, porque lá o schema já existe. Nenhum job toca projeto
  remoto: sem chave, sem `--linked`, sem deploy.
- **VPS / Coolify.** Decisão registrada: só se a escala pedir
  (`docs/decisoes.md`). Enquanto não pedir, este documento tem dois alvos.
