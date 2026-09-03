# Ambiente de teste: como o `test-helpoint` foi montado

Registro do que foi feito e do que a leitura do sistema revelou. Alimenta o
Passo 4, que é escrever o roteiro novo.

> Este documento nasceu em `.scratch/` (fora do Git) e foi movido para cá em
> 03/09/2026, para entrar no backup. As seções abaixo descrevem o estado no dia
> da migração; onde algo mudou depois, há uma nota **Atualizado**.

## Situação

A reconstrução em Next.js foi cancelada em 02/09/2026. O código real do
Lovable virou a base do repositório. `docs/arquitetura.md` deixou de ser
especificação e virou registro de decisões.

Feito: repositório criado (`351b8ca`), protocolo e documentos trazidos
(`caf9f6c`), linha de base medida (`2e5aa90`), **`test-helpoint` espelhado do
sistema real — schema, dados, usuários e as 28 edge functions (03/09/2026)**.
Detalhes na seção "Migração para o test-helpoint".

Pendente: o que só o painel resolve (segredos das edge functions, arquivos do
storage) e o Passo 4.

## Linha de base, medida em 02/09/2026

| Comando | Resultado |
|---|---|
| `npm run build` | Passa. 4.097 módulos, 1m19s. Chunk principal 3,4 MB (955 kB gzip), sem code splitting |
| `npm run test` | 1 teste, e é `expect(true).toBe(true)`. Cobertura real: zero |
| `npm run lint` | 554 problemas (514 erros), quase todos `no-explicit-any` |

Nenhum é regressão nossa. Serve de marco: o que piorar daqui foi a gente.

## O sistema, em números

110 tabelas, 61 funções, 318 policies de RLS, **zero tabela sem RLS**.
2.636 linhas de dado em 10 MB. 28 edge functions com código (o `config.toml`
lista 29: `ai-facility-map` não tem diretório nem chamador em `src/`).
~350 arquivos em `src/`, 80 rotas.

Por área: RH 17 tabelas, Marketing 15, chamados 13, núcleo 11, Qualidade/SAC
11, Financeiro 7, conhecimento 5, TI/inventário 3.

## Migração para o test-helpoint (`gmvvxulubthkagmsngas`)

Origem: Lovable Cloud `csbhhvgnbpleinxlpkcd`, **somente leitura** pelo MCP do
Lovable (`query_database`). Nunca recebeu escrita. O projeto
`joafqgmiirggohxkomrl` (produção reservada, zerado) não foi tocado.

### Schema

- 125 migrations de `supabase/migrations/` aplicadas na letra, na ordem do
  nome, mais 1 de adaptação de ambiente — 126 em
  `supabase_migrations.schema_migrations`.
- Resultado igual ao real: 110 tabelas, 61 funções, 318 policies, 0 tabela
  sem RLS.
- **Duas funções existiam só no banco real**, sem migration:
  `email_queue_dispatch` e `email_queue_wake`. Foram recuperadas do
  `pg_get_functiondef` do banco real e criadas no teste. Continuam fora de
  `supabase/migrations/` — regra desta adoção: as migrations não se editam,
  adaptação de ambiente vive só no banco de teste e fica registrada aqui.
- `cron.job`: 2 jobs (`check-alerts-hourly`, `mkt-publish-due-5min`), URLs
  apontando para o teste, **ambos inativos** até haver decisão sobre as
  issues 01 e 02.
- `vault.secrets`: vazio. O real tem um segredo que o MCP não expõe; nada no
  código lê o vault diretamente.

### Dados

- ~494 linhas em 57 tabelas (medida por `pg_stat_user_tables`; 2 tenants,
  14 tickets, 194 `ti_categories`, 24 `access_profiles`, 24
  `sac_form_fields`).
- `audit_logs` **não copiado** (2.219 linhas de histórico de outro
  ambiente). 1 linha existe, gerada pelo próprio teste.
- `email_send_state` é singleton criado por migration: foi **atualizado**, não
  inserido.
- Carga com `alter table ... disable trigger user` durante o insert e
  `enable` logo depois. Triggers de sistema e de RI nunca foram tocados.
- Tenant semeado pela migration (`Helpoint Demo`) foi removido antes da
  carga para não colidir com os tenants reais.
- URLs de arquivos (avatares, anexos) continuam apontando para o storage do
  `csbhhvgnbpleinxlpkcd`. Os 7 buckets existem no teste, **0 objetos**.
  Copiar arquivos exige a service key do real, que não temos.

### Usuários

- `auth.users`: 9 reais (hash de senha, `raw_user_meta_data`, timestamps) +
  `auth.identities` (8) copiados. Timestamp de `email_confirmed_at` nulo em
  um fixture foi corrigido no teste para o login não recusar.
- Contas só do teste, criadas aqui (a senha das duas é a mesma; ela **não**
  fica neste documento — peça a quem administra o ambiente):
  - `dev@helpoint.test` — admin do tenant `Minasflor Professional`
    (`6e790959-0c03-47f9-af0d-da4f5dee7f14`, slug `minasflor-professional`).
    Id `dddddddd-0000-4000-8000-000000000001`.
  - `usuario_a_teste@helpoint.test` — fixture para testes.
- Total: 10 usuários.

### App

- `.env` aponta para o teste. `.env.producao-lovable.bak` guarda o real
  (gitignored, padrão `.env.*.bak` adicionado ao `.gitignore`).
