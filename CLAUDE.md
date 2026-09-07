# Helpoint

Sistema operacional corporativo multi-tenant: chamados, inventário, qualidade e
SAC, marketing, RH e financeiro, com uma camada de IA (Lyra).

**Vite 5 + React 18 + react-router-dom 6 + shadcn/ui + Supabase.** SPA falando
direto com o banco: não há camada de servidor entre o navegador e o Postgres.
A regra de negócio vive em RLS, triggers, funções SQL e edge functions. O front
está a caminho do Next.js por porte (ADR-002), mantendo tudo isso.

## A regra

**O sistema que roda é a especificação.** Antes de construir qualquer coisa,
leia o que já existe — código, schema, edge function. Onde um documento e o
banco real divergirem, **o banco real ganha**.

## Onde as coisas estão

| Documento | O que é |
|---|---|
| `docs/ambientes.md` | Projetos Supabase, chaves, segredos, Vault, deploy no teste |
| `docs/deploy.md` | Como o sistema sobe: Vercel (front) e Supabase (backend), e o go-live da produção |
| `docs/inventario-sistema.md` | O sistema módulo a módulo: rotas, telas, fórmulas, tabelas, fluxos |
| `docs/nao-funciona.md` | **O que existe no código e não funciona.** Leia antes de "consertar" algo |
| `docs/decisoes.md` | Decisões de arquitetura (ADR-001 em diante) |
| `docs/agents/` | Tracker, documentos de domínio e fluxo dos agentes |

## Ambientes Supabase

| Projeto (nome do painel) | Ref | Uso |
|---|---|---|
| **test-helpoint** | `gmvvxulubthkagmsngas` | Desenvolvimento e testes. Todo trabalho aponta aqui |
| **helpoint-producao** | `joafqgmiirggohxkomrl` | Produção. Só migrations, funções e o seed do go-live. Nunca alvo de experimento |

`.env` fica fora do Git; `.env.example` documenta as chaves. Só chave
*publishable* entra em arquivo — `service_role` vive nos secrets das edge
functions e no Vault. Nenhum segredo passa por conversa, commit ou documento.

## Protocolo padrão

Três skills valem em toda tarefa deste repositório, **sem o usuário precisar
pedir**.

### 1. `grilling` — antes de construir

**Gatilho:** trabalho que ramifica. Tabela ou coluna nova, mudança de contrato,
módulo novo, escolha entre abordagens, ou qualquer pedido cuja leitura razoável
leve a resultados diferentes.

**Não vale para:** correção óbvia, bug com causa já localizada, ajuste de texto,
ou decisão já grelhada nesta conversa.

**O que faço:** monto a árvore de decisões e pergunto a **fronteira inteira em
uma rodada só** — numerada, cada uma com minha recomendação. Fato eu busco
sozinho (arquivo, schema, log); **decisão é sua**. Explico em linguagem leiga
e separo perguntas que chegaram juntas.

### 2. `ponytail` — enquanto construo

Suba a escada e pare no primeiro degrau que segura: isto precisa existir? já
existe aqui? o stdlib resolve? a **plataforma** resolve (constraint, policy de
RLS, trigger, `<input type="date">`, CSS)? dá em uma linha? Só então o mínimo
que funciona.

Num repositório de 350 arquivos que já faz quase tudo, o degrau que mais
segura é o segundo. Exemplos que já existem e não se reescrevem: tendência
está em `useHelpdeskMetrics`; `sla_due_at` é preenchido por trigger no banco;
`_shared/require-service-role.ts` autentica função chamada pelo cron;
`_shared/ai.ts` chama IA com a credencial do tenant. **Procure antes de
escrever.**

Correção de bug é causa raiz, não sintoma: antes de editar, procure todos os
chamadores da função que vai tocar. Simplificação deliberada com teto conhecido
leva comentário `ponytail:` nomeando o teto e a saída.

### 3. `lean-ctx` — o tempo todo

Grep e Glob nativos estão negados; as ferramentas `ctx_*` os substituem.
`ctx_read -m map` para descobrir a superfície de um arquivo, `ctx_read
-m lines:N-M` para um trecho, leitura completa só para editar. O allowlist
**bloqueia `node -e` e afins**: para editar arquivo use Edit/Write, para script
crie um arquivo em `scripts/`.

## Cinco regras de escrita

Cada uma existe porque o hábito contrário produziu defeito escondido na
revisão de 2026-09-04 (`docs/nao-funciona.md`, "Padrões que escondem
defeito"). As regras 1, 3 e 4 são acusadas pelo lint (`no-restricted-syntax`
em `eslint.config.js`, só em `src/`); a 5 por `src/routes/rotas-existem.test.ts`;
a 2 só por revisão. As edge functions (`supabase/functions/`) ainda não estão
sob as regras — leva pendente, 79 ocorrências da regra 1.

1. **Erro do banco não se engole.** Nunca `const { data } = await supabase…`.
   Ou `unwrap(await …)` (`@/lib/supabase-result`), que lança, ou
   `const { data, error }` com o `error` tratado. Falha de RLS virava lista
   vazia; o RH ficou meses quebrado assim.
