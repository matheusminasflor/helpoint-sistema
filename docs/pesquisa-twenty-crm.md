# Pesquisa — Twenty CRM como referência para o CRM do Comercial

Leitura do código-fonte de 2026-09-10 (`twentyhq/twenty`, commit `a4f14ce1`,
pacotes na versão 2.40.0). Três agentes leram o repositório em paralelo —
automações; modelo de dados, API, importação e visões; e-mail, IA, permissões,
apps e interface — e este documento condensa o que encontraram. Serve de base
para o ADR-007 e para as levas E1–E5 do Comercial. Não decide nada sozinho.

Termos: *workspace* = a empresa dentro do Twenty (o nosso *tenant*); *objeto* =
um cadastro (pessoa, empresa, oportunidade); *metadado* = a definição de um
objeto ou campo guardada como dado; *workflow* = automação em forma de fluxo;
*run* = uma execução de um fluxo; *DAG* = grafo sem ciclo, passos ligados por
setas.

---

## 0. A pergunta e a resposta curta

O dono perguntou se o repositório `Fang-Zhang/twenty-Saleforce-clone-CRM`
ajuda o CRM do Helpoint. Esse repositório é uma **cópia inativa** do Twenty
(3 estrelas, nenhum commit próprio, nenhuma alteração). Se algo for aproveitado,
é do projeto original.

O Twenty é um CRM open source **ativo e bem feito** (56 mil estrelas, ~15 mil
commits, empresa de benefício público). Mas ele é um sistema inteiro, com
servidor NestJS, fila Redis, worker e um esquema de banco por empresa. O
Helpoint sobe com Vercel + Supabase e faz a regra de negócio em RLS, trigger e
função SQL. Rodar o Twenty ao lado duplicaria login, empresa, contato e negócio;
substituir o nosso CRM por ele jogaria fora o CRM-1 e a integração
pedido → pagamento → negócio que vive no mesmo banco (ADR-006).

**Decisão (ADR-007): o Twenty é referência de produto, não componente.** Nada
do código dele entra no Helpoint. O que entra são padrões, listados na seção 8
e distribuídos pelas levas E1–E5.

## 1. Licença: o que pode e o que não pode

- Raiz: **AGPL-3.0**, com uma "Twenty Application Exception" que libera apps
  construídos sobre as APIs publicadas. Copiar código AGPL para o Helpoint —
  que não tem licença declarada e portanto é proprietário — obrigaria a abrir o
  código do Helpoint. **Ideias e desenhos são livres.**
- **367 arquivos comerciais** marcados com `/* @license Enterprise */`
  (server 310, front 52, shared 5). Onde se concentram: cobrança e Stripe
  (`core-modules/billing`, 146; `billing-webhook`, 23), medição de uso e limites
  (25 + 5), SSO/SAML/OIDC (`core-modules/sso` 14, `settings/security` 23,
  `auth` 10), **permissão por linha** (`row-level-permission-predicate` 19,
  `settings/roles` 19, handlers de migração 12, `twenty-orm/utils` 5), audit
  log (`event-logs` 12). Nada disso pode ser usado nem sob AGPL.
- **MIT**: `twenty-sdk`, `twenty-client-sdk`, `create-twenty-app`,
  `twenty-shared`, `twenty-ui` e os apps de `twenty-apps/public/*`. Poderiam
  ser usados, mas `twenty-ui` é Emotion + Linaria + `@base-ui/react`, com tema
  em variáveis próprias — misturar com Tailwind/shadcn dá conflito de tema e
  dobra o bundle. Vale como **catálogo** do que um CRM precisa (Chip, Tag,
  Status, MenuItem em 15 variantes, AvatarGroup), não como dependência.

## 2. Pilha e implantação

| | Twenty | Helpoint |
|---|---|---|
| Servidor | NestJS + BullMQ (filas) + Redis, worker separado | Não há: RLS, triggers, funções SQL, edge functions |
| Banco | Postgres 16, **um schema por workspace** com DDL em tempo de execução; ClickHouse opcional | Postgres do Supabase, `tenant_id` + RLS em toda tabela |
| Front | React 19, Apollo Client 4, Jotai, Emotion/Linaria, `@base-ui/react` | Vite + React 18, React Query, shadcn/ui |
| Monorepo | Nx, 20 pacotes, oxlint próprio, Storybook + Argos | um app + `supabase/` |
| Deploy | Docker Compose com `server`, `worker`, `db`, `redis` (`packages/twenty-docker/docker-compose.yml`) | Vercel + Supabase |
| Idiomas | Lingui, 35 locales, **pt-BR 98,9 % traduzido** (`twenty-front/src/locales/pt-BR.po`) | pt-BR fixo |

