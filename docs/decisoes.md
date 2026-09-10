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

**Data:** 2026-09-03. **Status:** implantado em 2026-09-04 — os quatro agentes existem em `.claude/agents/`, fluxo em `docs/agents/fluxo.md`.

Quatro subagentes em `.claude/agents/`, cada um com modelo e skills próprios
(`docs/agents/fluxo.md`): **planejador** (Fable 5.1) lê e decide a abordagem;
**executor** (Sonnet 5) aplica plano escrito; **auditor** (Fable 5.1) revisa
e prova; **aprovador** (Sonnet 5) monta o dossiê. O merge, o deploy e as
decisões de schema, RLS e regra de negócio são do humano.

## ADR-005 — O Helpoint é um produto; a Minasflor é o primeiro cliente

**Data:** 2026-09-06. **Status:** vigente.

O sistema será **vendido a outras empresas**. A Minasflor é o cliente nº 1 —
o piloto que produz o dado de uso que hoje não existe — e não o único.

Isso muda o que "pronto" significa. Para uso interno, uma empresa alcançar
dado de outra seria detalhe, porque só haveria uma. Para produto, é o item
número um: risco de contrato, de reputação e de lei. Consequências:

- **Isolamento entre empresas é requisito de produto, não bug.** Qualquer
  caminho em que um usuário — funcionário ou cliente de SAC — alcance dado de
  outra empresa é **bloqueio** antes do primeiro cliente externo. Entra aí o
  cliente que troca o próprio `tenant_id` em `customer_profiles`
  (`docs/nao-funciona.md`, "Buracos de segurança").
- **Isolamento se prova, não se presume.** "Achamos que está separado" não
  vende. A suíte pgTAP sobre as policies de isolamento cresce antes do primeiro
  contrato de fora; em 2026-09-06 eram 17 asserções para ~309 policies.
- **A home pública ganha motivo.** O porte para Next.js (ADR-002) deixa de ser
  "quando der" e passa a ter razão de produto: cara pública, SEO, preview de
  link. Se vem antes ou depois das telas novas continua decisão aberta.
- **Marketing e módulos novos nascem já multi-tenant.** As 6 tabelas de MKT
  sem trigger de `tenant_id` e as 5 fora do MKT (`nao-funciona.md`, "Dívidas
  de base") passam de "dívida" a pré-requisito.

Gatilho de revisão: nenhum. Esta é a razão de o projeto existir.

## ADR-006 — CRM do Comercial: funil simples, dinheiro pelo Stripe, Bling e WhatsApp depois

**Data:** 2026-09-09. **Status:** vigente.

O módulo Comercial ganha um CRM para a equipe de vendas interna, no lugar do
Kommo — que a Minasflor usa e considera complexo demais. A pesquisa
(`docs/pesquisa-crm-comercial.md`) mostrou que a complexidade do Kommo está
nas automações e integrações, não no funil; o funil é o que vale copiar.

Decisões do dono, com o que cada uma implica:

- **Primeira versão (CRM-1):** funil com etapas, cartão do negócio (notas,
  tarefas, linha do tempo), catálogo e **pedido interno com link de
  pagamento**. Em seguida, nesta ordem: CRM-2 pedido pago vira pedido no
  Bling; CRM-3 lojinha pública; CRM-4 WhatsApp. Cada uma com plano próprio.
- **Dinheiro pelo Stripe primeiro.** Cartão e boleto já; Pix é por convite
  (pedir). Link temporário = Checkout com validade de 30 min a 24 h; link
  definitivo = Payment Link. O Bling Conta Digital fica como alternativa para
  Pix se o convite não vier. Hoje uma conta Stripe só, com a chave nos
  segredos das edge functions; Stripe Connect por empresa entra quando houver
  o segundo cliente que venda.
- **Stripe → Bling é obra nossa** (webhook → edge function → API v3 do
  Bling), com fila e idempotência por `event.id`. O Bling não fala com o
  Stripe sozinho.
- **WhatsApp em leva própria**, pela API oficial da Meta, com número dedicado
  **configurável por empresa no painel**; nada de conexão não oficial (risco
  de banimento num produto vendável). O número que hoje está no Kommo não
  migra sem perder o histórico — decisão na hora da CRM-4.
- **Cinco etapas padrão** (Novo → Em contato → Orçamento enviado → Negociação
  → Ganho / Perdido), nomes editáveis por empresa; "Ganho" e "Perdido" são
  tipos, não nomes — o sistema os reconhece por tipo.
- **Tarefas do negócio usam a tabela `tasks` existente** (`source_type =
  'crm_deal'`); o lead do site entra por edge function pública que cria
  contato + negócio na primeira etapa e avisa a equipe.

Gatilho de revisão: segundo cliente que venda pelo Helpoint (Stripe Connect);
resposta da Stripe sobre Pix (Bling Conta Digital ou não).