2. **Escrita prova que gravou.** `update`/`insert`/`delete` levam
   `.select('id')` e passam por `expectRows(...)`. O PostgREST responde 200
   com zero linhas quando a policy não casa — e isso não é erro.
3. **`queryKey` leva `tenantId`** (ou `user?.id`, quando o dado é da pessoa).
   Sem isso dois tenants na mesma aba veem dado trocado até o refetch.
4. **"Hoje" é local.** `todayISO()` / `toLocalISODate()` (`@/lib/dates`), nunca
   `toISOString().slice(0, 10)` — à noite, no Brasil, isso já é amanhã.
5. **Rota só existe se estiver no mapa.** `navigate`, `to` e `route:` apontam
   para `StaffAppRoutes.tsx` ou `App.tsx`; o teste acusa o resto. Rota
   planejada e ainda não criada entra na lista `PLANEJADAS` do teste, com
   registro em `nao-funciona.md`.

## Verificação

`npm run lint` (não pode piorar a linha de base em `docs/nao-funciona.md`),
`npm run test` (Vitest) e `npm run build` verdes.

Onde cada regra se prova:

- **Regra que vive no banco** (RLS, trigger, RPC) — pgTAP em
  `supabase/tests/database/`, rodado com `supabase test db --linked` contra o
  `test-helpoint` e no CI contra um banco do zero.
- **Regra pura** — Vitest. `src/test/setup.ts` já existe.
- **Caminho do usuário** — navegação real contra o `test-helpoint`.

**Um comando verde prova que o comando passou, não que a causa foi embora.**
Pergunte sempre o que o teste teria feito se o bug estivesse lá.

### pgTAP contra o schema real

1. `SET ROLE` não pode acontecer dentro de função `SECURITY DEFINER`.
2. Ao inserir em `auth.users` na mão, `confirmation_token`, `recovery_token`,
   `email_change_token_new` e `email_change` precisam ser `''` e **nunca
   NULL** — o GoTrue as lê como `string`. Com NULL o pgTAP passa e só o login
   real falha, com um 500 que não menciona a causa. Isso é obrigação do
   helper em `supabase/tests/database/_helpers.sql`.
3. O schema `tests` precisa de `grant usage ... to authenticated`. Depois de
   `authenticate_as` o teste roda como `authenticated` e, sem isso, não
   consegue nem chamar `clear_authentication` para voltar atrás — o erro
   aponta para a linha do teste, não para a causa.
4. A identidade é simulada escrevendo `request.jwt.claims` e virando o papel
   `authenticated`: é de lá que `auth.uid()` lê o `sub`, e é `auth.uid()` que
   todo o RLS deste sistema pergunta. Não há indireção por variável própria.
5. `supabase test db` **roda o pg_prove em container**: sem o Docker Desktop
   de pé ele falha em `LegacyDockerRunError`, antes de tocar no banco.
6. Nada da suíte fica no banco: os helpers nascem dentro da transação do teste
   (`\ir _helpers.psql` depois do `begin;`) e somem no `rollback`. Um schema com
   função capaz de criar usuário não pode sobreviver ao fim da suíte.
7. O helper é `.psql`, **não** `.sql`, de propósito: `supabase test db`
   entrega ao pg_prove todo `.sql`/`.pg` da pasta. Com `.sql` ele rodaria
   sozinho, sem `begin`, e commitaria o schema `tests` no banco — com
   `create_user` executável por `authenticated`. Em `--linked`, porta aberta.

## Pareamentos

- **Revisar mudanças**: `code-review` e depois `ponytail-review`. O primeiro
  cobre padrão e corretude; o segundo cobre excesso. Eixos diferentes.
- **Consertar bug**: `diagnosing-bugs` antes de editar. Diagnosticar por
  hipótese em vez de por experimento controlado custa caro aqui.
- **`tdd`**: pgTAP para regra de banco, Vitest para regra pura.

## Time de agentes

Subagentes em `.claude/agents/`, cada um com seu modelo e suas skills. Fluxo em
`docs/agents/fluxo.md`.

| Agente | Modelo | Faz | Não faz |
|---|---|---|---|
| `planejador` | Fable 5.1 | Lê o sistema, grelha a fronteira, escreve o plano executável | Não edita código |
| `executor` | Sonnet 5 | Aplica plano escrito | Não decide |
| `auditor` | Fable 5.1 | Revisa o diff, roda as provas, devolve achados | Não corrige |
| `aprovador` | Sonnet 5 | Monta o dossiê para o humano | Não faz merge, push nem deploy |

**Não se delega:** schema, RLS, cálculo que vira regra de negócio, e o portão
de revisão final — são do humano.

## Agent skills

- **Issue tracker**: markdown local em `.scratch/` — ver `docs/agents/issue-tracker.md`
- **Domain docs**: o banco e `docs/inventario-sistema.md`; ADRs em `docs/decisoes.md` — ver `docs/agents/domain.md`
