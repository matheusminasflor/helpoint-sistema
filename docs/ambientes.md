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
| `EMAIL_PROVIDER` (`resend` \| `smtp`) | `_shared/email.ts` (ADR-003) — troca o fornecedor sem tocar código. Ausente = `resend` |
| `RESEND_API_KEY` | `_shared/email.ts` quando `EMAIL_PROVIDER=resend` |
| `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_USER`, `SMTP_PASS` | `_shared/email.ts` quando `EMAIL_PROVIDER=smtp` |
| `AUTH_FROM_EMAIL`, `INVITE_FROM_EMAIL`, `SAC_FROM_EMAIL` | Remetentes de `staff-signup`/`daily-email-verify`, `invite-signup`, `send-sac-otp` |
| `APP_BASE_URL` | `invite-signup` (default `https://helpoint.com.br`) |
| `APP_A_RECORD` | `verify-tenant-domain` — IP que um domínio raiz de tenant deve apontar (default: o da Vercel; muda na VPS) |
| `META_APP_ID`, `META_APP_SECRET` | `mkt-meta-oauth` |

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

## Deploy no teste

```
npx supabase login
npx supabase link --project-ref gmvvxulubthkagmsngas
npx supabase db push                       # migrations
npx supabase functions deploy              # todas as funções
npx supabase config push --yes             # auth, SMTP, templates — com SMTP_PASS no ambiente (acima)
npx supabase test db --linked              # pgTAP
npm run types:gen                          # src/integrations/supabase/types.ts
```

Regra: migrations em `supabase/migrations/` **não se editam** depois de
aplicadas; o que precisa mudar entra como migration nova.

`npx supabase migration list --project-ref <ref>` tem de mostrar cada arquivo
local casado com uma versão remota. Se o projeto foi semeado por outro caminho
(o `test-helpoint` foi, pelo MCP, com versões novas), `db push` tentaria
reaplicar tudo; o conserto é `supabase migration repair --status reverted
<versões só remotas>` e `--status applied <versões só locais>` — mexe só na
tabela de histórico, não no schema. Feito no `test-helpoint` em 2026-09-03.
