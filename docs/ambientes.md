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

Os jobs `check-alerts-hourly` e `mkt-publish-due-5min` (migration
`20260907010000_cron_jobs_via_vault`) leem URL e chave de
`vault.decrypted_secrets`. Semear pelo SQL Editor do painel:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url');
select vault.create_secret('<service_role key>', 'email_queue_service_role_key');
```

O nome `email_queue_service_role_key` é herança da fila de e-mail (removida no
ADR-003) e ficou porque é o que os jobs do teste já liam — renomear exigiria
tocar segredo em produção sem ganho. Conferir: `select name from
vault.secrets;` mostra os dois nomes; `select command from cron.job;` não
contém URL nem chave literal. Sem os segredos, `cron.schedule` funciona e o
job falha em silêncio na hora de rodar — estado de projeto recém-criado.

## Segredos das edge functions

| Segredo | Quem usa |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injetados pela plataforma |
| `EMAIL_PROVIDER` (`resend` \| `smtp`) | `_shared/email.ts` (ADR-003) — troca o fornecedor sem tocar código. Ausente = `resend` |
| `RESEND_API_KEY` | `_shared/email.ts` quando `EMAIL_PROVIDER=resend` |
| `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_USER`, `SMTP_PASS` | `_shared/email.ts` quando `EMAIL_PROVIDER=smtp` |
| `AUTH_FROM_EMAIL`, `INVITE_FROM_EMAIL`, `SAC_FROM_EMAIL` | Remetentes de `staff-signup`/`daily-email-verify`, `invite-signup`, `send-sac-otp` |
| `APP_BASE_URL` | `invite-signup` (default `https://helpoint.com.br`) |
| `APP_A_RECORD` | `verify-tenant-domain` — IP que um domínio raiz de tenant deve apontar (default: o da Vercel; muda na VPS) |
| `META_APP_ID`, `META_APP_SECRET` | `mkt-meta-oauth` |
| `STRIPE_SECRET_KEY` | `stripe-create-checkout` e `stripe-webhook` (ADR-006). Chave de **teste** (`sk_test_…`) no `test-helpoint`; a de produção só no `helpoint-producao`. Sem ela, a geração de link responde `stripe_not_configured` e o front avisa "Pagamento ainda não configurado" |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` — o `whsec_…` que o painel do Stripe mostra ao registrar o endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` (eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`) |
| `APP_URL` | `stripe-create-checkout` — endereço do front para onde o cliente volta depois de pagar (`/pagamento/obrigado`). Só é usado quando a chamada não traz `Origin` |

`crm-lead-intake` (lead do site) não precisa de segredo além dos injetados; o
formulário público chama `POST https://<ref>.supabase.co/functions/v1/crm-lead-intake`
com `{ tenant_slug, name, email|phone, company?, message? }`.

Sem `RESEND_API_KEY` (ou sem os `SMTP_*`, no modo `smtp`) as quatro funções
que enviam e-mail respondem `email_not_configured` antes de fazer qualquer
coisa. É o estado de um projeto recém-criado.

## E-mails de login: GoTrue por SMTP

Confirmação, recuperação, convite, magic link, troca de e-mail e reautenticação
**não passam por função**: o GoTrue envia por SMTP, com os templates em
português de `supabase/templates/`. Tudo está em `supabase/config.toml`
(`[auth]`, `[auth.email.smtp]`, `[auth.email.template.*]`) e chega ao projeto
por `supabase config push`. A senha do SMTP não está no arquivo: é
`pass = "env(SMTP_PASS)"`, lida do ambiente de quem roda o push.

Para ligar num projeto (uma vez, e de novo só se a chave mudar):

1. Domínio `helpoint.com.br` verificado no Resend (três registros DNS na
   Hostinger) e uma chave de API criada lá.
2. Em `supabase/config.toml`, `[auth.email.smtp] enabled = true`.
3. Com a chave exportada no terminal — PowerShell:
   `$env:SMTP_PASS = "<chave do Resend>"; npx supabase config push --project-ref <ref> --yes`
   (bash: `SMTP_PASS=<chave> npx supabase config push --project-ref <ref> --yes`).
   Antes de rodar, `echo $env:SMTP_PASS` tem de mostrar a chave: com a
   variável vazia o push liga o SMTP sem senha.
4. No app, "esqueci a senha" entrega e-mail em português como `@helpoint.com.br`.

**`config push` não tem ensaio.** Sem terminal interativo (stdin fechado,
agente) ele responde "sim" sozinho e aplica o arquivo inteiro sobre o projeto —
inclusive `enabled = true` com a senha que estiver no ambiente. Rode com
`--yes` de propósito, com o `SMTP_PASS` certo exportado, e nunca com o arquivo
pela metade.

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

## Deploy

Os comandos, a ordem e as armadilhas estão em `docs/deploy.md` — um só lugar,
para teste e para produção. O que é específico do `test-helpoint`: o histórico
de migration dele foi semeado pelo MCP, com versões novas, e precisou de
`supabase migration repair` em 2026-09-03 para casar com os arquivos locais.