O isolamento entre empresas no Twenty é feito **fora do banco**: o ORM caseiro
(`twenty-server/src/engine/twenty-orm/`) injeta o nome do schema no SQL e
aplica permissões e "RLS lógica" em TypeScript
(`repository/permissions.utils.ts`). Isso existe porque o schema é dinâmico. No
Helpoint o banco garante o isolamento (ADR-005), que é mais simples e mais
seguro. É a diferença que torna o Twenty inadequado como peça e útil como
referência.

## 3. Modelo de dados

**31 objetos padrão** (`twenty-shared/src/metadata/constants/standard-object.constant.ts`):
person, company, opportunity, note/noteTarget, task/taskTarget, attachment,
timelineActivity, message/messageThread/messageParticipant/messageThreadTarget,
calendarEvent/calendarEventParticipant/calendarEventTarget, workflow,
workflowVersion, workflowRun, workflowAutomatedTrigger, workspaceMember,
dashboard, recordShare, blocklist, messageCampaign/messageList/messageListMember,
callRecording e associações.

**Campos base em toda tabela**: `id`, `createdAt`/`updatedAt`, `deletedAt`
(lixeira), `position` (número fracionário para ordem manual), `createdBy`/
`updatedBy` ("ator": fonte — pessoa, API, fluxo, IA — mais nome e contexto) e
`searchVector` (`tsvector` gerado pelo banco).

**25 tipos de campo** (`twenty-shared/src/types/FieldMetadataType.ts`): ACTOR,
ADDRESS, ARRAY, BOOLEAN, CURRENCY, DATE, DATE_TIME, EMAILS, FILES, FULL_NAME,
LINKS, MORPH_RELATION, MULTI_SELECT, NUMBER, NUMERIC, PHONES, POSITION, RATING,
RAW_JSON, RELATION, RICH_TEXT, SELECT, TEXT, TS_VECTOR, UUID. Os compostos
(e-mail, telefone, endereço, moeda, nome, links) **viram várias colunas**
(`emailsPrimaryEmail` + `emailsAdditionalEmails`, `amountMicros` +
`currencyCode`, `addressStreet1`…), com o subcampo que entra na chave única
marcado explicitamente. Dinheiro é `amountMicros numeric`, nunca float.

**Oportunidade** = `name`, `amount`, `closeDate`, `stage` (SELECT com opções
NEW/SCREENING/MEETING/PROPOSAL/CUSTOMER, cada uma com cor e posição),
`pointOfContact` → person, `company`, `owner`. Ou seja: **o Twenty tem um funil
só**, e a etapa é uma opção de lista; vários funis se fazem com visões e campos.
O Helpoint já tem etapa como tabela (`crm_pipeline_stages`), que é o desenho
melhor para vários funis.

**Deduplicação declarativa**: `objectMetadata.duplicateCriteria` guarda
critérios como `[[nome, sobrenome], [linkedin], [e-mail]]` (OU de Es); um
helper único traduz em `WHERE`; endpoint `findDuplicates`; **mesclar** até 9
registros escolhendo o prioritário e migrando as relações dos perdedores
(`common-merge-many-query-runner.service.ts`).

**Lixeira**: `delete` (marca), `destroy` (apaga), `restore`; leitura filtra
`deletedAt` por padrão; retenção 14 dias. **Ordem manual**: `position`
fracionário, "primeiro" = `min - 1`, "último" = `max + 1`, nunca renumera.

**Campos e objetos personalizados**: o usuário cria pela tela; o metadado vai
para `core.objectMetadata` / `core.fieldMetadata` e um motor de migração
declarativa (`workspace-migration-builder` + `-runner`, ~35 handlers) emite
`CREATE TABLE` / `ALTER TABLE` no schema da empresa. É a peça mais cara do
projeto — dezenas de milhares de linhas — e **não cabe no Supabase**: quebra
RLS por policy, PostgREST, geração de tipos e migrations. O equivalente aqui é
um catálogo de definições por empresa mais uma coluna `jsonb` validada por
trigger (leva E2).

## 4. API pública, webhooks, importação, visões

