# Ambientes

Dois projetos Supabase, referidos pelo **nome que aparece no painel**.

| Projeto | Ref | Papel |
|---|---|---|
| `test-helpoint` | `gmvvxulubthkagmsngas` | Teste e desenvolvimento. Todo trabalho aponta aqui: `.env`, `supabase/config.toml`, deploy de funções, pgTAP |
| `helpoint-producao` | `joafqgmiirggohxkomrl` | Produção. Recebe só migrations, funções e o seed do go-live (`docs/deploy.md`). Nunca é alvo de experimento |

Front: Vercel, projeto ligado a `matheusminasflor/helpoint-sistema`. Preview de
branch aponta para `test-helpoint`; produção, para `helpoint-producao`.

## Chaves

- Só chave **publishable** (anon) entra em arquivo: `.env` (fora do Git,
  modelo em `.env.example`) e as variáveis da Vercel.
- `service_role` vive em dois lugares e em nenhum outro: nos **secrets das
  edge functions** (painel → Edge Functions → Secrets) e no **Vault** do
  Postgres, para os jobs do `pg_cron`.
- Nenhuma chave passa por conversa, commit ou documento.

## Vault (por projeto, uma vez)

Os jobs `check-alerts-hourly` e `mkt-publish-due-5min` leem de
`vault.decrypted_secrets`. Semear pelo SQL Editor do painel:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url');
select vault.create_secret('<service_role key>', 'service_role_key');
```

Conferir: `select name from vault.secrets;` mostra os dois nomes;
`select command from cron.job;` não contém URL nem chave literal.

## Segredos das edge functions

| Segredo | Quem usa |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injetados pela plataforma |
| `EMAIL_PROVIDER` (`resend` \| `smtp`) | `_shared/email.ts` (ADR-003, em implantação) — troca o fornecedor sem tocar código |
| `RESEND_API_KEY` | `_shared/email.ts` quando `EMAIL_PROVIDER=resend` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | `_shared/email.ts` quando `EMAIL_PROVIDER=smtp` |
| `AUTH_FROM_EMAIL`, `INVITE_FROM_EMAIL`, `SAC_FROM_EMAIL` | Remetentes de `staff-signup`/`daily-email-verify`, `invite-signup`, `send-sac-otp` |
| `APP_BASE_URL` | `invite-signup` (default `https://helpoint.com.br`) |
| `APP_A_RECORD` | `verify-tenant-domain` — IP que um domínio raiz de tenant deve apontar (default: o da Vercel; muda na VPS) |
| `META_APP_ID`, `META_APP_SECRET` | `mkt-meta-oauth` |

E-mails de login (confirmação, recuperação, convite, magic link) **não passam
por função**: o GoTrue envia por SMTP, configurado em `supabase/config.toml`
(`[auth.email.smtp]`, senha em `SMTP_PASS` no ambiente de quem roda
`supabase config push`).

As funções `ai-*` usam a credencial do tenant (`tenant_ai_credentials`, tela
de credenciais de IA) e, sem ela, respondem com erro explicando. Transcrição
(`ai-transcribe-audio`) e imagem (`mkt-ai-creative`) ainda não: a troca por
OpenAI BYOK está decidida (`docs/decisoes.md`).

## Contas de teste (`test-helpoint`)

Senhas não ficam em documento — peça a quem administra o ambiente.

| Conta | Papel |
|---|---|
| `dev@helpoint.test` | Admin do tenant `Minasflor Professional` (slug `minasflor-professional`) |
| `usuario_a_teste@helpoint.test` | Fixture para testes |

Os buckets de storage existem no teste com 0 objetos; URLs de avatar e anexo
em dados semeados podem apontar para arquivo inexistente.

## Deploy no teste

```
npx supabase login
npx supabase link --project-ref gmvvxulubthkagmsngas
npx supabase db push                       # migrations
npx supabase functions deploy              # todas as funções
npx supabase config push                   # auth, SMTP, templates
npx supabase test db --linked              # pgTAP
npm run types:gen                          # src/integrations/supabase/types.ts
```

Regra: migrations em `supabase/migrations/` **não se editam** depois de
aplicadas; o que precisa mudar entra como migration nova.