- `src/pages/Login.tsx`: URL e anon key do real estavam **em código** na
  chamada de `staff-signup`. Trocado por `import.meta.env`. Único lugar com
  ref hardcoded em `src/`.
- `supabase/config.toml`: **Atualizado 03/09/2026** — `project_id` passou a
  `gmvvxulubthkagmsngas` e a entrada `ai-facility-map` (sem código) foi
  removida.
- Navegação real em `http://localhost:8080` (`tour.js`): login, `/inicio`,
  TI, RH, SAC, Marketing e Financeiro carregam contra o teste.

### Edge functions

28/28 deployadas pelo MCP (`deploy_edge_function`), fonte na letra,
`verify_jwt` igual ao `config.toml`. `mkt-ai-creative` e `mkt-meta-publish`
estão na versão 2 (redeploy para corrigir `_shared/assistant-name.ts` e
`verify_jwt`). Boot verificado por `OPTIONS`/`POST` em 8 delas.

Alternativa ao MCP: `npx supabase login` e
`npx supabase functions deploy --project-ref gmvvxulubthkagmsngas`.

**Segredos que o MCP não grava — configurar no painel** (Edge Functions →
Secrets) antes de usar a função:

| Segredo | Quem usa |
|---|---|
| `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` | `auth-email-hook`, `process-email-queue`, `ai-transcribe-audio`, geração de imagem em `mkt-ai-creative` |
| `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, `INVITE_FROM_EMAIL`, `SAC_FROM_EMAIL` | `invite-signup`, `send-sac-otp`, `daily-email-verify` |
| `APP_BASE_URL` | `invite-signup` (default `https://helpoint.com.br`) |
| `META_APP_ID`, `META_APP_SECRET` | `mkt-meta-oauth` |

As funções de IA usam BYOK (`_shared/ai.ts` lê `tenant_ai_credentials`):
0 linhas no teste, cadastrar pela tela de credenciais antes de testar
`ai-*`. `mkt_social_account_secrets`: 0 linhas, como esperado.

**Defeitos do código real, deployados como estão** na migração.
**Atualizado 03/09/2026:** todos os cinco foram corrigidos no código — ver
"Issues abertas" no fim.

- `ai-match-pop` e `mkt-ai-creative` usam `callTenantAI`/`aiErrorResponse`
  sem importar `../_shared/ai.ts` — falham ao executar.
- `ai-semantic-search` referencia `lovableApiKey` que nunca é definido.
- `ai-lyra-chat` passa `ugcSummary` fora da interface `TenantContext`
  (cosmético).
- `check-alerts` e `mkt-publish-due`: issues 01 e 02. Confirmado no teste:
  `POST` sem token em `check-alerts` responde 200 e executa.

## A lição que se repetiu

**Nenhum documento deste repositório descreve o sistema que roda.**

- `docs/SYSTEM_DOCUMENTATION.md` é de 23/02. Das 8 rotas que documenta
  (`/kanban`, `/mkt/influenciadores`, `/mkt/eventos`, `/mkt/ugc`,
  `TIDashboard`, `HelpdeskTI`, `Index`, `MKTDashboard`), **nenhuma existe**. E
  os 4 módulos que existem, com 29 telas, ele não menciona.
- `docs/ARQUITETURA_MIGRACAO.md` é a proposta de *sair* do Lovable para
  Next.js/Prisma — a origem da reconstrução cancelada. Define 78 models contra
  110 tabelas reais.
- `docs/arquitetura.md` projetou 139 tabelas que nunca existiram aqui.

Só o código e o banco valem como fonte. Foi por isso que o Passo 3 veio antes
do Passo 4.

## Issues abertas

| # | Tipo | O quê | Estado |
|---|---|---|---|
| 01 | segurança | `check-alerts` sem autenticação, escreve com `service_role` | Corrigida 03/09 — `_shared/require-service-role.ts`, `verify_jwt = true` |
| 02 | segurança | `mkt-publish-due` sem autenticação, publica em redes sociais | Corrigida 03/09 — idem |
| 03 | dívida | Cobertura de teste zero | Aberta |
| 04 | dívida | Backend órfão de Marketing: tabelas sem tela | Aberta |
| 05 | defeito | `ai-match-pop`, `mkt-ai-creative`, `ai-semantic-search` quebram em runtime | Corrigida 03/09 — imports de `_shared/ai.ts` e guarda morta removida |

Os dois `cron.job` foram **reativados em 03/09/2026**. Os dois passaram a ler a
chave do cofre do Postgres — `vault.decrypted_secrets`, segredo
`email_queue_service_role_key`, o mesmo que `email_queue_dispatch` e
`email_queue_wake` já usavam e que estava vazio no teste. Nenhuma chave mora no
texto do job. Antes, o `check-alerts-hourly` mandava a chave `anon`, que a
correção passa a recusar com 403.

## Decisão pendente que não é minha

O `ARQUITETURA_MIGRACAO.md` registra a intenção de sair do Lovable e do
Supabase por completo, por infra própria. Adotar este código como base
**reverte** essa direção. A reversão foi decidida e está certa para destravar
o trabalho — mas o motivo original de querer sair (dependência do
fornecedor, custo, controle) não foi discutido, e deveria entrar no Passo 4
antes de o roteiro novo assumir Supabase para sempre.
