# Decisões de arquitetura

Uma seção por decisão, numerada na ordem em que foi tomada. Decisão nova entra
no fim; decisão revogada ganha a linha **Revogada por ADR-NNN** e fica.

## ADR-001 — Supabase é o backend

**Data:** 2026-09-03. **Status:** vigente.

O backend do Helpoint é a Supabase: PostgreSQL com login (GoTrue), API
(PostgREST), storage, realtime e edge functions. A SPA fala direto com o banco;
a regra de negócio vive em RLS, triggers, funções SQL e edge functions.

Hoje roda na Supabase Cloud (`docs/ambientes.md`). Quando o volume de clientes
justificar, migra para uma VPS (Hostinger, Coolify) rodando **Supabase
self-hosted** — o mesmo software, o mesmo Postgres, por `pg_dump`/restore.

**Não** se troca por Postgres puro com backend próprio: isso refaria login,
API, storage e as ~460 policies de RLS que dependem de `auth.uid()`. Se um dia
a Supabase self-hosted não atender, a saída é trocar serviço por serviço atrás
dos hooks existentes — nunca reescrever o front.

Gatilho de revisão: custo mensal da Cloud ou limite de recurso que o plano não
cubra.

## ADR-002 — Front em Next.js, mantendo a Supabase

**Data:** 2026-09-03. **Status:** vigente, execução prevista após a base
portável (`docs/deploy.md`, CI verde).

O front migra de Vite/react-router para Next.js (App Router) por **porte** do
código existente: componentes, hooks, TanStack Query e o cliente Supabase
ficam; muda roteador, build e a criação do cliente (`@supabase/ssr`).

Motivos: a home pública `/` precisa de SEO e preview de link (renderização no
servidor); um lugar para código de servidor quando uma tela precisar; um
container só no Coolify.

Regra do porte: regra de negócio **continua** no banco e nas edge functions.
Route handlers e server actions nascem só quando uma tela precisar deles —
não para duplicar o que a Supabase já faz.

## ADR-003 — E-mail: GoTrue por SMTP; funções por `_shared/email.ts`

**Data:** 2026-09-03. **Status:** implantado no `test-helpoint` (migration `20260903200000_remove_fila_de_email`; SMTP fica `enabled = false` até a chave do Resend existir — passos em `docs/ambientes.md`).

E-mails de autenticação (confirmação, recuperação, convite, magic link) são
enviados pelo próprio GoTrue via SMTP, com templates em português versionados
em `supabase/templates/` e configurados em `supabase/config.toml`. Não há
webhook, fila nem função no caminho.

E-mails transacionais das edge functions (`invite-signup`, `send-sac-otp`,
`staff-signup`, `daily-email-verify`) passam por `_shared/email.ts`, que
escolhe o fornecedor por `EMAIL_PROVIDER`: `resend` agora, `smtp` (Hostinger)
quando for a hora. Trocar fornecedor é trocar variável de ambiente.

## ADR-004 — Time de agentes

**Data:** 2026-09-03. **Status:** decidido; só o `executor` existe até aqui.

Quatro subagentes em `.claude/agents/`, cada um com modelo e skills próprios
(`docs/agents/fluxo.md`): **planejador** (Fable 5.1) lê e decide a abordagem;
**executor** (Sonnet 5) aplica plano escrito; **auditor** (Fable 5.1) revisa
e prova; **aprovador** (Sonnet 5) monta o dossiê. O merge, o deploy e as
decisões de schema, RLS e regra de negócio são do humano.