**REST** (`twenty-server/src/engine/api/rest/`): `/rest/:object` com listar,
buscar por id, criar, criar em lote, atualizar, apagar/destruir/restaurar,
duplicatas, mesclar, agrupar com agregações; filtros numa mini-linguagem
própria; paginação por cursor (base64 dos campos de ordenação + id); limite 60
por página, máximo 200. REST de metadados (`/rest/metadata/objects|fields|views…`).
**GraphQL** gerado por workspace. **Servidor MCP** embutido para agentes de IA.

**Chave de API**: um JWT assinado com validade de 100 anos; a chave em si não
é gravada, e revogar depende de uma lista em cache. Não copiar — preferir token
aleatório com hash na tabela e prazo.

**Webhooks de saída** (`engine/metadata-modules/webhook/`): `targetUrl`,
`operations` com curinga (`*.*`, `person.*`, `*.created`), segredo, eventos
`created/updated/deleted/destroyed/restored/upserted`. Entrega por fila em
lotes de 20, 3 tentativas, timeout de 5 s, bloqueio de endereço interno
(SSRF), assinatura `HMAC-SHA256(secret, "timestamp:payload")` + nonce nos
cabeçalhos. Sem tabela de entregas: fica um evento de log com status.

**Importação de planilha** (`twenty-front/src/modules/spreadsheet-import/`):
assistente de 6 passos — enviar arquivo (CSV/XLSX), escolher aba, escolher
linha de cabeçalho, **casar colunas** (sugestão automática por semelhança de
nome, opção "não importar"), **validar numa grade editável** (erros por linha,
toggle "só linhas com erro", duplicatas dentro do arquivo pelas chaves únicas),
importar em **lotes de 200** com upsert, barra de progresso e cancelamento;
teto de 10 000 linhas; sanitização contra injeção CSV (`^[=+\-@\t\r]`) na
exportação. Exportação em CSV paginada de 200.

**Visões como dado** (`engine/metadata-modules/view*/`): `view` (tipo tabela,
kanban, calendário, lista; filtro livre; agregação do kanban; campo de data do
calendário), `viewField` (visível, largura, posição, **agregação de rodapé**:
soma, média, contagem, vazios, porcentagens), `viewFilter` (campo, operando,
valor, subcampo), `viewFilterGroup` (E/OU/NÃO aninhado), `viewSort`,
`viewGroup` (colunas do kanban). Operandos: é, não é, contém, vazio, relativo,
no passado, no futuro, hoje, busca vetorial. O front separa "o que está na
tela" de "a visão salva" e só oferece "Salvar" quando difere.

## 5. Automações (workflows) — a peça mais interessante

**Entidades** (`twenty-server/src/modules/workflow/common/standard-objects/`):
`workflow` (nome, status) → `workflowVersion` (`trigger` jsonb + `steps` jsonb;
imutável depois de publicada; **índice único parcial garante uma versão ativa
por fluxo**) → `workflowRun` (`state` com **cópia congelada do fluxo** +
estado por passo, `stepLogs`, status, quem disparou) → `workflowAutomatedTrigger`
(índice de despacho para eventos e agenda). Os schemas Zod em
`twenty-shared/src/workflow/schemas/` validam no servidor, tipam o front e
viram JSON-Schema das ferramentas de IA — uma fonte só.

**Formato do passo**: `{id, name, valid, nextStepIds[], position, settings:{input, outputSchema, errorHandlingOptions:{retryOnFailure 0..3, continueOnFailure}}}`.
Os passos ficam num array plano; a forma do grafo está nos ponteiros `nextStepIds`.

**Gatilhos** (`workflow-trigger/types/workflow-trigger.type.ts`):

| Gatilho | Como funciona |
|---|---|
| Evento de registro (`DATABASE_EVENT`) | `person.updated`, com lista de campos observados e filtro; só dispara se um campo observado mudou (`updatedFields` vem no payload) |
| Manual | vira item do menu de comando: global, por registro ou por lote |
| Agenda (`CRON`) | dias/horas/minutos/expressão; um job global por minuto lê um hash no Redis |
| Webhook | `POST /webhooks/workflows/:workspace/:workflow`, com API key opcional |

**Ações (19)** (`twenty-shared/src/workflow/types/WorkflowActionType.ts`):
criar/atualizar/apagar/upsert/buscar/escolher registro; código (função
serverless); função lógica de um app; enviar e-mail; rascunhar e-mail; criar
evento de agenda; requisição HTTP; agente de IA; filtro; se/senão (N ramos);
iterador; espera; formulário (pausa até um humano responder); vazio. Todas
implementam um método `execute()` que devolve um objeto de controle
(`result`, `error`, `pendingEvent`, `shouldEndWorkflowRun`,
`shouldSkipStepExecution`, `shouldFailSafely`) — adicionar uma ação é uma
classe e uma linha no `switch`.

