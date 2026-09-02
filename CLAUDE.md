# Helpoint

Sistema operacional corporativo multi-tenant: chamados, inventário, qualidade e
SAC, marketing, RH e financeiro, com uma camada de IA (Lyra). Roda em produção.

**Vite 5 + React 18 + react-router-dom 6 + shadcn/ui + Supabase.** SPA falando
direto com o banco: não há camada de servidor entre o navegador e o Postgres.

## A regra que originou este arquivo

**O sistema que roda é a especificação.** Antes de construir qualquer coisa,
leia o que já existe — código, schema, edge function. Este projeto já pagou
caro por não fazer isso: uma reconstrução inteira foi escrita a partir de um
documento de projeto que não descrevia as telas, e quatro módulos prontos foram
reinventados do zero. Ela está arquivada em `../helpoint-saas`, tag
`arquivo/next-js-saas`.

Onde o `docs/arquitetura.md` e o banco real divergirem, **o banco real ganha**.

## Onde as coisas estão

| Documento | O que é |
|---|---|
| `docs/SYSTEM_DOCUMENTATION.md` | O que o próprio sistema diz que é |
| `docs/ARQUITETURA_MIGRACAO.md` | Arquitetura e migração, escrito no projeto |
| `docs/inventario-sistema.md` | Varredura dos 80 rotas e 6 módulos. **§8.7 lista 18 itens que existem no código e não funcionam** — leia antes de "consertar" algo que nunca funcionou |
| `docs/arquitetura.md` | Registro de decisões (ADRs 001–018, modelo de segurança) da reconstrução encerrada. Histórico, **não** especificação |

## Ambientes Supabase

| Projeto | Ref | Uso |
|---|---|---|
| lovable | `csbhhvgnbpleinxlpkcd` | **Produção com dados reais.** Nunca aponte dev para cá, nunca aplique migration aqui |
| test-helpoint | `gmvvxulubthkagmsngas` | Desenvolvimento e testes |
| producao | `joafqgmiirggohxkomrl` | Zerado, reservado para o deploy |

`.env` fica fora do Git; `.env.example` documenta as chaves. Só chave
*publishable* entra em arquivo — `service_role` vive nos secrets das edge
functions.

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
sozinho (arquivo, schema, log); **decisão é sua**.

### 2. `ponytail` — enquanto construo

Suba a escada e pare no primeiro degrau que segura: isto precisa existir? já
existe aqui? o stdlib resolve? a **plataforma** resolve (constraint, policy de
RLS, trigger, `<input type="date">`, CSS)? dá em uma linha? Só então o mínimo
que funciona.

Num repositório de 350 arquivos que já faz quase tudo, o degrau que mais
segura é o segundo. Duas vezes na adoção deste código eu quase importei
função que o sistema já tinha — `previousRange` (o `useHelpdeskMetrics` já
calcula tendência) e o cálculo de SLA (**um trigger no banco preenche o
`sla_due_at`**). Procure antes de escrever.

Correção de bug é causa raiz, não sintoma: antes de editar, procure todos os
chamadores da função que vai tocar. Simplificação deliberada com teto conhecido
leva comentário `ponytail:` nomeando o teto e a saída.

### 3. `lean-ctx` — o tempo todo

Grep e Glob nativos estão negados; as ferramentas `ctx_*` os substituem.
`ctx_read -m map` para descobrir a superfície de um arquivo, `ctx_read
-m lines:N-M` para um trecho, leitura completa só para editar. O allowlist
**bloqueia `node -e` e afins**: para editar arquivo use Edit/Write, para script
crie um arquivo em `scripts/`.

## Verificação

`npm run lint`, `npm run test` (Vitest) e `npm run build` verdes.

Onde cada regra se prova:

- **Regra que vive no banco** (RLS, trigger, RPC) — pgTAP no `test-helpoint`.
  Nunca no `csbhhvgnbpleinxlpkcd`.
- **Regra pura** — Vitest. O projeto já tem `src/test/setup.ts`.
- **Caminho do usuário** — navegação real. Foi ela, e não teste verde, que
  revelou cada divergência séria deste projeto.

**Um comando verde prova que o comando passou, não que a causa foi embora.**
Neste projeto já passaram: uma suíte inteira sobre um `page.tsx` que era o
boilerplate do create-next-app, e três asserções pgTAP que consultavam a caixa
de entrada errada. Pergunte sempre o que o teste teria feito se o bug estivesse
lá.

### Ao escrever o primeiro pgTAP contra o schema real

Duas lições que já custaram uma rodada de depuração cada, e que o helper da
reconstrução encerrada documentava (`git show
arquivo/next-js-saas:supabase/tests/database/_helpers.sql` no `../helpoint-saas`):

1. `SET ROLE` não pode acontecer dentro de função `SECURITY DEFINER`.
2. Ao inserir em `auth.users` na mão, as colunas `confirmation_token`,
   `recovery_token`, `email_change_token_new` e `email_change` precisam ser
   `''` e **nunca NULL** — o GoTrue as lê como `string` do Go. Com NULL o
   usuário é criado, o pgTAP passa (ele simula identidade sem tocar no GoTrue)
   e só o login real falha, com um 500 que não menciona a causa.

## Pareamentos

- **Revisar mudanças**: `code-review` e depois `ponytail-review`. O primeiro
  cobre padrão e corretude; o segundo cobre excesso. Eixos diferentes.
- **Consertar bug**: `diagnosing-bugs` antes de editar. Diagnosticar por
  hipótese em vez de por experimento controlado já custou caro aqui.
- **`tdd`**: pgTAP para regra de banco, Vitest para regra pura.

## Divisão de trabalho entre modelos

| Papel | Modelo | O que faz |
|---|---|---|
| Investigador | Opus 5 | Lê o sistema, diagnostica, apura fato |
| Planejador | Opus 5 | Decide abordagem, escreve o plano executável |
| Executor | Sonnet 5 | Aplica plano escrito. Não decide |

Todos usam as skills instaladas. **Não se delega:** schema, RLS, cálculo que
vira regra de negócio, e o portão de revisão.

## Agent skills

- **Issue tracker**: markdown local em `.scratch/` — ver `docs/agents/issue-tracker.md`
- **Domain docs**: contexto único; glossário e ADRs em `docs/`, não em `CONTEXT.md` — ver `docs/agents/domain.md`
