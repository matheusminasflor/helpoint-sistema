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
npx supabase functions deploy              # todas as 27 funções
npx supabase config push --yes             # auth, SMTP, templates (SMTP_PASS no ambiente)
npm run types:gen                          # src/integrations/supabase/types.ts
```

`<ref>`: `gmvvxulubthkagmsngas` (test-helpoint) ou `joafqgmiirggohxkomrl`
(helpoint-producao). O `types:gen` do `package.json` está fixo no **teste** —
é de onde os tipos devem sair, porque é lá que o schema nasce.

Três regras que já custaram caro:

1. **Migration aplicada não se edita.** O que precisa mudar entra como
   migration nova. São 126 arquivos em `supabase/migrations/`.
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
dados nem usuários. A sequência, uma vez:

1. **Schema** — `db push` no ref de produção; conferir com `migration list`.
2. **Funções** — `functions deploy`.
3. **Secrets das edge functions** — painel → Edge Functions → Secrets. Sem
   `RESEND_API_KEY` (ou os `SMTP_*`) as quatro funções que mandam e-mail
   respondem `email_not_configured` e nada mais acontece.
4. **Vault** — `functions_base_url` e `service_role_key`, senão os jobs de
   `pg_cron` (`check-alerts-hourly`, `mkt-publish-due-5min`) não chamam nada.
5. **E-mails de login** — `config push` com `SMTP_PASS`, e um "esqueci a
   senha" de verdade para ver o e-mail chegar em português.
6. **Dados** — a carga respeita a ordem de chaves estrangeiras registrada em
   `.scratch/adocao-helpoint/ordem-copia-dados.md`. Fora dessa ordem, quebra.
   `auth.users` vai **com o hash de senha**, senão ninguém loga. Triggers de
   validação de tenant podem atrapalhar a carga: desabilitar durante e
   reabilitar depois — nunca remover.
7. **Domínio** — `helpoint.com.br` apontado para a Vercel; `APP_A_RECORD` na
   função `verify-tenant-domain` tem de ser o IP que a Vercel pede, senão a
   verificação de domínio próprio de tenant reprova todo mundo.
8. **Conferir no navegador** — logar, abrir uma URL profunda
   (`/t/<slug>/ti/indicadores`) e **recarregar a página**: um SPA sem o
   fallback para `index.html` devolve 404 aqui, e só aqui.

`.scratch/` está no `.gitignore`. O documento da ordem de carga vive só nesta
máquina — antes do go-live, mover para `docs/` ou levar junto.

## O que ainda não existe

- **CI.** Não há `.github/` neste repositório. `npm run lint`, `npm run test`
  e `supabase test db` rodam na máquina de quem trabalha, e só.
- **VPS / Coolify.** Decisão registrada: só se a escala pedir
  (`docs/decisoes.md`). Enquanto não pedir, este documento tem dois alvos.