**Execução** (`workflow-executor.workspace-service.ts`, 679 linhas): evento →
job de gatilho → `run()` (limite duro de 5 000 execuções/hora; manual fura a
fila) → admissão `NOT_STARTED → ENQUEUED` por workspace (100/min, lock, FIFO
guardado no Postgres, não em memória) → executor: um passo roda quando todos os
pais terminaram; num se/senão, os ramos perdedores viram `SKIPPED` para os
filhos (`get-effective-parent-status.util.ts`), o que resolve junções sem
contabilidade extra; estados por passo `NOT_STARTED / RUNNING / SUCCESS /
STOPPED / FAILED / FAILED_SAFELY / PENDING / SKIPPED`; tentativas com atraso
fixo `[1 s, 5 s, 15 s]` só para erro de sistema; **teto de 20 passos por job**,
depois reenfileira com o último passo executado; escrita do log por `jsonb_set`
atômico; espera e formulário deixam o run `PENDING` e o job termina; runs
travados há 1 h só são sinalizados, nunca finalizados à força; retenção de
1 000 runs / 14 dias. Lista de objetos que um fluxo **não pode** escrever
(`ObjectsBlockedFromAutomation.ts`: os próprios workflows, membros, e-mails,
agenda) evita o laço "fluxo que dispara a si mesmo".

**Variáveis**: `{{stepId.campo}}` e `{{trigger.after.company.name}}`,
resolvidas por `variable-resolver.ts`; o gatilho enriquece o registro com as
relações antes de disparar.

**Código do usuário**: `logic-function` com três drivers — desligado, local
(**processo filho, sem sandbox**) e AWS Lambda; timeout 15 min; transpila TS
uma vez por run. Só faz sentido no modelo self-hosted deles.

**Eventos por baixo**: `EventEmitter2` **em processo**, emitido pelo ORM (só
captura escritas que passam por ele; perde eventos se o processo cair). O
listener central (`entity-events-to-db.listener.ts`) não trabalha: só faz o
fan-out de um evento para cinco filas (subscriptions, webhooks, gatilhos,
linha do tempo, audit log). Em Postgres, um trigger `AFTER` captura tudo,
inclusive escrita por SQL — é estritamente melhor.

**Editor**: `@xyflow/react` 12 + `@dagrejs/dagre` (ambos MIT). A mesma base
de canvas serve para editar, ler e **ver um run colorido por status do passo**;
editar um fluxo publicado cria um rascunho automaticamente; 23 ferramentas
expõem o editor inteiro a um agente de IA.

## 6. As outras ferramentas

**E-mail e agenda** (`modules/messaging/`, `modules/calendar/`,
`modules/connected-account/`): Gmail, Microsoft Graph (batch e delta), IMAP/SMTP,
CalDAV, e-mail de entrada via Resend ou SES. Tokens em coluna encriptada com
**CHECK no banco exigindo o prefixo `enc:v2:`** — impossível gravar token em
claro. Visibilidade por canal em três níveis (`METADATA` / `SUBJECT` /
`SHARE_EVERYTHING`) aplicada na leitura: a equipe vê que houve um e-mail sem
ver o conteúdo. **Criação automática de contato** só para quem você escreveu
(política `SENT`), filtrando e-mail em massa, grupos, unsubscribe e domínios
genéricos; empresa deduzida do domínio. Blocklist por endereço ou `@dominio`
com efeito retroativo (apaga o já importado; remover reimporta). Sincronização
em duas fases, webhook primeiro e cron `2-59/5` como rede de segurança,
throttle com backoff e crons de auto-cura. Escopos OAuth validados logo após
o consentimento (falha cedo se o usuário desmarcou um).

**IA** (`engine/metadata-modules/ai/`): agentes com prompt, modelo, formato de
resposta e **papel de permissão próprio**; ferramentas **geradas do metadado**
(CRUD por objeto, fluxos, papéis, visões, webhooks, dashboards, e-mail, HTTP,
interpretador de código); **descoberta progressiva** — o agente vê um índice
enxuto e carrega o schema só do que vai usar (`get-tool-catalog` /
`learn-tools` / `execute-tool`); saída grande vira artefato pesquisável em vez
de estourar o contexto; um LLM-juiz avalia os turnos; MCP embutido; Vercel AI
SDK 6 com OpenAI, Anthropic, Google, Azure, Bedrock, Mistral, xAI e
"compatível"; **chave por instância**, não por empresa; templates `{{VAR}}`
resolvidos só no catálogo oficial (evita exfiltrar segredo por provedor
customizado). O Helpoint já tem chave por empresa (`_shared/ai.ts`), que é
mais adequado a produto.

**Permissões** (`engine/metadata-modules/role/`): papel com flags globais →
`roleTarget` (**o mesmo mecanismo para pessoa, chave de API e agente de IA**,
com CHECK de exclusividade) → permissão por objeto (ler, editar, apagar,
destruir) → por campo (só nega) → 29 flags de configuração → predicados por
linha (comercial). Quando um agente age por alguém, vale a **interseção** dos
dois papéis. Trava impede o admin de remover o próprio acesso.

**Linha do tempo** (`modules/timeline/`): tipos declarativos com `emit.on` e
`through` (uma nota aparece na pessoa e na empresa via tabela de junção);
guarda **só o diff** do registro (`keepDiffOnly`); campos não auditáveis
ficam fora; updates repetidos colapsam.

**Notas e tarefas**: texto rico BlockNote (e TipTap no compositor de e-mail);
alvos many-to-many; anexos local ou S3; menções `@`.

**Apps e SDK** (`twenty-sdk`, `twenty-apps`): um app declara objetos, campos,
visões, layouts, itens de menu, funções serverless, componentes React
embutidos, agentes e papéis; instalação por manifesto → diff → migração, com
`universalIdentifier` estável; marketplace; cobrança por app; Zapier
genérico. Infra de plataforma, não cabe agora.

**Interface** (`twenty-front/src/modules/`): menu de comando `Cmd+K` como
painel lateral com pilha de páginas, `/` busca, `@` IA; página de registro
por layout persistido (abas e widgets); kanban `@dnd-kit/react` com multi-drag
e update otimista; tabela com célula editável em portal e navegação por
teclado; busca global `tsvector` + `unaccent` + prefixo + fallback ILIKE com
timeout; **pilha de foco** para atalhos não vazarem entre modal, dropdown e
tabela.

## 7. Comparação com o Helpoint

| Área | Twenty | Helpoint hoje | Entra em |
|---|---|---|---|
| Funil | etapa = opção de lista com cor e posição, um funil | tabela de etapas, só o nome editável | **E1**: vários funis, ordem, cor, tipo, criar/remover |
| Campos personalizados | DDL por workspace | não há | **E2**: catálogo por empresa + `jsonb` validado por trigger |
| Importação | 6 passos, dedupe, lotes de 200 | não há | **E3**: mesmo fluxo, dedupe no banco (regra do `crm-lead-intake`), desfazer |
| Indicadores | agregações por grupo, dashboards | painel de chamados | **E4**: função SQL + aba Vendas |
| Automação | grafo, 4 gatilhos, 19 ações, runs, canvas | 1 gatilho + 1 ação, só chamados, inline | **E5**: motor de fluxo no banco + worker externo + canvas |
| Visões salvas | tabela/kanban/calendário como dado | fixas | fora (gatilho: pedido de "salvar este filtro") |
| E-mail/agenda | 4 provedores, contato automático | não há | fora (gatilho: decisão de caixa de e-mail no CRM) |
| IA | agentes com ferramentas do metadado | Lyra, chave por empresa | fora; "descoberta progressiva" anotada para a Lyra |
| Permissões | por objeto/campo/flag em TS | RLS + módulo | fora; modelo por objeto anotado para "vê mas não edita" |
| Webhooks de saída | HMAC, fila, curinga | não há | parcial: passo `http_request` do E5 |
| Lixeira/restaurar | em tudo | não há | fora (gatilho: primeiro "apaguei sem querer") |
| Dedupe/mesclar | declarativo, mescla até 9 | reaproveita por e-mail/telefone no lead | parcial: E3 reaproveita; mesclar fica fora |

## 8. O que copiar (padrão → onde)

1. **Versão imutável + cópia congelada no run** → `automation_runs.flow` (E5).
2. **Passos em array plano, grafo por `next`** → `automation_workflows.steps` (E5).
3. **Campos observados + filtro reaproveitando o motor da condição** →
   `updated_fields[]` no payload e `automation_filter_matches()` usada pelo
   gatilho e pelo passo "condição" (E5).
4. **Quem captura o evento não trabalha, só enfileira** → trigger SQL insere o
   run; passos SQL rodam inline com teto; passos externos esperam o worker (E5).
5. **Fila de admissão no Postgres**, FIFO, `FOR UPDATE SKIP LOCKED` →
   `automation_tick()` por minuto (E5).
6. **Teto de 20 passos e reenfileira** → mesmo número (E5).
7. **`FAILED` / `FAILED_SAFELY` / `SKIPPED` por passo, `continue_on_failure`,
   3 tentativas** → `context.steps[id]` (E5).
8. **`jsonb_set` atômico no log** → idêntico (E5).
9. **Objetos bloqueados para automação** → fluxo não escreve em
   `automation_*`; escrita feita por fluxo não dispara fluxo (E5).
10. **Zod compartilhado + validação no banco** → `src/lib/automation-flow.ts`
    + `automation_validate_flow()` (E5).
11. **Canvas com posições calculadas e painel lateral por passo** →
    `@xyflow/react` + dagre (E5-A3).
12. **Runs como registro de primeira classe** → `automation_runs` via
    PostgREST + RLS, página de execuções (E5-A3).
13. **Opção de lista com `label/color/position` como dado** → cor e ordem da
    etapa (E1); opções do campo `select` (E2).
14. **Importação em 6 passos, casamento automático, grade de validação, lotes
    de 200, cancelamento, anti-injeção CSV** → E3.
15. **Dedupe declarado uma vez, usado em todo caminho** → a regra de
    e-mail/telefone sai do TypeScript do `crm-lead-intake` e vira função SQL
    usada pela edge function e pela importação (E3).
16. **Agregações por grupo (soma, contagem, média) no banco** → `crm_sales_metrics()` (E4).
17. **Bloqueio de endereço interno em requisição HTTP, timeout curto, 3
    tentativas** → passo `http_request` (E5-A2).
18. **Dinheiro em inteiro/numeric, nunca float** → já é `numeric(14,2)`; mantido.

## 9. O que não copiar, e por quê

- **Schema por empresa e DDL em tempo de execução**: exige ORM próprio, motor
  de migração, cache de metadados e kill-switch de deploy; incompatível com RLS
  e PostgREST.
- **Permissões e "RLS" em TypeScript**: o banco do Helpoint já faz isso melhor.
- **GraphQL gerado por workspace** e **ORM caseiro**: só existem por causa do
  schema dinâmico.
- **API key como JWT de 100 anos** revogado por cache.
- **Enum nativo do Postgres para listas**: alterar enum é migration dolorosa;
  `text` + CHECK ou tabela de opções.
- **`EventEmitter` em processo, locks e contadores em Redis, BullMQ, cron
  global por minuto lendo Redis**: Postgres tem `pg_cron`, advisory lock,
  `SKIP LOCKED` e `pg_net`.
- **Driver local de código do usuário**: sem sandbox; aqui seria edge function.
- **BlockNote e TipTap ao mesmo tempo**; **Nx com 20 pacotes**.
- **Cobrança, SSO, permissão por linha, audit log**: comerciais — nem podem.
- **`twenty-ui` como design system**: conflito com shadcn/Tailwind.

## 10. Arquivos do Twenty para ler primeiro (para quem for implementar o E5)

1. `packages/twenty-shared/src/workflow/types/WorkflowActionType.ts`,
   `schemas/base-workflow-action-schema.ts`, `schemas/base-workflow-action-settings-schema.ts`
2. `packages/twenty-server/src/modules/workflow/workflow-executor/workspace-services/workflow-executor.workspace-service.ts`
3. `packages/twenty-server/src/modules/workflow/workflow-runner/jobs/run-workflow.job.ts`
4. `packages/twenty-server/src/modules/workflow/workflow-trigger/automated-trigger/listeners/workflow-database-event-trigger.listener.ts`
5. `packages/twenty-server/src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts`
6. `packages/twenty-server/src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-run-enqueue.workspace-service.ts`
7. `packages/twenty-front/src/modules/workflow/workflow-diagram/utils/generateWorkflowDiagram.ts`
8. `packages/twenty-front/src/modules/spreadsheet-import/` (para o E3)
9. `packages/twenty-server/src/engine/metadata-modules/view/entities/view.entity.ts` (quando visões salvas entrarem)

Não confirmado nesta rodada: a documentação em `twenty.com/developers` estava
bloqueada pela rede da sessão; tudo acima vem do código, não da documentação.
