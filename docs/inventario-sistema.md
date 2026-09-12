# Inventário do sistema

> Levantamento das rotas, telas, componentes, fórmulas, tabelas e fluxos que
> existem neste repositório, módulo a módulo. É a descrição do que roda; o
> código e o banco valem mais que ele onde divergirem.
>
> Stack: React 18 + Vite + TypeScript + React Router (SPA) + TanStack Query +
> Supabase (Postgres, Auth, Storage, Edge Functions) + Tailwind + shadcn/ui.
> Todo caminho citado é relativo à raiz do repositório. O que existe no código
> e não funciona está em `docs/nao-funciona.md`.

---

## 1. Mapa de rotas

### 1.1 Montagem geral (`src/App.tsx`)

O `App` monta `QueryClientProvider` → `BrowserRouter` → `TooltipProvider` →
`AuthProvider`, com dois toasters (`Toaster` do shadcn e `Sonner`)
(`src/App.tsx:27-33`).

O painel autenticado é **montado duas vezes** com o mesmo sub-app de rotas
(`src/App.tsx:57-65`):

| Montagem | Guard | Efeito |
|---|---|---|
| `/t/:slug/*` | `TenantSlugGuard` (`src/App.tsx:58`) | URL whitelabel por tenant |
| `/*` | `LegacyTenantRedirect` (`src/App.tsx:63`) | rota legada sem slug; redireciona para `/t/{slug}` no host padrão |

Ambas renderizam `StaffAppRoutes` (`src/routes/StaffAppRoutes.tsx:61`), e cada
rota interna é embrulhada em `StaffRoute` pelo helper `S()`
(`src/routes/StaffAppRoutes.tsx:54`).

### 1.2 Rotas públicas (`src/App.tsx:35-42`)

| Rota | Página | Arquivo |
|---|---|---|
| `/` | Landing | `src/pages/Landing.tsx` |
| `/login` | Login | `src/pages/Login.tsx` |
| `/t/:slug/login` | Login do tenant | `src/pages/TenantLogin.tsx` |
| `/reset-password` | Redefinir senha | `src/pages/ResetPassword.tsx` |
| `/termos` | Termos de uso | `src/pages/Terms.tsx` |
| `/onboarding/empresa` | Onboarding da empresa | `src/pages/OnboardingCompany.tsx` |
| `/convite/:id` | Aceitar convite | `src/pages/AcceptInvite.tsx` |

### 1.3 SAC público / portal do cliente (`src/App.tsx:44-55`)

Todas dentro do guard `StaffAwayFromSAC` (`src/App.tsx:46`), que impede um
usuário staff de navegar como consumidor.

| Rota | Página | Arquivo |
|---|---|---|
| `/sac` | redirect → `/sac/acesso` | `src/App.tsx:45` |
| `/sac/acesso` | Gateway de acesso | `src/pages/sac/Gateway.tsx` |
| `/sac/entrar` | Login por OTP | `src/pages/sac/OTPLogin.tsx` |
| `/sac/cadastro` | Cadastro de cliente | `src/pages/sac/Register.tsx` |
| `/sac/novo` | Formulário público de reclamação | `src/pages/sac/PublicForm.tsx` |
| `/sac/login` | redirect → `/sac/entrar` | `src/App.tsx:51` |
| `/sac/meus-chamados` | Meus chamados (cliente) | `src/pages/sac/MyTickets.tsx` |
| `/sac/meus-chamados/:id` | Detalhe do chamado (cliente) | `src/pages/sac/MyTickets.tsx` (`MyTicketDetail`) |
| `/sac/base-conhecimento` | Base de conhecimento do cliente | `src/pages/sac/KnowledgeBase.tsx` |

### 1.4 Painel autenticado (`src/routes/StaffAppRoutes.tsx:63-128`)

Prefixo: `/t/:slug/…` ou `/…` (sem slug — `LegacyTenantRedirect` redireciona).

#### Geral / transversal

| Rota | Página | Linha |
|---|---|---|
| `inicio` | `Dashboard` | `StaffAppRoutes.tsx:64` |
| `helpdesk` | `CollaboratorView` (visão do colaborador) | `:65` |
| `helpdesk/:id` | `TicketDetail` | `:66` |
| `inventario` | `Inventory` | `:78` |
| `meu-rh` | `MeuRH` | `:121` |
| `nova-solicitacao` | `NewRequest` | `:122` |
| `agenda` | `Agenda` | `:123` |
| `base-conhecimento` | `Portal` | `:124` |
| `base-conhecimento/:id` | `TutorialViewer` | `:125` |
| `portal` | redirect → `../base-conhecimento` | `:126` |
| `portal/:id` | `TutorialViewer` | `:127` |
| `*` | `NotFound` | `:128` |

#### TI

| Rota | Página | Linha |
|---|---|---|
| `ti` | redirect → `chamados` | `:67` |
| `ti/chamados` | `TechnicianView module="tickets"` | `:68` |
| `ti/chamados/:id` | `TicketDetail` | `:69` |
| `ti/licencas` | `Licenses` | `:70` |
| `ti/contratos` | `Contracts` | `:71` |
| `ti/manutencoes` | `Maintenances` | `:72` |
| `ti/indicadores` | `TIRelatorios` | `:73` |
| `ti/configuracoes` | `TIConfiguracoes` | `:74` |
| `ti/pops` | `POPs` | `:75` |
| `ti/pops/novo` | `TutorialEditor` | `:76` |
| `ti/pops/:id/editar` | `TutorialEditor` | `:77` |

#### Configurações do sistema

| Rota | Página | Linha |
|---|---|---|
| `configuracoes/sistema` | `SystemSettings` | `:79` |
| `configuracoes/identidade-visual` | `BrandingSettings` | `:80` |
| `configuracoes/lyra` | `LyraSettings` | `:81` |

#### Automações (aba "Automações" na Configuração de cada módulo; motor de fluxos desde 2026-09-12)

Não é rota própria para a lista: `AutomationsTab` (`src/components/automations/`) entra nas telas de
Configurações de todos os módulos. Editar abre `automacoes/:id` (`AutomacaoEditor`); as execuções,
`automacoes/:id/execucoes`. Um **fluxo** = gatilho + passos em grafo (`automation_workflows.trigger` /
`.steps`, jsonb), executado **no banco** (migration `20260912010000`, ADR-007,
inspirado nos workflows do Twenty — `docs/pesquisa-twenty-crm.md` §5). Substituiu o motor "um gatilho
+ uma ação" da L2: as regras existentes viraram fluxos de um passo e `automation_rules` saiu.

| Gatilho | Como dispara |
|---|---|
| registro criado / alterado (chamado em todo módulo; negócio, contato e pedido no Comercial) | trigger `trg_zz_automation_*` → `automation_enqueue`: casa módulo, cadastro, **campos observados** (`fields`) e **filtro** (`{op, rules:[{path, cmp, value}]}`, `automation_filter_matches`); abre um run com **cópia congelada do fluxo** e roda os passos SQL na mesma transação (teto de 20 por rodada) |
| prazo estourou | `automation_tick()` a cada minuto (cron `automations-tick-1min`, SQL puro), uma vez por chamado (`automation_fired`) |
| dia e hora marcados | `next_run_at` calculado ao ativar (`automation_next_schedule`, `America/Sao_Paulo` fixo); o tick dispara e recalcula |
| webhook | edge function `automation-webhook` (sem JWT): `POST …/automation-webhook/<id do fluxo>` com cabeçalho `X-Helpoint-Secret`; `automation_webhook_fire` confere o hash do segredo (gerado por gerente em `automation_webhook_secret`, mostrado uma vez), limita a 60/min por fluxo e põe o corpo em `trigger.body` |
| manual | botão "Automações" no chamado e no negócio (`ManualAutomationsMenu`) → `automation_run_manual`: abre o run com o registro em `trigger.after` |

Passos: `notify`, `create_task`, `create_ticket`, `assign` (chamado, negócio, contato), `set_priority`,
`set_stage`, `update_record` (allowlist por cadastro, `custom.<chave>`), `create_deal`, `add_note`,
`create_calendar_event`, `condition` (para se falso), `delay` (o run fica `waiting` com `resume_at`; o
tick retoma), `stop`; **passos externos** `send_email` (Resend/SMTP por `_shared/email.ts`),
`http_request` (5 s, bloqueio de endereço interno, erro em HTTP ≥ 400) e `ai_text` (Lyra,
`_shared/ai.ts`; o texto fica em `{{steps.<id>.result.text}}`) deixam o run `waiting` para a edge
function `automation-worker` (cron `automation-worker-1min` via `pg_net`, mesmos segredos do vault de
`check-alerts`), que pega os pendentes com a configuração já renderizada (`automation_claim_external`)
e devolve por `automation_complete_external`; **`branch`** (migration `20260912030000`): ramos
`{name, filter, next[]}` + `else_next[]`, o primeiro ramo cujo filtro vale é o escolhido, a cabeça
de cada ramo perdedor fica `skipped` (`automation_mark_skipped`) e um passo de junção roda quando
todos os pais terminaram (pulado conta como terminado — `get-effective-parent-status` do Twenty).
Em textos valem `{{trigger.after.<campo>}}` (`automation_render`). Cada passo pode
ter `retry` (0–3, atraso 1 s/5 s/15 s) e `continue_on_failure`. Escrita feita por fluxo **não dispara
outro fluxo** (`helpoint.automation = '1'`). Erro fica no run (`automation_runs.error`, estado por passo
em `context.steps`) e em `last_error` do fluxo; nada trava o registro. Só owner/admin/manager gravam
fluxos; quem é do tenant vê fluxos; execuções (que carregam a cópia do registro) só gerente para cima lê, cancela e reexecuta (auditoria de 2026-09-10); cliente não escreve em `automation_runs`. Fora, de
propósito (ADR-007): código do usuário, iterador, formulário que pausa.

**CRM-1d — modelos de fluxo (migration `20260915010000`, 2026-09-12):** o motor ganhou `refresh: true`
num passo (lê o registro de novo antes de decidir — a condição depois de uma espera olha o estado
atual, `automation_subject_row`), `requester_target` em `create_ticket` (quem abre o chamado pode ser
quem criou o pedido), `lost_reason` em `set_stage`, o passo **`create_receivable`** (conta a receber em
`fin_entries` com o total do pedido, vencimento em N dias) e o contexto enriquecido
(`automation_enrich_payload`): gatilho de pedido/negócio leva `trigger.contact` (com `custom` e
`segment`), `trigger.deal`, `trigger.items`, `trigger.items_text` e `trigger.total_text`. A aba
Automações do Comercial tem **"Usar um modelo"** (`AutomationTemplatesDialog`,
`src/lib/automation-templates.ts`): *Proposta aceita → cadastro e cobrança* (dois fluxos: aceita →
chamado de cadastro com a ficha pronta [+ conta a receber, opcional] + aviso; chamado da categoria
resolvido → aviso ao vendedor + tarefa para quem cobra) e *Sem resposta → follow-up e perdido* (parado
na primeira etapa do funil por N h → tarefa; mais N h → Perdido com motivo). Nascem ativos e editáveis.
`automation_validate_flow` e `automation_run_step` são geradas por `scripts/gen-migration-modelos.mjs`
a partir do arquivo original — não editar a migration à mão. **Auditoria de 2026-09-12:** as duas
funções novas (definer) foram revogadas de `anon`/`authenticated` — abertas, liam contato de qualquer
empresa por RPC; um fluxo de um módulo pode observar os chamados de outro pelo `trigger.ticket_module`
(o "cadastro concluído → cobrar" vive no Comercial e olha o chamado que nasceu na TI — sem isso ele
nunca disparava, porque `automation_enqueue` casa por módulo); o aviso de um fluxo disparado por pedido
abre o negócio do pedido (antes apontava para "fluxo", que não abre); o modelo "sem resposta" ignora
negócio importado de planilha (`source = importacao`); datas da conta a receber em `America/Sao_Paulo`.
O contexto do run agora carrega a ficha do contato (inclusive `custom`) — quem lê runs é gerente.
Refresh vale só para o passo que o pediu; registro apagado entre a espera e o refresh mantém o `after`
do disparo (a tarefa nasce para um negócio que não existe mais) — ver `nao-funciona.md`.

No editor, sem passo "Ramificar" a lista é uma cadeia (`linkLinear`); com ele, cada passo e cada ramo
dizem para onde vão ("vai para") e passo sem ninguém apontando barra o salvar (`orphanSteps`). A aba
"Diagrama" desenha o fluxo com `@xyflow/react` + dagre (`FlowCanvas`, posições calculadas, sem
arrastar) e clicar num nó edita o passo. `automacoes/:id/execucoes` (`AutomacaoExecucoes`) lista os
runs, desenha o **snapshot** do run pintado por status de passo, mostra resultado/erro/tentativas por
passo e tem "Reexecutar" (`automation_retry_run`: só run `failed`, só o próprio tenant; limpa os
passos falhos e recomeça por eles com o mesmo contexto) e "Cancelar".

#### Marketing

| Rota | Página | Linha |
|---|---|---|
| `mkt` | redirect → `chamados` | `:82` |
| `mkt/chamados` | `TechnicianView module="marketing"` | `:83` |
| `mkt/social` | `MKTSocialCalendar` | `:84` |
| `mkt/inventario` | `MKTInventory` | `:85` |
| `mkt/fornecedores` | `MKTSuppliers` | `:86` |
| `mkt/indicadores` | `MKTRelatorios` | `:87` |
| `mkt/configuracoes` | `MKTConfiguracoes` | `:88` |

#### Qualidade / SAC (painel interno)

| Rota | Página | Linha |
|---|---|---|
| `qualidade` | redirect → `chamados` | `:89` |
| `qualidade/sacs` | `QualidadeSACList` | `:90` |
| `qualidade/sacs/:id` | `QualidadeSACDetail` | `:91` |
| `qualidade/sacs/:id/laudo` | `TechnicalReport` | `:92` |
| `qualidade/dashboard` | `QualidadeDashboard` | `:93` |
| `qualidade/chamados` | `QualidadeChamados` | `:94` |
| `qualidade/chamados/:id` | `TicketDetail` | `:95` |
| `qualidade/configuracoes` | `QualidadeSettings` | `:96` |

#### RH

| Rota | Página | Linha |
|---|---|---|
| `rh` | redirect → `chamados` | `:97` |
| `rh/chamados` | `TechnicianView module="rh"` | `:98` |
| `rh/chamados/:id` | `TicketDetail` | `:99` |
| `rh/indicadores` | `RHRelatorios` | `:100` |
| `rh/colaboradores` | `RHColaboradores` | `:101` |
| `rh/aprovacoes` | `RHAprovacoes` | `:102` |
| `rh/holerites` | `RHHolerites` | `:103` |
| `rh/beneficios` | `RHBeneficios` | `:104` |
| `rh/folha` | `RHFolha` | `:105` |
| `rh/faltas` | `RHFaltas` | `:106` |
| `rh/reembolsos` | `RHReembolsos` | `:107` |
| `rh/documentos` | `RHDocumentos` | `:108` |
| `rh/configuracoes` | `RHConfiguracoes` | `:109` |

#### Financeiro

| Rota | Página | Linha |
|---|---|---|
| `financeiro` | redirect → `contas-a-pagar` | `:110` |
| `financeiro/chamados` | `FinTickets` | `:111` |
| `financeiro/chamados/:id` | `TicketDetail` | `:112` |
| `financeiro/compras` | `FinPurchaseRequests` | `:113` |
| `financeiro/produtos` | `FinProducts` | `:114` |
| `financeiro/compras/indicadores` | `FinPurchaseIndicators` | `:115` |
| `financeiro/contas-a-pagar` | `FinPayables` | `:116` |
| `financeiro/contas-a-receber` | `FinReceivables` | `:117` |
| `financeiro/fluxo-de-caixa` | `FinCashFlow` | `:118` |
| `financeiro/indicadores` | `FinIndicators` | `:119` |
| `financeiro/configuracoes` | `FinSettings` | `:120` |

#### Comercial e Educacional (desde 2026-09-09 — leva L3a, "receita de módulo")

Dois módulos **só com chamados**, iguais ao RH nessa parte: fila, detalhe, indicadores,
configurações (categorias, prazos, automações, acesso). Sem tabela própria: Comercial ganha CRM e
domínio na L6, Educacional ganha treinamentos na L3b.

| Rota | Página |
|---|---|
| `comercial` | redirect → `chamados` |
| `comercial/chamados`, `comercial/chamados/:id` | `TechnicianView module="comercial"`, `TicketDetail` |
| `comercial/indicadores` | `ComercialRelatorios` → `ModuloRelatorios` (`src/pages/modulo/`) |
| `comercial/configuracoes` | `ComercialConfiguracoes` → `ModuloConfiguracoes` |
| `educacional/…` | idem, `module="educacional"` |

**A receita** (o que um módulo com chamados precisa — migration `20260909020000` é o exemplo):
banco = entrar nos CHECKs de `tickets.module`, `automation_rules.module`, `access_profiles` /
`user_access_profiles.department`; perfis padrão em `seed_default_access_profiles` (matriz genérica
`tickets/dashboard/reports/settings` para módulo sem domínio); categorias padrão em
`seed_categorias_comercial_educacional` (trigger em `tenants` + backfill). Front = uma linha em
`TIModule`, `Department`/`DEPARTMENT_LIST`, `MODULE_BY_DEPARTMENT`, `DepartmentGrid`,
`useVisibleModules`, `AutomationModule`/`TEAM_LABELS`, `CreateTicketForm`, `DEPARTMENT_SCHEMAS`,
sidebar (itens, grupo, breadcrumb, `getActiveGroupId`), rotas, e as duas páginas finas sobre
`ModuloConfiguracoes`/`ModuloRelatorios`. `check-alerts` tem o mapa módulo→departamento.
Achado da leva: **tenant novo nascia sem perfil de acesso de módulo nenhum** — o trigger
`trg_seed_categories_novos_modulos` agora semeia os perfis dos sete módulos.

#### Comercial — CRM (desde 2026-09-10 — leva CRM-1, ADR-006)

| Rota | Página |
|---|---|
| `comercial/funil` | `ComercialFunil` — colunas por etapa (`crm_pipeline_stages`), arrastar com `@dnd-kit` |
| `comercial/negocios/:id` | `ComercialNegocio` — dados, contato, linha do tempo, tarefas (`tasks`, `source_type='crm_deal'`), pedidos |
| `comercial/contatos`, `comercial/produtos`, `comercial/pedidos` | `ComercialContatos` (filtro por campo personalizado de lista; botão "Importar planilha"), `ComercialProdutos`, `ComercialPedidos` (lista; a linha abre a página do pedido) |
| `comercial/pedidos/novo` (`?contato=&negocio=`), `comercial/pedidos/:id` | `ComercialPedido` — **o pedido em tela cheia** (CRM-1c, 2026-09-11): busca de produto pelo nome já com o preço da tabela, quantidade pelo teclado, item livre, desconto, **frete**, observações, validade; ações por status: Salvar, **Enviar proposta** (→ `proposal_sent` + diálogo com link público, mensagem pronta e "Abrir no WhatsApp"), Compartilhar, Gerar link de pagamento (24 h), **Marcar aceita**, Marcar pago, Cancelar. Substituiu o `OrderDialog` |
| `/proposta/:token` (pública, `App.tsx`) | `PropostaPublica` — o cliente abre sem login: empresa (nome, logo), nº, contato, itens, subtotal/desconto/frete/total, observações, validade ("vencida" depois da data), "Pagar agora" quando há link, "Imprimir / salvar PDF". Lê só `crm_public_proposal(token)` |
| `comercial/indicadores` | `ComercialRelatorios` — aba **Vendas** (`SalesDashboard`, E4: faixa 30 d/90 d/mês/ano, funil; aberto no funil, ganho, conversão, ciclo médio; valor por etapa; criados por semana; por vendedor; por origem — tudo de `crm_sales_metrics(from, to, funil)`, migration `20260911040000`) e aba **Chamados** (`ModuloRelatorios`) |
| `comercial/importar` | `ComercialImportar` — planilha (xlsx/csv) → colunas (sugestão por sinônimo, `crm-import.ts`) → etapas (nome na planilha → etapa do funil; padrão para o resto) → conferir (erros, avisos, repetidas no arquivo) → importar em lotes de 200 via `crm_import_rows`; teto 5 000 linhas; "Desfazer" só da última importação (E3, 2026-09-11) |
| Configurações do Comercial → aba "Campos" | `CustomFieldsManager` — campos personalizados de contato e negócio: rótulo, tipo (texto, número, data, lista, sim/não), opções, obrigatório, ordem, ativo; a chave nasce do rótulo e não muda (E2, 2026-09-11) |
| Configurações do Comercial → aba "Funil" | `PipelineStagesEditor` — escolhe o funil, cria funil, edita nome/cor/tipo/ordem das etapas (arrastar), cria e apaga etapa movendo os negócios (E1, 2026-09-11); botão **"Exigir"** por etapa = portão (CRM-1b) |
| Configurações do Comercial → aba "Segmentos" | `SegmentsManager` — segmentos de cliente (consumidor, salão, distribuidor…): nome, funil padrão, tabela de preço padrão, ativo (CRM-1b, 2026-09-10) |
| Configurações do Comercial → aba "Tabelas de preço" | `PriceTablesManager` — tabela = % sobre o preço base, uma padrão; abaixo, o catálogo com o preço calculado e a exceção por produto (CRM-1b) |
| `comercial/funil` sem funil ainda | `ComercialSetupWizard` — assistente de primeira abertura (gerente): segmentos (+ "exige CPF/CNPJ"), tabelas de preço, conferir → `crm_setup`; "Pular" cria só o funil de exemplo. Quem não é gerente vê o aviso (CRM-1b) |

**CRM-1b (migration `20260913010000`, 2026-09-10 — `docs/proposta-fluxo-comercial.md`):** tenant novo
**não ganha mais funil sozinho** (o trigger de semente saiu; `seed_crm_stages` fica para o "Pular").
`crm_segments` (funil e tabela padrão do segmento; `crm_contacts.segment_id`); `crm_price_tables` (% sobre a
base, uma `is_default`) + `crm_price_table_items` (exceção por produto); `crm_product_price(produto, tabela)`
e `crm_products_with_price(tabela)` — **o preço é calculado pelo banco**, o front só mostra;
`crm_resolve_price_table(contato)` = tabela do contato → do segmento → padrão da empresa, gravada em
`crm_orders.price_table_id` por trigger quando o pedido não diz. **Portões:** `crm_pipeline_stages.required_fields`
(chaves `contact.document`, `deal.value`, `custom.contact.<chave>`…, CHECK `crm_gate_keys_valid`); o trigger
`crm_deals_check_stage_gate` recusa a entrada com a lista do que falta em português; escrita do sistema
(outro trigger, fluxo de automação) passa — o pedido pago leva ao Ganho mesmo com portão. O contato ganha
segmento e tabela própria (`ContactDialog`); o "Novo negócio" cai no funil do segmento do contato (`DealDialog`);
o pedido mostra a tabela e o catálogo já precificado (`ComercialPedido`, desde a CRM-1c). Origens `instagram` e `facebook` no
CHECK de `source`; o `crm-lead-intake` aceita `segment` (nome) e põe o lead no funil do segmento.

**CRM-1c (migration `20260914010000`, 2026-09-11):** `crm_orders.shipping` (frete; total = subtotal −
desconto + frete, calculado pelo banco), `public_token` (nasce com o pedido; é o link `/proposta/<token>`),
`proposal_valid_until`, `proposal_sent_at`, `accepted_at`; status **draft → proposal_sent → accepted →
paid** (e `sent` = link de pagamento, `expired`, `cancelled`). `crm_orders_on_status` (era
`crm_orders_on_paid`): enviada → linha do tempo; **aceita → negócio no Ganho + aviso `order_accepted`**;
paga → como antes. `crm_public_proposal(token)` (definer, `anon` chama) devolve o que a página pública
mostra — só para enviada/aceita/link/paga; rascunho e cancelada somem. O `stripe-create-checkout` só
muda o status para `sent` quando o pedido era rascunho.

Banco (migration `20260910010000`, cabeçalho explica cada tabela): `crm_pipelines` (E1,
migration `20260911010000`: vários funis por empresa, um `is_default`; o Funil e o "Novo negócio"
escolhem o funil, `?funil=` na URL), `crm_pipeline_stages`
(6 semeadas no funil padrão, tipos `open|won|lost` — **um ganho e um perdido por funil**, cor por nome
`color` pintada por `bg-stage-*`; `crm_delete_stage(etapa, destino)` move os negócios antes de apagar),
`crm_custom_fields` (E2, migration `20260911020000`: definição por empresa e cadastro; o valor vai em
`crm_contacts.custom` / `crm_deals.custom` jsonb, validado pelo trigger `crm_validate_custom` — chave
desconhecida, opção fora da lista e tipo errado são erro; `null` limpa; `required` só no formulário;
quem define é gerente), `crm_contacts` (dono = vendedor = carteira),
`crm_deals`, `crm_deal_activities` (linha do tempo; **mudar de etapa grava sozinho**),
`crm_products`, `crm_orders` (número por empresa e totais **calculados pelo banco**),
`crm_order_items`, `crm_stripe_events` (idempotência do webhook), `crm_imports` (E3, migration
`20260911030000`: memória de cada importação; `import_id` em contato e negócio é o que o desfazer lê).
**A regra de contato repetido é uma só, no banco:** `crm_find_or_create_contact` (e-mail, senão
telefone só dígitos, senão cria) — usada pelo `crm-lead-intake` e por `crm_import_rows`;
`crm_undo_import` (definer com checagem de empresa e módulo) apaga os negócios do import e os contatos
que ele criou sem outro negócio. Origem `importacao` entra no CHECK de `source`. Acesso por
`has_comercial_access` (módulo `comercial` ou supervisor); apagar é de gerente para cima. **Desde a
CRM-1b, funil, etapa, segmento e tabela de preço só gerente escreve** (configuração; a auditoria
mostrou o vendedor apagando o próprio portão com a policy antiga da E1).
**Pedido pago → negócio vai para o "Ganho" do funil em que está, linha do tempo e aviso ao vendedor** (trigger
`crm_orders_on_paid`). Mudar de funil fica dito na linha do tempo (`crm_deals_on_stage_change`). `fmt_brl()` escreve dinheiro em padrão brasileiro.

Edge functions: `crm-lead-intake` (público; lead do site → contato + negócio em "Novo" + aviso;
campo-armadilha `website`), `stripe-create-checkout` (JWT do vendedor; link temporário 1–24 h =
Checkout Session, definitivo = Payment Link; sem chave da empresa responde
`stripe_not_configured`), `stripe-webhook` (assinatura com o segredo da empresa + `crm_payment_events`; marca pago,
vencido ou falho). Página pública `/pagamento/:status` recebe o cliente de volta. Segredos em
`docs/ambientes.md`. Fora (levas seguintes): Bling (CRM-2b), lojinha pública (CRM-3), WhatsApp (CRM-4).

**CRM-2a — pagamento por empresa (migration `20260916010000`, 2026-09-12, ADR-008):** a chave do
provedor deixa de ser segredo global e passa a ser **da empresa**. `tenant_payment_credentials`
(provider `stripe` | `yampi`, `is_default` único por empresa via trigger, alias, `key_last4`,
segredos) só o `service_role` lê — RLS sem policy **e REVOKE explícito de anon/authenticated** (neste
banco toda tabela nova nasce com ALL para os dois; a auditoria de 2026-09-12 pegou o teste passando em
falso por isso — `tenant_ai_credentials` ganhou o mesmo REVOKE); a tela vê a função
`crm_payment_providers()` (provedor, padrão, alias, últimos 4; só `authenticated` chama) e escreve pela edge
function `payment-credentials` (JWT; só owner/admin; ações `test` / `save` / `delete` /
`set_default`; nunca devolve a chave). Aba **Pagamento** em Configurações do Comercial
(`PaymentProvidersTab`): um cartão por provedor, "Testar conexão", "Ligar", "Tornar padrão",
"Remover". Os dois podem estar ligados; um é o padrão e o pedido troca (`ComercialPedido`, seletor
"Cobrar pela" quando há dois). **Yampi:** `yampi-create-link` (JWT) casa os produtos do pedido com
os SKUs da loja pelo código (`crm_products.sku` ↔ `yampi_sku_id`, guardado na primeira vez), cria um
**cupom de uso único** (`HP<pedido>-<hex>`, valor = preço Yampi − preço da tabela + desconto, vence
com a proposta) e o link permanente `/checkout/payment-link`; avisa quando o preço nosso é maior
que o da loja (não há cupom que suba preço) ou quando há frete no pedido (a Yampi calcula o dela
no checkout). Ao salvar a chave, o Helpoint registra o webhook na Yampi (`order.paid`,
→ `yampi-webhook?t=<tenant>`), guarda o `secret_key` devolvido e confere
o `X-Yampi-Hmac-SHA256` de cada aviso; o pedido é achado pelo cupom (ou, sem cupom, pelo e-mail/CPF
do cliente no último pedido aberto da Yampi) e marcado pago com `provider_order_id`. **Stripe:**
`stripe-create-checkout` e `stripe-webhook` leem a chave da empresa (o webhook acha a empresa pelo
`metadata.tenant_id` da sessão, gravado na criação, e recusa pedido de outra empresa). Dedupe dos
avisos dos dois em `crm_payment_events` (substitui `crm_stripe_events`). `crm_orders` ganhou
`payment_provider` (`stripe` | `yampi` | `manual`), `provider_link_id`, `provider_order_id`,
`provider_coupon_id`. pgTAP: `pagamento_por_empresa.test.sql` (8).

**CRM-2b — nota fiscal pelo Bling (migrations `20260917010000` e `20260917020000`, 2026-09-12, ADR-008):**
a escolha "emitir nota" da empresa. `tenant_bling_connections` (tokens OAuth + `settings`: forma de
pagamento do Bling, gerar NF-e, transmitir) só o `service_role` lê (REVOKE explícito + RLS sem policy);
a tela vê `crm_bling_status()` (empresa, validade, escolhas; zero linhas = não conectado). Edge function
`bling-oauth`: `GET ?code&state` é a volta do Bling (sem JWT; `state` assinado com HMAC diz a empresa e
para onde voltar) e **só devolve o navegador ao app** com `?bling_code&bling_state`; a troca do código
por token é `POST exchange` **com o JWT de quem clicou** — o `state` tem de casar com o usuário e a
empresa logados (auditoria de 2026-09-12: sem isso, um link gerado pela empresa X e autorizado por
alguém de outra conta gravaria os tokens da vítima em X). Demais ações `POST` (só owner/admin):
`start` → URL de autorização (`return_to` só no app ou em domínio próprio verificado da empresa),
`options` → formas de pagamento da conta, `save` → escolhas, `disconnect`. `_shared/bling.ts`: renova o access
token pelo refresh (5 min antes de vencer), respeita 3 req/s (429 → espera e repete) e faz
`pushOrderToBling`: contato (o conhecido em `crm_contacts.bling_contact_id`, senão por CPF/CNPJ, senão
cria) → `POST /pedidos/vendas` (itens com `codigo` = SKU, desconto, frete, parcela na forma escolhida,
`numeroLoja` = `HP-<nº>`) → se "gerar NF-e", `POST /pedidos/vendas/{id}/gerar-nfe` → se "transmitir",
`POST /nfe/{id}/enviar` → `GET /nfe/{id}` (chave, DANFE). Idempotente: pedido já lançado é
reencontrado pelo id guardado ou pelo `numeroLoja` no Bling; o id da nota (`{ idNotaFiscal }`) é gravado
antes da transmissão, para uma falha na SEFAZ não gerar segunda nota; falha grava `nfe_status =
'error'` + `bling_error` no pedido. **Passo de fluxo `bling_order`**
(externo, exige gatilho de pedido; `automation_validate_flow`/`automation_run_step` regeradas por
`scripts/gen-migration-bling.mjs` — não editar a migration `20260917020000` à mão) executado pelo
`automation-worker`; config `gerar_nfe`/`enviar_nfe` (vazio = como está em Nota fiscal). Aba **Nota
fiscal** em Configurações do Comercial (`BlingTab`: Conectar com Bling, forma de pagamento, dois
interruptores, Desconectar); modelo **"Pedido pago → pedido e nota no Bling"** em "Usar um modelo";
cartão "Nota fiscal (Bling)" no pedido (situação, chave, DANFE, erro). `crm_orders` ganhou
`bling_nfe_id`, `nfe_key`, `danfe_url`, `nfe_status`, `bling_error` (`bling_order_id` já existia da
CRM-1); `crm_contacts.bling_contact_id`. pgTAP: `nota_fiscal_bling.test.sql` (9).

**CRM-2c — entrega (migration `20260918010000`, 2026-09-12, ADR-008):** a terceira escolha. Para quem
não despacha pela Yampi/Correios: `crm_contacts.carrier` (a transportadora do cliente, campo livre no
contato, mostrado no negócio), que entra na ficha do chamado de cadastro (`{{trigger.contact.carrier}}`
já vem no contexto do fluxo, porque `automation_enrich_payload` leva o contato inteiro) e o modelo de
fluxo **"Pedido pago → separar e despachar"** (`shippingTaskFlow`): tarefa para a pessoa da expedição
com itens, destino, WhatsApp e transportadora, prazo em dias. Nada novo no motor. pgTAP:
`entrega.test.sql` (3) — prova a corrente (pedido pago → tarefa com o texto certo), não a coluna.

### 1.5 Contagem

| Grupo | Rotas |
|---|---|
| Públicas | 7 |
| SAC público / cliente | 9 (2 redirects) |
| Painel — geral/transversal | 11 (1 redirect, 1 catch-all) |
| Painel — TI | 11 (1 redirect) |
| Painel — Configurações | 3 |
| Painel — Marketing | 7 (1 redirect) |
| Painel — Qualidade/SAC | 8 (1 redirect) |
| Painel — RH | 13 (1 redirect) |
| Painel — Financeiro | 11 (1 redirect) |
| **Total** | **80** |

---

## 2. Módulo TI (helpdesk)

É o módulo mais rico do sistema e o que mais componentes compartilha com os demais: a fila de
chamados (`TechnicianView`, sistema WorkOS), o formulário de abertura (`CreateTicketForm`), o
detalhe do chamado (`TicketDetail`) e o gerenciador de categorias são reaproveitados por
Marketing, RH, Qualidade e Financeiro apenas trocando a prop `module`.

Rotas: `helpdesk`, `helpdesk/:id`, `ti/chamados`, `ti/chamados/:id`, `ti/licencas`,
`ti/contratos`, `ti/manutencoes`, `ti/indicadores`, `ti/configuracoes`, `ti/pops`,
`ti/pops/novo`, `ti/pops/:id/editar`, `inventario`, `nova-solicitacao`, `agenda`,
`base-conhecimento`, `base-conhecimento/:id`, `portal/:id`.

### 2.1 Telas

#### `Dashboard` — home pessoal (`inicio`)
**Não é um dashboard de métricas** — é a "central do dia". Alterna entre `DailyCuration` (lista
unificada de demandas mais chat com a IA) e `FocusMode` (tela cheia de uma tarefa), com ESC
fechando o modo foco (`src/pages/Dashboard.tsx`). **Desde 2026-09-12 o modo foco só abre por
escolha** (botão "Focar" da linha/do banner ou "Modo foco" no painel): o clique na linha de uma
tarefa abre `TaskDetailDialog` (descrição, prazo, de onde veio — inclusive o nome do fluxo que a
criou — e os botões Concluir / Modo foco), e a linha diz "Tarefa · criada por um fluxo" ao lado do
título. Motivo: o dono concluiu a tarefa "Cobrar: …", criada pelo fluxo de cadastro, achando que era
o chamado já resolvido que a originou. Chamado clicado continua indo para a página do chamado.
`DailyCuration` (`src/components/dashboard/DailyCuration.tsx`, 824 linhas) funde três fontes —
`tasks`, `tickets` (via `useAISecretary`) e "kanban" (removido, sempre array vazio, mantido só por
compatibilidade, `:69-73`) — numa lista `unifiedDemands` agrupada por urgência
(`overdue`/`today`/`tomorrow`/`future`/`no_date`) e ordenada por urgência, prioridade e prazo
(`:263-293`). Traz chat com a Lyra, agenda do dia (`useCalendarEvents`) com criação rápida de
lembrete e um painel de Performance com anéis (taxa no prazo, entregas na semana, sequência,
atrasos) alimentado por `usePersonalPerformance` (`:667-819`).

> **Rota quebrada**: os atalhos "Indicadores de SLA" e "Dashboard TI"
> (`DailyCuration.tsx:44,308`) apontam para `/ti/dashboard`, que não existe — a rota real é
> `ti/indicadores` (`src/routes/StaffAppRoutes.tsx:73`). Ambos dão 404.

#### `TicketDetail` — detalhe do chamado
Tela cheia servida por `/helpdesk/:id` e por `/ti/chamados/:id`
(`src/routes/StaffAppRoutes.tsx:66,69`). Decide o papel sozinha:
`isTechnician = !!tiProfile || isSupervisor` (`src/pages/TicketDetail.tsx:57-58`).
- **Visão do solicitante**: cabeçalho e metadados, painel de manutenção vinculada,
  `TicketEvaluationPanel` quando `resolved` e `requester_id === user.id`, `PurchasePanel` (módulo
  financeiro) e a conversa sem opção de nota interna (`:102-179`).
- **Visão do técnico**: duas colunas — conversa à esquerda e sidebar fixa à direita com
  `PurchasePanel`, `TicketComplianceChecklist`, `OffboardingAccessPanel`, manutenções vinculadas,
  dados do solicitante, detalhes (categoria, criado em, atribuído a, SLA) e ficha do ativo com
  botão "Trocar" que abre `AssetSwapDialog` (`:181-393`).
- `canManageChecklist = isSupervisor || ticket.assigned_to === user.id` (`:59`).

#### `Inventory` — inventário (`inventario`)
Padrão lista/detalhe/formulário numa única página, com `viewMode` na URL via `useQueryState`
(`src/pages/Inventory.tsx:40`). Filtro de status em chips (Todos, Ativo, Em uso, Em manutenção, Em
estoque) com contagem por `reduce` (`:48-51`). `canCreate = manager|admin|owner` (`:46`);
exclusão confirmada em `AlertDialog` (`:205-220`).

#### `NewRequest` — nova solicitação (`nova-solicitacao`)
Duas etapas: `DepartmentGrid` (escolha do setor) → `CreateTicketForm` mais `KnowledgePanel` lado a
lado (`grid-cols-[1fr_340px]`) no desktop; no mobile o `KnowledgePanel` vira bloco colapsável acima
do formulário (`src/pages/NewRequest.tsx:76-98`). Mapeamento setor → módulo: `ti→tickets`,
`marketing→marketing`, `qualidade→qualidade`, `rh→rh`, `financeiro→financeiro` (`:14-20`).

#### `Licenses` — licenças (`ti/licencas`)
Mesmo padrão lista/detalhe/formulário, com `LicensesKPIs` sempre no topo.
`canCreate`/`canEdit = owner|admin|manager`; `canDelete = owner|admin` (`src/pages/Licenses.tsx:32-34`).
A variável `expiringCount` é calculada e **nunca renderizada** (`:41-45`).

#### `Contracts` — contratos (`ti/contratos`)
Busca por nome ou fornecedor, filtro por status e 3 ordenações (vencimento mais próximo, nome,
maior valor), tudo em `useMemo` local (`src/pages/Contracts.tsx:42-55`). Cards de estatística
(Total, Ativos, Expirando, Expirados) recalculados no cliente a partir da lista já carregada
(`:38-40`).

#### `Maintenances` — manutenções (`ti/manutencoes`)
Igual a Contratos, com filtro adicional por tipo e 4 ordenações (recentes, antigas, custo, título)
(`src/pages/Maintenances.tsx:43-62`). `canCreate`/`canEdit = member|manager|admin|owner`;
`canDelete = admin|owner` (`:35-37`).

#### `TIConfiguracoes` — configuração do módulo (`ti/configuracoes`)
Três abas condicionadas por `useDepartmentPermissions('ti').can`
(`src/pages/TIConfiguracoes.tsx:300-317`):
1. **Categorias** — árvore categoria → subcategoria, com sub-abas por módulo (Inventário,
   Contratos, Licenças, Manutenções, Chamados) via `useTICategories`. Só a categoria/subcategoria
   de **Chamados** ganha o botão "Formulário", que abre `FormBuilderDialog` (`:181-191,232-242`).
   A árvore é implementada **inline**, duplicando a lógica do `CategoryManager` genérico (§2.2).
2. **Checklists** — `ChecklistTemplatesTab`.
3. **SLA e Prazos** — `SLAPoliciesTab`.

#### `TIRelatorios` — indicadores (`ti/indicadores`, 689 linhas)
Duas abas: **Visão Geral** (KPIs essenciais, inventário por status, gráfico de tendência, três
mini-blocos "Atenção agora" e painel de chat da Lyra) e **Análise Detalhada** (`IndicatorsView`).
Filtros de período (hoje, 7d, 30d, 90d, ano, personalizado com date-range picker) e de colaborador
(`useTechnicians`). Botões: "Analisar com IA" (`AIIndicatorAnalysis`), "Exportar PDF"
(`ExportPDFDialog` → `PDFReportGenerator`) e "Personalizar" (`DashboardCustomizer`, só na Visão
Geral).

> Importa `PatternsAnalysis` (`:18`) mas **nunca o renderiza** — o componente de padrões
> detectados por IA só aparece nos relatórios de Marketing e RH. TI, dono da funcionalidade, não a
> expõe.

#### `POPs` — gestão de tutoriais (`ti/pops`, 388 linhas)
Duas abas: **Tutoriais** (busca, 4 stat cards, lista com toggle ativo/inativo, editar e excluir) e
**Feedbacks** (feedbacks recentes e sugestões de melhoria pendentes, com badge de contagem na aba).
"Novo Tutorial" abre `TemplateSelector`.

#### `TutorialEditor` — criar/editar POP (`ti/pops/novo`, `ti/pops/:id/editar`, 477 linhas)
Editor markdown com toolbar (`RichTextEditor`) e preview (`MarkdownPreview`) alternável. Campos:
título, conteúdo, categoria/subcategoria (de `ti_categories` módulo `tickets`), palavras-chave,
**audiência** (`staff` interno x `customer`, que publica no portal do SAC), **visibilidade**
(`VisibilitySelector`, só quando a audiência é `staff`), resumo da alteração (só ao editar) e
histórico de versões (`VersionHistory`, só ao editar).
Ao editar, salva uma nova versão com o conteúdo **anterior** antes de aplicar o update
(`src/pages/TutorialEditor.tsx:186-200`) — o histórico registra de onde veio, não para onde foi.
Aceita pré-preenchimento por template (`?template=`) ou por `location.state` (usado por
`PatternsAnalysis`).

#### `TutorialViewer` — visualizar POP (`base-conhecimento/:id`, `portal/:id`, 326 linhas)
Duas colunas (conteúdo e sidebar "artigos da seção"). Detecta se `pop.content` é JSON de blocos
(`isBlockContent`) e renderiza com `POPPreview`, senão com `MarkdownPreview` — na prática cai
**sempre** no segundo, porque nada grava blocos. Registra view e interação `viewed` no mount;
feedback "foi útil?" incrementa `solved_count` no sim e abre `POPFeedbackDialog` no não. O botão
compartilhar usa `navigator.share` com fallback para o clipboard.

#### `Portal` — base de conhecimento (`base-conhecimento`, 467 linhas)
Busca híbrida: textual local (debounce de 300 ms) **e** semântica por IA (`useSemanticSearch`, a
partir de 5 caracteres, via edge function `ai-semantic-search`), exibidas em blocos separados. Sem
busca ativa mostra categorias (`CategorySection`, ordem fixa em `categoryOrder`) e "Artigos
populares" (top 8 por `views_count`). Clicar numa categoria filtra por `?categoria=`.

#### `Agenda` (`agenda`, 284 linhas)
Calendário mensal (320 px à esquerda) mais lista do dia selecionado à direita. Pontos indicam dias
com evento (`eventDays` de `useCalendarEvents`). Clique simples seleciona o dia; duplo clique abre
`EventCreateDialog` com a data preenchida. Filtro por tipo (evento, lembrete, rotina). Excluir um
evento de série recorrente abre `RecurrenceScopeDialog` (este / este e futuros / todos).

### 2.2 Componentes

#### `src/components/helpdesk/` — fluxo de chamados

| Arquivo | Papel |
|---|---|
| `CreateTicketForm.tsx` (416L) | Abertura do chamado: categoria/subcategoria em cards clicáveis, campos dinâmicos (`DynamicFormFields`), seletor de ativo (só módulo `tickets`), prioridade em pills, sugestão de POP com debounce de 800 ms e **bloqueio do envio** enquanto a sugestão não for dispensada (`isSubmitBlocked`, `:208`). Ramifica em campos extras de compra (Financeiro) e de admissão (RH) por regex no nome da (sub)categoria (`:65-68`) |
| `DynamicFormFields.tsx` (282L) | Campos configurados por categoria (`useTicketFormFields`): text, textarea, email, phone, select, checkbox, radio, date, file, `delivery_datetime` (data e hora, bloqueia datas passadas) e `assignee_select` (membros do departamento via `useDepartmentMembers`). Exporta `validateDynamicFields` para obrigatórios |
| `AssetSelector.tsx` (180L) | "Meus ativos" x "todos os ativos" (técnico/supervisor), com filtro pela categoria do chamado (`getAssetCategoryFilter`, mapeia hardware/printer/network/software) |
| `TechnicianView.tsx` (222L) | Fila técnica — §2.3 e §2.5 |
| `CollaboratorView.tsx` (230L) | "Meus chamados" do solicitante: abas Todos / Em aberto / Aguardando você / Para avaliar (`isAwaitingEvaluation`) / Resolvidos, com `WorkOSTable` em modo `simplified` |
| `TicketConversation.tsx` (167L) | Timeline: descrição do chamado como primeira mensagem mais comentários, ocultando notas internas de não técnicos. Banners de status. Compositor desabilitado quando `isClosed` |
| `MessageBubble.tsx` (178L) | Bolha com indicador Solicitante/Atendente, badge "Interno" (borda pontilhada âmbar), anexos e `sanitizeContent`. Exporta também `SystemMessage` |
| `ReplyComposer.tsx` (280L) | Toggle Público/Interno, anexos (limite de 10 MB por arquivo), botão "Sugerir" (IA gera resposta, com histórico das últimas 5 sugestões num popover), `AIRefineButton` e botão de menção. Enter envia, Shift+Enter quebra linha |
| `TicketActionsBar.tsx` (382L) | Ações do técnico: Assumir, Transferir, Manutenção, Status, Reabrir, Resolver, Fechar, Cancelar, Excluir — cada uma condicionada a papel e estado (§2.5) |
| `TicketContextMenu.tsx` (197L) | As mesmas ações por menu de contexto na linha da tabela: Assumir, Transferir, Status (submenu), Resolver, Mencionar |
| `ChangeStatusDialog.tsx` (137L) | Motivo obrigatório para qualquer troca de status; se bloqueado por checklist, desabilita o textarea |
| `TransferTicketDialog.tsx` (135L) | Seleciona técnico (excluindo o próprio usuário) e motivo obrigatório |
| `ResolveTicketDialog.tsx` (160L) | Descrição de resolução obrigatória, com "Sugerir com IA" e `AIRefineButton` |
| `MentionDialog.tsx` (168L) | Menciona colega com toggle Interno/Público (padrão Interno) |
| `TicketStatusBadge.tsx` (59L) | Badge/dot a partir de `TICKET_STATUS_META` (`src/config/ticket-status.ts`) — fonte única de label, ícone e cor dos 8 status |
| `TicketComplianceChecklist.tsx` (128L) | Checklists instanciados no chamado, com barra de progresso, checkbox por item e aviso de obrigatórios pendentes |
| `TicketDetailSheet.tsx` (209L) | Painel lateral (Sheet) da fila técnica ao clicar numa linha — versão compacta de `TicketDetail` |
| `TicketEvaluationPanel.tsx` (166L) | Janela de 7 dias (`EVALUATION_WINDOW_DAYS`) para o solicitante avaliar (1-5 estrelas e comentário, fechando o chamado) ou reabrir com motivo. Exporta `evaluationDaysLeft` e `isAwaitingEvaluation`, reusados em `CollaboratorView` |
| `AssetSwapDialog.tsx` (249L) | Busca ativos disponíveis (mesma categoria, `status=active`, sem dono) e troca; motivo obrigatório |
| `CreateMaintenanceDialog.tsx` (234L) | Agenda manutenção vinculada ao chamado e posta comentário automático |
| `AdmissionAccessEditor.tsx` (63L) | Lista editável de acessos a liberar (tipo, nome, observação), usada no formulário de admissão de RH |
| `OffboardingAccessPanel.tsx` (58L) | Lista de acessos a revogar, filtrando por `revoke_ticket_id = ticketId` — ver ressalva em §2.6 |

#### `src/components/inventory/`
- `AssetTable.tsx` (296L): busca, filtro por categoria e status, barra de stats (total, ativos,
  manutenção, garantia expirando).
- `AssetDetail.tsx` (371L): ficha técnica completa, alerta de garantia (expirada ou expirando em 30
  dias) e **detecção de problema recorrente** — agrupa o histórico de chamados do ativo por
  categoria e alerta quando alguma tem 2 ou mais ocorrências (`:82-91`); mais diálogo de
  transferência de posse.
- `AssetForm.tsx` (436L): nome, patrimônio, categoria/subcategoria (de `ti_categories` módulo
  `inventory`, mapeada para o enum técnico por `inferCategoryEnum`), fabricante, modelo, nº de
  série, status (6 valores), local, departamento, datas de compra e garantia, valor, responsável
  (usuário, departamento ou estoque) e observações.
- `InventoryKPIs.tsx` (123L): §2.3.

#### `src/components/licenses/`
- `LicenseTable`, `LicenseDetail`, `LicenseForm`: CRUD completo, com `item_category`
  (`software|domain|hosting|ssl|online_service|other`) alternando o formulário entre campos de
  assentos (software) e campos de domínio/URL/painel (demais).
- `LicenseAssignDialog.tsx` (152L): atribui a usuário **ou** a ativo.
- `RenewLicenseDialog.tsx` (165L): registra a renovação em `software_license_renewals` (período
  anterior e novo, valor, fornecedor) e atualiza a licença.
- `LicensesKPIs.tsx` (89L): §2.3.

#### `src/components/contracts/`
`ContractTable`, `ContractDetail`, `ContractForm`: nome, fornecedor, nº do contrato, descrição,
datas de início e fim, dias de alerta de renovação, auto-renovação, valor, frequência de pagamento,
status, URL do documento, contato (nome, e-mail, telefone), observações e "abrir chamado
automaticamente". O status **nunca** é lido puro do banco — é recalculado por
`calculateContractStatus` (§2.3).

#### `src/components/maintenances/`
`MaintenanceTable`, `MaintenanceDetail`, `MaintenanceForm`: ativo, tipo
(`preventive/corrective/upgrade/cleaning`), título, status
(`scheduled/in_progress/completed/cancelled`), técnico, descrição, datas agendada e concluída,
custo, chamado vinculado (`ticket_id`), fornecedor externo, "abrir chamado automaticamente" e
observações. `MaintenanceDetail` exibe o chamado vinculado via `useTicketByMaintenance`.

#### `src/components/pops/` — tutoriais e POPs
`pops.content` é **texto livre** que pode ser markdown puro ou um JSON-array de `POPBlock`
(`src/types/pop-blocks.ts`); `isBlockContent`, `parseContent`, `convertMarkdownToBlocks` e
`convertBlocksToMarkdown` fazem a ponte. Na prática só o caminho markdown é usado.

| Componente | O que faz |
|---|---|
| `RichTextEditor.tsx` (256L) | Textarea com toolbar que insere sintaxe markdown: negrito, itálico, H2, H3, listas, link, imagem com upload, citação, código, dica, atenção, divisor |
| `MarkdownPreview.tsx` (355L) | Parser markdown próprio, sem biblioteca, com zoom de imagem |
| `BlockEditor.tsx` (353L), `BlockItem.tsx` (411L), `SortableBlockItem.tsx` (67L) | Editor de blocos com toolbar de 10 tipos e reordenação por drag (`@dnd-kit`); `BlockItem` suporta 13 tipos. **Nenhum dos três é importado por nenhuma página** — UI completa e desconectada |
| `POPPreview.tsx` (291L) | Renderer de `POPBlock[]` para leitura, com os 13 tipos e zoom de imagem — usado no ramo de `TutorialViewer` que nunca é atingido |
| `MediaUploader.tsx` (289L) | Upload de imagem, vídeo e gif para o bucket `pop-media`, com **redimensionamento client-side** por canvas (máx. 800 px, qualidade 0.9) |
| `VideoToGifConverter.tsx` (218L) | Converte vídeo em GIF no browser via `gifshot`, carregada por `<script>` dinâmico do CDN jsdelivr, com sliders de intervalo, nº de frames e largura |
| `KnowledgePanel.tsx` (173L) | Usado em `NewRequest`: busca IA, busca simples, filtro por categoria e lista compacta de `POPCard` |
| `AISearchInput.tsx` (190L) | Chama `ai-match-pop` com `useAI: true`, mostra `confidence` em % e badge "Melhor" no primeiro |
| `POPSuggestionBanner.tsx` (193L) | Banner flutuante durante a digitação do chamado quando há match; "Ver solução sugerida" abre modal; "Isso resolveu" incrementa `solved_count` e abre o feedback; "Não resolveu" (`onProceed`) libera o envio |
| `POPFeedbackDialog.tsx` (153L) | Nota de 1 a 5 obrigatória, toggle útil/não útil e sugestão opcional |
| `POPCard.tsx` (101L) | Card compacto (listas) e completo (visualizações e resolvidos) |
| `VersionHistory.tsx` (193L) | Lista versões, "Ver" (modal com `MarkdownPreview`) e "Restaurar" (com confirmação) |
| `VisibilitySelector.tsx` (140L) | Três modos: todos os usuários, setores específicos (10 departamentos fixos) ou apenas leitores externos |
| `TemplateSelector.tsx` (109L) e `tutorialTemplates.ts` (553L) | 11 templates prontos: `password-reset`, `printer-setup`, `vpn-setup`, `network-issue`, `system-access`, `system-usage`, `online-meeting`, `onboarding`, `offboarding`, `security`, `blank` |
| `CategorySection.tsx` (105L) | Usado no Portal: cabeçalho de categoria, até N artigos e destaque do termo buscado |

`MarkdownPreview` e `POPPreview` duplicam boa parte da renderização — dois parsers de artigo
coexistindo.

#### `src/components/workos/` — sistema de tabela da fila
Arquitetura descrita em detalhe na §7.3 (linguagem visual). Em resumo: `WorkOSContainer` >
`WorkOSPageHeader` (deprecated) > `WorkOSTable` (paginação de 50, agrupamento por prioridade ou por
tempo, estado vazio) > `WorkOSGroup` (cabeçalho colapsável com stats próprias) > `WorkOSTableRow`
(desktop em grid, mobile em card) > `StatusCell`/`PriorityCell`. Apesar do nome, é específico de
`TicketWithDetails` — não é um data-grid genérico.
- `TerminalTicketRow.tsx` (59L): variante "modo terminal" (linha compacta monoespaçada), **não
  referenciada** por `WorkOSTable`.
- `AISecretarySummary.tsx` (133L): faixa de resumo no topo da fila com saudação, contagens e
  sugestão de por onde começar (§2.3).

#### `src/components/ti/`

| Componente | O que faz |
|---|---|
| `SLAPoliciesTab.tsx` (355L) | Tabela de políticas de SLA por prioridade (nome, tempo de 1ª resposta e de resolução em minutos, ativo) mais a seção de Alertas: e-mail de notificação on/off e 3 sliders com estado local, salvando só no `onValueCommit` — % de aviso de SLA (50 a 95), dias de alerta de contrato (7 a 90) e de licença (7 a 90) |
| `ChecklistTemplatesTab.tsx` (462L) | CRUD de templates de checklist de conformidade: itens (descrição e obrigatório) e vínculos por categoria/subcategoria (`target_type: 'category'\|'form'`, mas a UI só oferece categoria). A exclusão preserva o histórico já instanciado nos chamados |
| `FormBuilderDialog.tsx` (266L) e `FormFieldEditor.tsx` (231L) | Construtor de formulário dinâmico por categoria, com 11 tipos de campo, toggle ativo/inativo por campo e aviso de que respostas antigas são preservadas ao excluir um campo |
| `CategoryManager.tsx` (266L) | Versão **genérica e reusável** do gerenciador categoria → subcategoria — usada por Financeiro, Marketing, Qualidade e RH, mas **não por TI**, que reimplementa a árvore inline em `TIConfiguracoes.tsx` |
| `PatternsAnalysis.tsx` (215L) | Dispara `ai-analyze-patterns`, lista padrões detectados (nome, descrição, ocorrências, categoria) com "Salvar" e "Criar artigo" (pré-preenche o `TutorialEditor` via `navigate(..., {state})`); lista também os padrões já salvos em `ticket_patterns`. **Não renderizado em nenhuma tela de TI** |
| `AIProviderTab.tsx` (204L) e `LyraConfigTab.tsx` (281L) | Configuração BYOK do provedor de IA (chave nunca reexibida, com teste de conexão) e da assistente. São **globais do tenant**, acessadas por `LyraSettings` (`configuracoes/lyra`), não por `ti/configuracoes`, apesar de morarem na pasta `ti/` |

#### `src/components/glpi/KPICard.tsx` (71L)
Tile de KPI reusado por quase toda a área de TI (`InventoryKPIs`, `LicensesKPIs`,
`TechnicianView`, `DailyCuration`, `TIRelatorios`). Sete cores
(`yellow/green/red/blue/grey/purple/orange`), cada uma com par fundo e texto garantindo contraste
(`colorMap`, `:11-19`). Sem `onClick` renderiza `<div>` informativo; com `onClick` renderiza
`<button>` acessível, com `aria-label` descrevendo valor e ação.

#### `src/components/ai/`
- `LyraAvatar.tsx` (49L): ícone SVG (gradiente e "spark") com `id` de gradiente único via `useId()`
  para evitar colisão entre instâncias; o nome da assistente vem de `useAssistantName`
  (customizável por tenant, padrão "Lyra").
- `AIRefineButton.tsx` (163L): abre modal comparando texto original e refinado (via `useAIRefine`
  → `ai-refine`), com "Aplicar" habilitado só se houver diferença real.
- `ImproveTextButton.tsx` (76L): variante mais simples (chama `ai-suggest-reply` com prompt fixo de
  reescrita); não localizado em uso dentro do módulo TI.
- `AIUnavailableNotice.tsx` (34L): aviso e link para configurar o provedor quando o tenant não tem
  BYOK.

#### `src/components/request/DepartmentGrid.tsx` (138L)
Grade de 5 departamentos (TI, Marketing, Qualidade, RH, Financeiro), todos com `enabled: true` no
código atual. O estado "em breve"/bloqueado existe na UI (cadeado e toast informativo) mas nenhum
departamento o usa hoje.

#### `src/components/dashboard/` (compartilhada, muito usada por TI)
- `KPIGrid.tsx` (24L): grid responsivo que envolve `KPICard`s.
- `DashboardHeader.tsx` (63L, `@deprecated`): encapsula `PageHeader` mais seletor de período.
- `IndicatorsView.tsx` (607L): tabela detalhada de indicadores — o coração das fórmulas (§2.3).
- `TechnicianPerformanceChart.tsx` (184L), `TopRequestersCard.tsx` (140L),
  `POPEffectivenessCard.tsx` (133L), `OverdueTicketsCard.tsx` (190L — **não importado** em
  `TIRelatorios`).
- `RequesterAnalysisSheet.tsx` (271L): painel lateral ao clicar num Top Solicitante — tabela de
  chamados do período e botão "Analisar com {Lyra}", que envia um prompt formatado (padrão, causa
  raiz, ação recomendada) para `ai-lyra-chat`.
- `AIIndicatorAnalysis.tsx` (113L): sheet que dispara `ai-analyze-indicators` com o pacote de
  métricas do período e mostra a análise em markdown, com "Copiar" e "Gerar nova análise".
- `ExportPDFDialog.tsx` (129L) → `PDFReportGenerator.tsx` (293L): gera PDF via `jsPDF` com seções
  selecionáveis (capa obrigatória): resumo executivo, ativos e infraestrutura, distribuição por
  prioridade e categoria, comparativo com o período anterior e tendência dos últimos 14 dias.
- `DashboardCustomizer.tsx` (145L): sheet com drag-and-drop (`@dnd-kit`) para reordenar e
  mostrar/esconder os 13 widgets do `WIDGET_REGISTRY`.
- `TILyraPanel.tsx` (190L): chat lateral fixo com briefing inicial (chamados, SLA, licenças
  expirando), sugestões rápidas e gravação de voz (`useVoiceRecorder`).
- `FocusMode.tsx` (177L): tela cheia de tarefa única com cronômetro, badge de prioridade e badge
  "Sugerido pela {IA}" quando `is_ai_suggested`; ESC sai.
- `CreateReportDialog.tsx` (164L) e `ReportDetailSheet.tsx` (194L): CRUD de relatórios agendados
  (`ti_insight_reports`/`ti_insight_snapshots`) — frequência diária/semanal/mensal, métricas-alvo,
  notificação por e-mail ou in-app, geração sob demanda. **Órfãos**: nenhuma página os importa.
- `RankCard.tsx` (47L): usado por SAC/Qualidade, não por TI.

### 2.3 Indicadores — fórmulas

Toda métrica de chamado nasce de `useTicketMetrics(filter)`
(`src/hooks/useHelpdeskMetrics.ts:77-198`), que dentro de TI sempre filtra `.eq('module','tickets')`
(`filterWithModule`, `src/pages/TIRelatorios.tsx:162`). O período nunca vai ao Postgres como range
fixo: `getDateRangeFromPeriod` traduz `today/7d/30d/90d/custom` em
`[startOfDay(hoje-N), endOfDay(hoje)]` no cliente (`useHelpdeskMetrics.ts:48-75`) e a query usa
`gte(created_at, start).lte(created_at, end)`.

#### Métricas base (`useTicketMetrics`, `useHelpdeskMetrics.ts:100-195`)

Busca `select('*')` em `tickets` no range, opcionalmente `.eq('assigned_to', technicianId)`, e
itera em memória.

| Indicador | Fórmula |
|---|---|
| `open` / `inProgress` / `resolved` / `closed` | Contagem por `switch(ticket.status)` |
| `byCategory` | Agrupa por `ticket.category \|\| 'Sem categoria'` |
| `byCategoryAndStatus` | Mapa categoria → status → contagem |
| `byPriority` | Agrupa por `ticket.priority \|\| 'medium'` |
| **SLA cumprido** (`slaCompliance`) | Só tickets com `sla_due_at` não nulo. `slaRunning = status ∉ {resolved, closed, cancelled, rejected}`. Conta como cumprido se **(a)** já tem `resolved_at` e `resolved_at <= sla_due_at`, **ou (b)** ainda corre e `agora <= sla_due_at`. `slaCompliance = round(cumpridos / total * 100)` |
| **SLA violado** (`slaViolated`) | Conta quando `slaRunning && agora > sla_due_at`. Chamados finalizados **nunca** entram aqui, mesmo tendo atrasado na resolução. `slaViolationRate = round(slaViolated / total * 100)` |
| **Atraso médio** (`avgOverdueTime`) | Soma `(agora - sla_due_at)` em horas só dos violados correntes; `round(soma / slaViolated * 10) / 10` |
| **Tempo médio de resolução** (`avgResolutionTime`) | Para tickets com `resolved_at` e `created_at`, soma `(resolved_at - created_at)` em horas; `round(soma / resolvedCount * 10) / 10` |
| `violatedByPriority` / `violatedByCategory` | Contagem dos violados por prioridade e por categoria |

`usePreviousMetrics` (`:258-356`) repete o cálculo para o **período anterior equivalente**:
`getPreviousPeriodRange` pega a duração do período atual em ms e desloca para trás, terminando 1 ms
antes do início do atual (`:38-46`).

**Comparação percentual** (`calcChange`, `IndicatorsView.tsx:91-94`, duplicada como
`calculateChange` em `TIRelatorios.tsx:89-93`):
`previous === 0 ? (atual > 0 ? 100 : null) : round((atual - previous) / previous * 100)`.
Setas: verde quando sobe (ou quando desce, se `changeInverse`), vermelho no caso oposto, e "—"
quando `|Δ| <= 1`.

#### Tendência diária (`useTicketTrends`, `useHelpdeskMetrics.ts:200-256`)
Busca `created_at, resolved_at, status` no range; cria um bucket por dia com `{opened:0, resolved:0}`;
incrementa `opened` no dia de `created_at` e `resolved` no dia de `resolved_at`, se caírem no range.
Renderizado como `AreaChart` (abertos x resolvidos).

#### SLA por chamado — `getSLATimeRemaining` (`src/types/helpdesk.ts:185-232`)
Função central de toda a UI de fila e badge de SLA:
- Sem `sla_due_at` → `{label:'Sem SLA', hasSLA:false}`.
- Com `status ∈ SLA_STOPPED_STATUSES` (`resolved/closed/cancelled/rejected`) → relógio **parado**
  (`isFrozen:true`): `cancelled`/`rejected` viram "SLA encerrado" sem violação; os demais usam
  `resolved_at` como marco — `resolved_at > sla_due_at` vira "Resolvido Xh após o prazo"
  (`isOverdue:true`, `percentage:100`), senão "Resolvido no prazo".
- Correndo: `diff = sla_due_at - agora`. Se `diff < 0` → "Xmin/Xh em atraso" (`isOverdue:true`,
  `percentage:100`). Senão "Xmin/Xh/Xd restantes", com `percentage` **não linear**:
  `< 60 min → (restante/60)*100`; `< 1440 min (24 h) → 50` fixo; `>= 1440 min → 20` fixo.
  **A barra de progresso de SLA não é percentual real de tempo decorrido** — é um código de urgência
  em três faixas fixas.

#### Desempenho por técnico (`useTechnicianPerformance.ts:17-139`)
Busca todos os tickets do período com `assigned_to` não nulo e agrupa por técnico:

| Indicador | Fórmula |
|---|---|
| `totalAssigned` | Todos os tickets do técnico no período |
| `ticketsResolved` | `status ∈ {resolved, closed}` |
| `avgResolutionTime` (h) | Média de `(resolved_at - created_at)` **só** dos resolvidos/fechados, `round(*10)/10` |
| `slaCompliance` (%) | Dos resolvidos/fechados **com** `sla_due_at`: `round(cumpridos / resolvedCount * 100)`, cumprido = `resolved_at <= sla_due_at`. **O denominador é `resolvedCount`** (todos os resolvidos/fechados), não só os que têm SLA — um resolvido sem `sla_due_at` deprime a taxa sem contar como violação nem como cumprimento |
| `avgSatisfaction` | Média de `satisfaction_rating` onde preenchido, `round(*10)/10` |
| `activeTickets` | `status ∈ {open, in_progress, waiting_user, waiting_parts}` |

Devolve só técnicos com `totalAssigned > 0`, ordenado por `ticketsResolved` desc. Exibido em tabela
(`TechnicianPerformanceChart`) e `BarChart` horizontal (resolvidos x ativos).

#### Top solicitantes (`useTopRequesters`, `src/hooks/useRequesterMetrics.ts:74-149`)
Busca `requester_id, priority, category` de todos os tickets do período; agrupa em memória
(`count`, `urgent` = `priority ∈ {critical, high}`, `categories` = Set); ordena por `count` desc,
corta em `limit` (padrão 10) e **só então** busca os perfis desses IDs. A barra é proporcional ao
maior `ticket_count` da lista.

#### Efetividade dos POPs (`usePOPEffectivenessMetrics`, `src/hooks/usePOPFeedback.ts:146-224`)

| Indicador | Fórmula |
|---|---|
| `resolutionRate` | `round(totalSolved / totalViews * 100)`, com `totalViews`/`totalSolved` = soma de `views_count`/`solved_count` de todos os POPs **ativos** |
| `avgRating` | Média simples de `avg_rating` (só POPs com rating não nulo), `round(*10)/10` |
| `totalFeedbacks` | `count` exato de `pop_feedbacks` |
| `topPOPs` | Top 5 por `rate = solved_count / views_count * 100` (POP sem view → `rate = 0`) |
| `recentSuggestions` | Últimas 10 `pop_feedbacks.suggestion` não nulas, com nome do usuário e título do POP resolvidos em memória |

#### KPIs da fila técnica (`TechnicianView.tsx:93-104`)
**Não** usam `useTicketMetrics` — recalculam sobre a lista já carregada (`useTicketQueue`, status
`open/in_progress/waiting_user/waiting_parts`; `useTicketHistory`, status
`resolved/closed/cancelled`):

| KPI | Fórmula |
|---|---|
| Na Fila | `visibleTickets.length` (após o filtro de visibilidade, §2.5) |
| SLA Violados | `filteredTickets.filter(t => getSLATimeRemaining(...).isOverdue && !isFrozen).length` |
| Não Atribuídos | `!t.assigned_to` |
| Meus | `t.assigned_to === user.id` |
| Críticos | `t.priority === 'critical'` |

#### Faixa de resumo da IA (`AISecretarySummary.tsx:29-48`)
`critical = priority === 'critical'`; `mine = assigned_to === currentUserId`;
`unassigned = !assigned_to`;
`slaAtRisk = !isFrozen && (isOverdue || percentage >= 80)` — como `percentage` é fixo em 50 e 20
nas faixas de 24 h ou mais (§2.3), nessas faixas "em risco" só acontece via `isOverdue`; o corte de
80 % só morde na última hora.
`highestPriority = critical[0] ?? primeiro high ?? tickets[0]` gera "Recomendo iniciar pelo #N".

#### Inventário (`InventoryKPIs.tsx:44-64`)
Sobre a lista completa de `assets`, sem filtro de período (inventário é foto do presente):
KPIs `total`, `byStatus.active` ("Em uso"), `byStatus.inactive` ("Em estoque" — reaproveita o rótulo
de `inactive` para significar estoque), `byStatus.maintenance`, `byStatus.decommissioned`. Tabela
por subcategoria (`total/active/inactive` por `subcategory || 'Sem subcategoria'`, top 8 por total) e
tabela por categoria (contagem simples).

> **Duas definições concorrentes de "em uso"**: em `TIRelatorios.tsx:186-205` o card de inventário
> recalcula de forma diferente — `assetsInUse = assets.filter(a.assigned_to).length` (por posse),
> `assetsInStock = assets.filter(!a.assigned_to && status ∈ {active, in_stock}).length`,
> `assetsInMaintenance = byStatus['maintenance']`. Ou seja, `status === 'active'` (InventoryKPIs) x
> `assigned_to` preenchida (TIRelatorios).

#### Licenças (`LicensesKPIs.tsx:13-42`)
`softwareList = licenses.filter(item_category === 'software')`. `totalSeats`/`usedSeats` = soma de
`total_quantity`/`used_quantity` **só do software**; `availableSeats = totalSeats - usedSeats`.
Vencimento sobre **todas** as licenças: `expired` (data < hoje), `expiringMonth` (< hoje+30d),
`expiring90` (< hoje+90d, cumulativo), `expiringYear` (< fim do ano civil, cumulativo).
`upcoming` = licenças com `expiry_date` entre hoje e hoje+90d, ordenadas, mostrando as 6 primeiras.

> **Três implementações independentes da mesma janela de vencimento**:
> `src/types/it-management.ts:233-251` (`getDaysUntilExpiry`/`isExpiringWithinDays`/`isExpired`,
> usada por `LicenseTable`/`LicenseDetail`/`ContractTable`/`ContractDetail`), `LicensesKPIs.tsx:13-42`
> e `TIRelatorios.tsx:207-223`.

#### Status de contrato (`calculateContractStatus`, `src/hooks/useContracts.ts:5-14`)
`cancelled` permanece; senão `daysUntilExpiry = ceil((end_date - hoje) / 86400000)`:
`< 0 → expired`; `<= renewal_alert_days → expiring`; senão `active`. Aplicado em `useContracts`,
`useContractById` e `useExpiringContracts` — **nunca** confia no `status` gravado, exceto para
preservar `cancelled`.

#### `IndicatorsView` — Análise Detalhada (607L)
Dez linhas de indicador (`:173-242`), cada uma com valor atual, variação (`calcChange`) e valor
anterior, filtráveis por 5 categorias (Helpdesk, Ativos, Licenças, Contratos, Manutenções), com a
preferência salva em `localStorage['ti-indicators-categories']`:
1. Chamados Abertos (`metrics.open`, inverso — subir é ruim)
2. Em Andamento (inverso)
3. Resolvidos (subir é bom)
4. Tempo Médio de Resolução (`avgResolutionTime` h, inverso)
5. SLA Cumprido (`slaCompliance` %)
6. SLA Violados (`slaViolated`, inverso)
7. Ativos de TI (`em uso · em estoque · total`, sem variação)
8. Licenças Expirando em 30 d (sem variação)
9. Contratos Expirando em 30 d (sem variação)
10. Manutenções Agendadas (sem variação)

As linhas 1 a 3 têm hover-card com as 10 primeiras ocorrências (`useTicketsByStatusList`, query
separada por status limitada a 10). Abaixo: tabela "Chamados por Categoria" (categoria x Abertos /
Em Andamento / Aguardando [`waiting_user + waiting_parts`] / Resolvidos / Fechados / Total) e 4
seções colapsáveis de detalhamento (SLA violado via `useViolatedSlaTickets`, que busca **todos** os
tickets com `sla_due_at < agora` e status não final, **sem limite de período**; licenças, contratos
e manutenções recebidos por prop).

#### Relatório PDF (`PDFReportGenerator.tsx`)
Replica as mesmas fórmulas: resumo executivo com os 4 KPIs do topo, distribuição por prioridade e
categoria com `%` recalculado localmente (`value / total * 100`), comparativo com o período anterior
reusando `calculateChange`, e tendência limitada aos últimos 14 dias do array de `trends`.

### 2.4 Tabelas do banco

`tickets`, `ticket_comments`, `ticket_attachments`, `ticket_mentions`, `ticket_patterns`,
`ticket_form_fields`, `ticket_form_responses`, `ticket_checklists`, `ticket_checklist_items`,
`checklist_templates`, `checklist_template_items`, `checklist_template_bindings`, `assets`,
`asset_maintenances`, `software_licenses`, `software_license_keys`, `software_license_renewals`,
`license_assignments`, `software_contracts`, `ti_categories`, `sla_policies`, `pops`,
`pop_versions`, `pop_feedbacks`, `pop_attachments`, `pop_interactions`, `ti_insight_reports`,
`ti_insight_snapshots`, `dashboard_preferences`, `dashboard_view_templates`, `calendar_events`,
`notifications`, `tasks`, `profiles`, `employee_access_grants`, `access_profiles`,
`user_access_profiles`, `user_roles` (via join `profiles!inner`).

**Buckets**: `pop-media` (imagens, vídeos e gifs de tutoriais), `ticket-attachments` (anexos de
comentário), `voice-recordings` (áudio temporário para transcrição).

**Edge functions** chamadas pelo módulo: `ai-match-pop`, `ai-lyra-chat`, `ai-secretary`,
`ai-refine`, `ai-suggest-reply`, `ai-semantic-search`, `ai-analyze-patterns`,
`ai-analyze-indicators`, `ai-transcribe-audio`, `generate-insight-report`. RPCs:
`increment_pop_views`, `get_user_tenant_id`.

### 2.5 Fluxos

#### Abrir chamado
1. `DepartmentGrid` → escolhe "TI".
2. `NewRequest` monta `CreateTicketForm module="tickets"` com `KnowledgePanel` ao lado.
3. Usuário escolhe categoria e subcategoria (de `ti_categories`, módulo `tickets`).
4. `DynamicFormFields` renderiza os campos extras daquela (sub)categoria.
5. Conforme título e descrição são digitados (debounce de 800 ms), `usePOPMatcher` chama
   `ai-match-pop`; havendo match, o `POPSuggestionBanner` aparece e **bloqueia o envio**
   (`isSubmitBlocked`) até o usuário clicar "Isso não resolveu" — ou resolver ali mesmo e nunca
   abrir o chamado (`handlePOPSolved` volta para `/helpdesk` com toast).
6. Preenche título e descrição (ambos com `AIRefineButton`), prioridade em pill e `AssetSelector`.
7. `useCreateTicket` insere em `tickets`. Se os campos dinâmicos trouxeram `delivery_datetime` ou
   `assignee_select`, viram `due_date`/`assigned_to` e o insert já marca `status:'in_progress'` e
   `first_response_at` (`src/hooks/useHelpdesk.ts:283-291`). As respostas dos campos dinâmicos vão
   para `ticket_form_responses`.

#### Fila técnica
`useTicketQueue(module)` busca `status ∈ {open, in_progress, waiting_user, waiting_parts}` com
`.eq('module', module)`. O isolamento por departamento só entra quando **não** há `moduleFilter`
explícito, `departmentIsolation` está ligado no tenant e o usuário **não** é `owner/admin/manager`;
nesse caso restringe ao módulo do próprio `profile.department`, mas ainda inclui tickets de outros
módulos onde o usuário foi **mencionado** (`ticket_mentions`) via `.or(...)`
(`src/hooks/useHelpdesk.ts:80-100`). Como a `TechnicianView` de TI sempre passa `module="tickets"`,
esse ramo nunca roda ali.
Visibilidade adicional no cliente (`visibilityMode = 'all' | 'own_and_unassigned'`,
`TechnicianView.tsx:39,42-50`): quem não é supervisor e não está em `'all'` só vê tickets sem dono
ou atribuídos a si.

#### Conversa e resposta
`TicketConversation` monta a timeline (descrição inicial como primeira mensagem mais
`ticket_comments`, ocultando `is_internal` de não técnicos) → `ReplyComposer` (toggle
interno/público só para técnico) → `useAddComment` insere em `ticket_comments`, sobe anexos para
`ticket-attachments`. **Quem é avisado decide o banco** (trigger `trg_notify_on_ticket_comment`,
migration `20260908020000`): comentário público do solicitante → responsável, ou equipe do módulo
(`notification_team()`: quem tem o módulo em `user_module_access`, senão owner/admin/manager);
comentário público de qualquer outro → solicitante e responsável; interno → ninguém. O mesmo vale
para o chamado novo (`trg_notify_on_ticket_created` → responsável ou equipe, nunca o solicitante),
inclusive os espelhos de RH/offboarding e os de renovação do `check-alerts`.

#### Transferência (`useTicketActions.transferTicket`, `src/hooks/useTicketActions.ts:77-140`)
Atualiza `assigned_to`, posta comentário interno automático ("Chamado transferido de X para Y.
Motivo: ...") e notifica o novo responsável **e o solicitante** (`ticket_assigned`).

#### Resolução (`resolveTicket` → `changeStatus`, `:128-215`)
Antes de qualquer transição para `resolved`/`closed`, `ensureChecklistAllowsClosing` consulta
`ticket_checklist_items` com `is_required = true AND is_completed = false`; havendo algum, lança
erro e bloqueia (`CHECKLIST_BLOCK_MESSAGE`). Ao resolver: `resolved_at = now()`,
`resolution_notes = motivo`. Ao fechar direto sem ter resolvido antes, o código força
`resolved_at = now()` também — comentário explícito: "Marco de SLA é sempre `resolved_at`". Sempre
posta comentário interno de auditoria e notifica o solicitante.

#### Avaliação e reabertura (janela de 7 dias)
`evaluateTicket`: `status → closed`, `closed_at = now()`, grava `satisfaction_rating` e comenta
publicamente a nota. `reopenTicket`: `status → in_progress`, **limpa** `resolved_at` e `closed_at`
(o relógio de SLA volta a correr, pois `slaRunning` fica `true` de novo) e comenta publicamente o
motivo — o trigger de comentário avisa o técnico (ou a equipe, se ninguém assumiu); a avaliação
chega ao técnico pelo mesmo caminho.
`evaluationDaysLeft = max(0, ceil(7 - dias_desde_resolved_at))`; expirada a janela, o painel só
mostra aviso.

#### POPs: criar, versionar, receber feedback
"Novo Tutorial" → `TemplateSelector` (ou em branco) → `TutorialEditor` monta o conteúdo inicial do
template (convertido de blocos para markdown) → edição em `RichTextEditor` → ao salvar: se novo,
`useCreatePOP` insere em `pops` **e** `useCreatePOPVersion` cria a versão inicial
(`change_summary: 'Versão inicial'`); se edição, salva primeiro uma versão com o conteúdo
**anterior** e só depois faz o `update`.
`TutorialViewer` incrementa `views_count` e registra interação `viewed` no mount; o feedback "útil?"
incrementa `solved_count` (sim) ou abre `POPFeedbackDialog` (não), gravando nota, útil/não útil e
sugestão em `pop_feedbacks`. Restaurar versão sobrescreve `pops` com os campos da versão escolhida,
**sem** criar uma nova versão para o estado anterior à restauração.

#### Inventário: criar, vincular, trocar
Criação e edição por `AssetForm` (categoria resolvida de `ti_categories` módulo `inventory`, mapeada
ao enum técnico por `inferCategoryEnum`). O vínculo com o chamado ocorre na abertura
(`AssetSelector`), gravando `asset_id` no ticket.
Troca de equipamento (`AssetSwapDialog` → `swapAsset`, `useTicketActions.ts:274-340`) em 4 passos:
(1) ativo antigo vira `status='maintenance'` e `assigned_to=null`; (2) ativo novo recebe
`assigned_to = requester_id`; (3) o ticket passa a apontar para o novo `asset_id`; (4) comentário
interno de auditoria e notificação ao solicitante.

#### Licenças: criar, atribuir, renovar
`LicenseForm` grava em `software_licenses`; havendo `license_key`, ela vai **separada** para
`software_license_keys` (tabela mais restrita — o hook a lê numa query própria que "retorna vazio se
o usuário não tem permissão", comentário em `useLicenses.ts:30`). Atribuir
(`LicenseAssignDialog`) grava em `license_assignments`, a usuário **ou** a ativo, nunca ambos.
Renovar só aparece para licenças **não software** (`isRenewable = item_category !== 'software'`):
grava uma linha em `software_license_renewals` com o período anterior e o novo, e atualiza
`purchase_date`, `expiry_date` e `purchase_value`.

#### Contratos e manutenções
Contratos: CRUD simples, com status sempre recalculado na leitura. Manutenções: criadas
isoladamente em `Maintenances` ou vinculadas a um chamado em andamento por
`CreateMaintenanceDialog` (aberto pela `TicketActionsBar`), que posta comentário automático com
tipo, título e data prevista.

### 2.6 O que está incompleto no TI

- **Editor de blocos morto**: `BlockEditor`, `BlockItem` e `SortableBlockItem` estão completos e
  funcionais, mas **nenhuma tela os importa** — o editor de POP em produção é sempre markdown.
  Como consequência, `POPPreview` também nunca é atingido em `TutorialViewer`.
- **Relatórios agendados de IA**: `CreateReportDialog`, `ReportDetailSheet` e `useInsightReports`
  têm CRUD completo, mas **nenhuma página os monta** — feature pronta sem entrada de UI.
- **`PatternsAnalysis`** tem hooks funcionais (`ai-analyze-patterns`) mas está desconectado
  justamente do módulo que o motiva; só aparece em Marketing e RH.
- **`DashboardCustomizer` é decorativo**: grava `dashboard_preferences` (`visible_widgets`,
  `widget_order`, `default_period`) e `isWidgetVisible` é calculado em `TIRelatorios.tsx:246`, mas
  **nunca condiciona nenhum bloco JSX** — a Visão Geral é hardcoded. Salva e não aplica.
- **Offboarding não fecha o ciclo**: `OffboardingAccessPanel` filtra por `revoke_ticket_id` em
  `employee_access_grants`, mas **nada no frontend grava esse campo** (só leitura em
  `useEmployeeAccessGrants.ts:37`). O vínculo "chamado de desligamento → acessos a revogar" só
  funcionaria se algo fora de `src/` preenchesse a coluna.
- **Rota quebrada**: os atalhos "Dashboard TI" e "Indicadores de SLA" da home apontam para
  `/ti/dashboard`, que não existe.
- **Métricas com definição concorrente**: "ativos em uso" (por `status` x por posse) e a janela de
  vencimento de licença/contrato (três implementações) coexistem sem fonte única.
- **`OverdueTicketsCard`** existe (190L) mas não é importado por `TIRelatorios`.
- **`TerminalTicketRow`** não é referenciado por `WorkOSTable`.
- **`sla_due_at` nunca é definido pelo frontend** — não há atribuição desse campo em
  `useCreateTicket` nem em nenhum hook do módulo. O cálculo do prazo a partir da prioridade e das
  `sla_policies` acontece no banco (trigger/função), coerente com o texto fixo do `SLAPoliciesTab`:
  "Os tempos de SLA são calculados automaticamente ao criar um chamado".
---

## 3. Módulo RH

Rotas: `rh/chamados`, `rh/chamados/:id`, `rh/indicadores`, `rh/colaboradores`, `rh/aprovacoes`,
`rh/holerites`, `rh/beneficios`, `rh/folha`, `rh/faltas`, `rh/reembolsos`, `rh/documentos`,
`rh/configuracoes` (`src/routes/StaffAppRoutes.tsx:97-109`) e o self-service `meu-rh` (`:121`).
Menu lateral em `src/components/layout/AppSidebar.tsx:60-69`.

> **A rota `rh/reembolsos` não aparece no menu** (`AppSidebar.tsx:60-69` não a lista). A tela só é
> alcançada embutida como aba dentro de Benefícios (`src/pages/rh/RHBeneficios.tsx:52`).

> **Duas identidades de colaborador convivem e não se cruzam**: `rh_employee_profiles` (cadastro de
> RH, pode existir sem conta de acesso) e `profiles` (conta de login). Folha, faltas e reembolsos
> apontam para o primeiro; holerites, benefícios, documentos, atestados, férias e acessos apontam
> para o segundo. A ponte é `access_email` mais a RPC `rh_link_employee_user` e o trigger
> `rh_auto_link_on_profile` — e é frouxa: colaborador sem conta não recebe holerite nem documento;
> usuário sem cadastro de RH não entra na folha.

### 3.1 Telas

#### `rh/chamados` e `rh/chamados/:id`
Não são telas próprias: reutilizam `TechnicianView module="rh"` e `TicketDetail`
(`src/routes/StaffAppRoutes.tsx:98-99`). O que é específico de RH ali é o `OffboardingAccessPanel`
(§3.2).

#### `rh/colaboradores` (`src/pages/rh/RHColaboradores.tsx`, 279L)
**Mostra**: tabela com Colaborador (nome e CPF), Empresa (código), Cargo/Setor, Gestor, Contrato,
Admissão, Exp. 45/90, Salário, Status e Acesso (`:102-112`).
**Filtros**: empresa (`CompanyPicker`, `:66`), status ativo/afastado/desligado (`:67-74`, default
`ativo` via `useQueryState`, `:27`), busca client-side por nome, CPF, departamento ou cargo
(`:33-42`).
**Ações**: criar (`:75` → `EmployeeDialog`, `:174-279`), editar (`:147`), remover com `confirm()`
nativo (`:148`) e **vincular conta de acesso por e-mail** via RPC `rh_link_employee_user`
(`:270-272`).
**Badge de acesso** (`:137-145`): `user_id` preenchido → "Vinculado"; só `access_email` →
"Aguardando aceite"; nenhum → "Sem conta".
**Campos do formulário** (`:202-253`): nome (obrigatório), CPF, nascimento, empresa, departamento
(do catálogo), cargo, gestor (texto livre), tipo de contrato (`CLT|PJ|Estágio|Temporário|Aprendiz`,
`:15`), matrícula, admissão, salário base, status, data de desligamento (só se status é
`desligado`, `:238-240`) e e-mail de acesso.
**Não editáveis em tela nenhuma**: `position`, `cost_center` e `manager_user_id` (existem no banco);
`manager_name` é texto solto, sem FK. `probation_45`/`probation_90` só são derivados no hook (§3.4).

#### `rh/aprovacoes` (`src/pages/rh/RHAprovacoes.tsx`, 202L)
Duas abas (`:25-32`).
**Férias e folgas** (`VacationApprovals`, `:37-120`): 100 solicitações mais recentes (`:41-54`), com
nome e departamento do solicitante, tipo (Férias/Abono/Banco de horas), período, dias e observação
(`:85-93`). Aprovar e Recusar só para `status === 'pendente'` (`:96-104`). Contador "N aguardando
decisão" (`:71,77`).
**Atestados** (`CertificateValidations`, `:122-201`): últimos 100 (`:126-139`), com nome, dias,
data, médico e CID (`:173-181`). "Ver arquivo" gera signed URL de 60 s (`:156-159`); Rejeitar e
Validar só se `status === 'recebido'` (`:184-188`).

**Limitações reais deste fluxo**:
- A decisão grava **apenas** `status` e `decided_at` (`:60`) / `status` e `validated_at` (`:145`).
  `decided_by`, `decision_notes`, `validated_by` e `validation_notes` **nunca são escritos**.
- Notificação (desde 2026-09-08): a decisão avisa o colaborador (`request_decided`, insert em
  `RHAprovacoes.tsx`); a solicitação avisa o RH pelo chamado espelho (`trg_notify_on_ticket_created`
  → quem tem o módulo `rh`, senão owner/admin/manager); holerite e documento no cofre avisam o
  colaborador (`document_available`, sino leva a `/meu-rh`).
- Aprovar férias **não decrementa** `vacation_balance_days` nem atualiza `last_vacation_end`.
- Validar atestado **não cria** registro em `rh_absences` — são universos separados.

#### `rh/holerites` (`src/pages/rh/RHHolerites.tsx`, 155L)
Formulário de upload (`:86-131`) mais lista dos 50 últimos envios (`:133-152`).
**Ações**: escolher colaborador (de `profiles`, `:23-35`), tipo (`mensal|13o|ferias|rescisao`,
`:110-115`), mês de referência (`<input type="month">`, `:120`), PDF (`:124`) e enviar (`:127`).
**Upload** (`:52-65`): caminho `{tenantId}/{userId}/{ano}/holerites/{tipo}-{ym}-{Date.now()}.{ext}`
no bucket `rh-documents`, seguido de insert em `rh_payslips`.
A lista mostra "Visto em dd/MM HH:mm" ou "Não lido" (`:146-148`).
**Limitações**: sem delete, sem download pelo RH nesta tela e sem envio em lote. O colaborador vem
de `profiles`, não de `rh_employee_profiles` — quem não tem conta não recebe holerite.

#### `rh/beneficios` (`src/pages/rh/RHBeneficios.tsx`, 319L)
Duas abas (`:46-53`): **Planos de Benefício** e **VT, VA, Combustível e Descontos** — esta segunda
é a página `RHReembolsos` inteira renderizada inline (`:31,52`).
**Planos** (`BenefitPlansSection`, `:58-187`): card de planos (`:119-147`) com nome, categoria,
fornecedor e valor mensal, badge "Inativo" (`:139`) e remover (`:140`); card de vínculos
(`:149-184`) com os 200 mais recentes, plano, início, contagem de dependentes (`:163-167`), badge
de status (`:170-176`) e remover (`:177`).
**Diálogos**: novo plano (`:189-238`, 9 categorias em `:17-27`) e vincular colaborador
(`:240-318`, com lista editável de dependentes: nome e parentesco
`conjuge|filho(a)|pai/mae|outro`, `:301-304`). **Ambos só inserem — não editam.**
**Casca**: `is_active` do plano não pode ser alterado pela UI; `rh_employee_benefits.status`,
`end_date` e `notes` nunca são editados — um vínculo nasce `ativo` e só sai por delete.

#### `rh/folha` (`src/pages/rh/RHFolha.tsx`, 197L)
Barra de resumo com 10 totais (`:99-110`) e planilha editável por colaborador (`:133-178`).
**14 colunas editáveis inline** (`EDITABLE`, `:11-26`): `gross_salary` (Bruto), `family_allowance`
(Sal. Família), `advance` (Adiantamento), `meal_voucher` (VA), `transport_voucher` (VT),
`health_plan`, `health_coparticipation`, `payroll_loan` (Empréstimo), `mobility` (Combustível),
`inss`, `irpf`, `other_deductions`, `thirteenth_vacation` (13º e Férias), `irpf_thirteenth`.
Calculadas e somente leitura: `total_deductions` e `net_salary` (`:167-168`).
**Ações**: trocar mês (`MonthPicker`, `:86`) e empresa (`:87`); **Gerar folha do mês** via RPC
`rh_generate_payroll` (`:88-91`); **Exportar CSV** (`:60-71`, separador `;`, arquivo
`folha-{month}.csv`); editar célula com update no `onBlur` (`:160-164`); remover lançamento
(`:170-172`); busca por nome (`:121`).
**Aviso do próprio código** (`:180-183`): editar uma célula **não recalcula** líquido nem totais; o
recálculo só acontece ao rodar "Gerar folha do mês" de novo — que **sobrescreve as edições manuais**
(§3.6).

#### `rh/faltas` (`src/pages/rh/RHFaltas.tsx`, 184L)
4 KPIs (`:68-73`) e tabela do mês (`:83-117`) com Data, Colaborador, Departamento, Tipo,
Justificada, Dias, Horas e Motivo.
**Tipos** (`KINDS`, `:18-24`): `falta`, `atestado`, `consulta`, `atraso`, `saida_antecipada`.
**Ações**: trocar mês (`:61`), lançar (`:62-64`), editar (`:110`), remover (`:111`). O diálogo
(`:127-175`) tem colaborador (só ativos), data, tipo, dias e horas (step 0.5), switch "Justificada",
motivo e observação.
**Casca**: não há upload aqui — o atestado anexado vive em `rh_medical_certificates` (fluxo do
colaborador) e o tipo `atestado` desta tela é só um rótulo manual. **As duas coisas não se
comunicam.**

#### `rh/reembolsos` (`src/pages/rh/RHReembolsos.tsx`, 461L)
Quatro abas (`:24-36`), cada uma com total do mês no cabeçalho, botão **"Replicar mês anterior"**,
botão **"Lançar"** e linhas com editar/remover:
- **VA** (`MealTab`, `:42-95`): Colaborador, Valor/dia, Dias, Total, Desc. 20 % (colaborador).
- **VT** (`TransportTab`, `:135-194`): Ônibus/dia, Metrô/dia, Dias úteis, Valor/dia, Total, Saldo
  anterior, A depositar.
- **Combustível** (`FuelTab`, `:246-303`): Km/dia, R$/km, Dias, Total, Desc. salário (6 %), A pagar.
- **Descontos** (`DeductionsTab`, `:351-414`): Mobilidade, Plano de saúde, Coparticipação,
  Empréstimo, Desc. VA, Salário-família.

> **Isto não é um fluxo de reembolso com comprovante.** Não há upload de nota fiscal, estado de
> aprovação, estado de pagamento nem solicitação pelo colaborador. É uma **planilha mensal
> preenchida pelo RH**. As tabelas `rh_transport_vouchers`, `rh_meal_vouchers`,
> `rh_fuel_reimbursements` e `rh_monthly_deductions` não têm coluna de anexo, status, aprovador nem
> data de pagamento. Se o sistema novo precisa de "solicitar → anexar comprovante → aprovar →
> pagar", **isso não existe no sistema**.

#### `rh/documentos` (`src/pages/rh/RHDocumentos.tsx`, 217L)
Banner de alerta se houver documento vencendo em até 30 dias (`:93-102`) e cofre com os 200 mais
recentes (`:35-48`). Cada linha (`:120-140`): título, badge de versão se `version > 1`, badge
"Vencido" ou "Vence em Nd", nome do colaborador, tipo e validade.
**Ações**: arquivar (`:148-217`), abrir/baixar por signed URL de 60 s (`:70-73,134`) e remover —
que apaga do storage **e** da tabela (`:60-68`).
**Upload** (`:159-179`): valida 20 MB (`:163`), aceita PDF e imagens (`:208`), caminho
`{tenantId}/{userId}/{ano}/cofre/{docType}-{Date.now()}.{ext}`. Campos: colaborador, tipo (12
opções, `:16-29`), título, emitido em, vence em.
**Casca**: `version` e `notes` nunca são escritos pela UI — a badge `v{n}` (`:124`) sempre mostraria
v1. **Não há versionamento real de documento.**

#### `rh/configuracoes` (`src/pages/RHConfiguracoes.tsx`, 438L)
Seis abas (`:139-145`):
1. **Empresas** (`:160-211`): CRUD de `rh_companies` — código (uppercase forçado, `:199`), nome, CNPJ.
2. **Departamentos** (`:214-236`): adicionar por nome e remover. `sort_order` e `is_active` existem
   na tabela mas não são editáveis.
3. **Parâmetros da Folha** (`:239-341`): 7 campos numéricos mais editores das faixas de INSS e IRPF,
   com botões "Restaurar tabela 2025" (valores oficiais hardcoded em `:18-30`). Converte
   porcentagem e decimal em `:33-43` (armazena decimal, exibe %) e normaliza brackets legados
   (`:46-54`).
4. **Categorias** (`:344-359`): delega para o `CategoryManager module="rh" allowForms` genérico,
   gated por `useDepartmentPermissions('rh')`.
5. **Prazos (SLA)** (`:362-418`): edita `first_response_time` e `resolution_time` em minutos por
   prioridade via `useSLAPolicies`. **Aviso no próprio código** (`:410-412`): "Estes prazos são
   compartilhados com chamados de outros módulos que usem a mesma prioridade" — **não há SLA por
   módulo**.
6. **Acesso** (`:421-438`): **casca 100 %** — card com texto e caixa tracejada dizendo que "perfis
   granulares de RH (ex.: somente folha, somente atestados) entram em uma próxima fase"
   (`:432-434`). Nenhum controle.

#### `rh/indicadores` (`src/pages/RHRelatorios.tsx`, 228L)
Quatro abas (`:64-69`): **Visão Geral** (`:71-109`, 4 KPIs, gráfico de área de aberturas x
conclusões em `:86-105` e `RHPeopleWidget` em `:139-227`), **Produtividade** (`:111-113`,
`TechnicianPerformanceChart` genérico com `module:'rh'`), **Análise Detalhada** (`:115-122`,
`DetailedRHTable`) e **Padrões (IA)** (`:124-126`, `PatternsAnalysis module="rh"` genérico).
Seletor de período (`:55-60`): Hoje / 7 / 30 / 90 dias, persistido na querystring.

#### `meu-rh` — self-service do colaborador (`src/pages/MeuRH.tsx`, 572L)
**Aviso de vínculo ausente** (`:87-98`): sem `rh_employee_profiles` para o `user_id`, mostra banner
âmbar explicando que a pessoa ainda pode enviar solicitações e atestados, mas não vê holerites,
benefícios nem documentos.
**4 KPIs** (`:101-107`): saldo de férias, solicitações abertas, holerites não lidos, matrícula.
**6 abas** (`:110-130`):
- **Férias** (`:133-154`): histórico das próprias solicitações mais "Nova solicitação"; cada linha
  (`:390-419`) mostra período, dias, tipo, observação e badge de status, com **Cancelar** só se
  `pendente` (`:411-415`).
- **Atestados** (`:157-199`): lista com dias, data, médico e CID, badge de status e download; botão
  "Enviar atestado".
- **Holerites** (`:202-236`): lista por mês, badge "novo" se `!viewed_at` (`:222`), botão Baixar que
  também marca como visto (`:72-76,227`).
- **Benefícios** (`:239-288`): plano, fornecedor, categoria, início, dependentes (`:277-281`) e
  status. **Somente leitura** — o texto manda abrir chamado ao RH (`:243`).
- **Documentos** (`:291-334`): título, versão, badges de vencimento, tipo, datas e download.
  **Somente leitura.**
- **Meus dados** (`:337-351`): matrícula, CPF, admissão, saldo de férias, última saída de férias.
  **Somente leitura** — manda abrir chamado de "Atualização cadastral" (`:341`).

**Diálogo Nova solicitação** (`:421-495`): tipo (`ferias` com saldo exibido, `abono`,
`banco_horas`), início, fim (com `min={start}`, `:472`) e observações. Valida `days >= 1` e, para
férias, `days <= balance`, mostrando "excede seu saldo de N dias" (`:434-435,478`).
**Diálogo Enviar atestado** (`:497-572`): arquivo PDF/JPG/PNG de no **máximo 5 MB** (`:511-514`),
data do atestado, dias de afastamento (mínimo 1), e médico, CRM e CID opcionais.

### 3.2 Componentes

#### `src/components/rh/DetailedRHTable.tsx`
Tabela consolidada usada só em `RHRelatorios.tsx:116-121`. Consome 6 hooks do mês corrente
(`:52-59`). Chips de filtro por categoria (`atendimento`, `prazos`, `pessoas`, `folha`,
`beneficios`, `:15-21,61-74,202-215`), persistidos em `localStorage['rh-detailed-categories']`, sem
deixar desmarcar a última (`:69`). Blocos: Indicadores do Período (`:218-252`), Chamados por
Prioridade (`:255-283`), Chamados por Categoria x Status (`:286-328`), Folha por Empresa
(`:331-365`), Folha por Departamento (`:368-398`), Top colaboradores com faltas (`:401-430`) e Top
combustível (`:434+`). O componente `Trend` (`:26-38`) mostra traço quando a variação é de até 1
ponto percentual em módulo.
**Este componente está quebrado em 7 pontos — ver §3.3.**

#### `src/components/rh/shared.tsx`
`currentMonth()` (`:5-8`, primeiro dia do mês como `YYYY-MM-DD`); `fmtBRL(n)` (`:10-11`);
`MonthPicker` (`:13-23`, converte `YYYY-MM` ↔ `YYYY-MM-01`); `CompanyPicker` (`:25-36`, com opção
sentinela `__all__` → `null`); `EmployeeSelect` (`:38-46`).

#### `src/components/helpdesk/AdmissionAccessEditor.tsx` — admissão
Editor de lista de acessos a liberar. Cada linha tem select de tipo
(`sistema|email|pasta|equipamento|outro`, rótulos em `src/hooks/useEmployeeAccessGrants.ts:94-100`),
Nome (placeholder "ex.: ERP, Office 365", `:43`), Observação e remover (`:33-58`). O estado vazio
explica o propósito: *"No desligamento, esta lista é usada para gerar o chamado de revogação"*
(`:30`). É **controlado e puro** — não fala com o banco.
**Conexão com o chamado** (`src/components/helpdesk/CreateTicketForm.tsx`): o gate é
`isAdmission = module === 'rh' && /^admiss/i.test(selectedSubcategory?.name || '')` (`:68`) —
aparece **só** em chamado do módulo `rh` cuja subcategoria comece com "Admiss"; renderizado em
`:310-314`. No submit (`:174-184`), após criar o ticket, filtra grants com nome preenchido e chama
`useBatchCreateAccessGrants` com `employeeId: user.id`, `employeeName` do metadata e
`ticketId: ticket.id`.

> **Falha estrutural**: `employeeId` é **`user.id`, o usuário logado que abriu o chamado**, não o
> colaborador admitido (`CreateTicketForm.tsx:178`). Se o RH abre a admissão em nome de outra
> pessoa, os acessos ficam registrados no RH — e o desligamento futuro dessa pessoa não encontra
> nada. Além disso `employee_id` referencia `profiles(id)`, **não** `rh_employee_profiles`.

#### `src/components/helpdesk/OffboardingAccessPanel.tsx` — desligamento
Checklist "Acessos a revogar" com contador `revogados / total` (`:17,24`). Cada item é um
`Checkbox` que alterna `revoked_at`/`revoked_by` (`:34-39` → `useEmployeeAccessGrants.ts:77-92`),
com badge do tipo, nome riscado quando revogado e a nota de `details.note` (`:42-50`). Renderiza
`null` se não houver grants (`:15`).
**Conexão**: montado na coluna direita de **todo** `TicketDetail` (`src/pages/TicketDetail.tsx:224`),
mas consulta por `revoke_ticket_id = ticketId` (`useEmployeeAccessGrants.ts:37`) — só materializa no
chamado de TI gerado pelo trigger (§3.6).

### 3.3 Indicadores — fórmulas

#### KPIs de `rh/indicadores` — Visão Geral (`RHRelatorios.tsx:75-80`)
Todos vêm de `useTicketMetrics({period, module:'rh'})` (`:35-37`), que consulta `tickets` filtrando
`created_at` na janela **e** `module = 'rh'` (`src/hooks/useHelpdeskMetrics.ts:83-94`).

| KPI | Fórmula |
|---|---|
| Solicitações no período | `tickets.length` após o filtro de módulo e janela (`useHelpdeskMetrics.ts:101`) |
| SLA atendido (%) | `round(slaMetCount / total * 100)` (`:190`). `slaMetCount` incrementa quando (a) há `resolved_at` e `resolved_at <= sla_due_at`, ou (b) não há `resolved_at`, o status não está em `{resolved, closed, cancelled, rejected}` e `agora <= sla_due_at` (`:159-170`). Tickets sem `sla_due_at` entram no denominador mas nunca no numerador |
| SLA violados | Tickets com `sla_due_at`, status fora de `{resolved, closed, cancelled, rejected}` e `agora > sla_due_at` (`:172-178`) |
| Tempo médio de resposta (h) | Rotulado "resposta" mas é **resolução**: `round((Σ (resolved_at − created_at)/3600000) / nº com resolved_at * 10)/10` (`:182-191`) |

Janelas (`useHelpdeskMetrics.ts:48-75`): `today` = de `startOfDay(hoje)`; `7d`/`30d`/`90d` =
`startOfDay(subDays(hoje, N))`; fim sempre `endOfDay(hoje)`.

> **Bug de cache**: a `queryKey` de `useTicketMetrics` (`useHelpdeskMetrics.ts:81`) **não inclui
> `filter.module`** — RH, TI, Financeiro e Qualidade compartilham a mesma chave para o mesmo
> período. O mesmo vale para `useTicketTrends` (`:204`) e `usePreviousMetrics` (`:262`).

#### Gráfico de evolução (`RHRelatorios.tsx:86-105`)
`useTicketTrends({period, module:'rh'})` (`useHelpdeskMetrics.ts:200-256`): um bucket por dia da
janela (`:226-231`); `opened` conta por `created_at.split('T')[0]` e `resolved` por
`resolved_at.split('T')[0]` (`:233-249`). Ticket resolvido fora da janela não é contado.

#### `DetailedRHTable` — Indicadores do Período (`:115-144`)

**Atendimento**: Total = `metrics.total` (`:110,117`); Em aberto =
`tickets.filter(t => ['open','in_progress','pending'].includes(t.status)).length` (`:111`);
Resolvidos = `['resolved','closed']` (`:112`); Encerrados = `t.status === 'closed'` (`:113`).

**Prazos**: 1ª resposta média = `fmtH(metrics.avgFirstResponseTime || 0)` (`:122`), onde
`fmtH = h >= 24 ? (h/24).toFixed(1)+'d' : round(h)+'h'` e `0 → '—'` (`:23`); Resolução média =
`${metrics.avgResolutionTime}h` (`:123`); SLA cumprido = `${metrics.slaCompliance}%` (`:124`); SLA
estourado = `metrics.slaViolated` (`:125`).

**Pessoas**: Headcount ativo = `employees.filter(e => e.status === 'active').length` (`:78,127`);
Admissões no mês = `admission_date` no mês e ano correntes (`:79-81`); Desligamentos no mês = idem
com `termination_date` (`:82-84`); Aniversariantes = `mês(birth_date) === mês atual` (`:85`);
Aniversários de empresa = `mês(admission_date) === mês atual && differenceInYears(hoje,
admission_date) >= 1` (`:86-90`); Faltas no mês = `absences.length` — **contagem de linhas, não soma
de dias** (`:102`); Atestados = `a.type === 'certificate' || a.type === 'medical'` (`:103`); Atrasos
= `a.type === 'late' || a.type === 'delay'` (`:104`).

**Folha** (`:92-100`, `sum(arr,k) = arr.reduce((acc,r) => acc + (Number(r[k])||0), 0)`): Folha bruta
= `Σ gross_salary`; Folha líquida = `Σ net_salary`; INSS = `Σ inss`; IRPF = `Σ irpf`.

**Benefícios**: VA pago = `Σ payroll[].meal_voucher || (Σ va[].total_amount || Σ va[].amount)`
(`:98,108,141`); VT pago = análogo com `transport_voucher` (`:99,107,142`); Combustível =
`Σ fuel[].total_amount || Σ fuel[].amount` (`:106,143`).

**Agregações auxiliares**: Categoria x Status (`:149-154`, chave
`t.category?.name || t.category_name || 'Sem categoria'`, ordenado por total desc, `:308-310`);
Prioridade com `% = round(value/total*100)` (`:24,276`); Folha por Empresa (`:157-166`, agrupa por
`p.company?.code`, acumula `count/gross/net/inss/irpf`, ordena por `gross` desc); Folha por
Departamento (`:169-176`, **custo médio = `gross / count`**, `:391`); Top faltas (`:179-186`, agrupa
por `employee.id`, `lates` se o tipo é `late`/`delay` senão `days`, ordena por `days + lates` desc,
top 10); Top combustível (`:189-197`, `km += f.km || f.total_km`,
`amount += f.total_amount || f.amount`, top 10 por `amount`).

> #### Este bloco está quebrado em sete pontos — ler antes de reimplementar
>
> 1. **`tickets` chega sempre vazio.** `RHRelatorios.tsx:117` passa
>    `tickets={(metrics as any)?.tickets || []}`, mas `TicketMetrics`
>    (`useHelpdeskMetrics.ts:5-22`) **não tem campo `tickets`** e o hook nunca o devolve
>    (`:100-116,195`). "Em aberto", "Resolvidos" e "Encerrados" são sempre **0**; Categoria e
>    Prioridade nunca renderizam.
> 2. **Todas as setas de variação são traço** — `variations={{}}` (`RHRelatorios.tsx:119`).
> 3. **"1ª resposta média" é sempre `—`** — `avgFirstResponseTime` não existe em `TicketMetrics`.
> 4. **"Headcount ativo" é sempre 0** — o filtro testa `e.status === 'active'` (`:78`), mas o valor
>    real gravado é `'ativo'` (default da coluna; a UI usa `RHColaboradores.tsx:16-20`; a própria RPC
>    de folha filtra `status = 'ativo'`).
> 5. **"Atestados no mês", "Atrasos no mês" e a coluna Atrasos do Top faltas são sempre 0** — filtram
>    por `a.type` (`:103-104,184`), mas a coluna real de `rh_absences` chama-se **`kind`**, com
>    valores `falta|atestado|consulta|atraso|saida_antecipada`.
> 6. **`fuelTotal`, `vtTotal`, `vaTotal` e o Top combustível são sempre 0** — somam
>    `total_amount`/`amount`/`km`/`total_km` (`:106-108,194-195`), colunas que **não existem**: as
>    reais são `total`, `to_pay`, `to_deposit`, `km_per_day`.
> 7. **"Faltas no mês" conta linhas, não dias** — diverge do KPI "Dias perdidos" da própria tela de
>    Faltas (`RHFaltas.tsx:41`), que soma `days`.

#### KPIs de `rh/faltas` (`RHFaltas.tsx:40-46,68-73`)
Lançamentos = `absences.length`; Dias perdidos = `Σ absences[].days` com `.toFixed(1)`;
Justificadas = `${absences.filter(r => r.justified).length} de ${absences.length}`; Tipos = número
de valores distintos de `kind`.

#### KPIs de `rh/colaboradores` (`RHColaboradores.tsx:46-51,79-84`)
Total = `employees.length` (já filtrado por status e empresa no hook,
`src/hooks/useRH.ts:127-128`); Folha base estimada = `fmtBRL(Σ base_salary)`; Departamentos =
valores distintos de `department` (`'—'` para nulo); Empresas = `companies.length` (todas do
tenant, não filtradas).

#### Resumo de `rh/folha` (`RHFolha.tsx:44-58,99-110`)
Sobre `filtered` (após empresa e busca), `sum(k) = Σ (Number(r[k])||0)`: Colaboradores =
`filtered.length`; Bruto = `Σ gross_salary`; Líquido = `Σ net_salary`; INSS = `Σ inss`; IRPF =
`Σ irpf`; VA = `Σ meal_voucher`; VT = `Σ transport_voucher`; Plano saúde =
`Σ health_plan + Σ health_coparticipation`; Adiantamentos = `Σ advance`; 13º e Férias =
`Σ thirteenth_vacation`.

#### Totais de `rh/reembolsos`
VA = `Σ rows[].total` (`:46`); VT ("Total a depositar") = `Σ rows[].to_deposit` (`:139`);
Combustível ("Total a pagar") = `Σ rows[].to_pay` (`:250`); Descontos — Mobilidade =
`Σ mobility` (`:356`), Plano de saúde = `Σ (health_plan + health_coparticipation)` (`:357`),
Empréstimo = `Σ payroll_loan` (`:358`).

#### Cálculos dos diálogos de reembolso

| Cálculo | Fórmula | Local |
|---|---|---|
| VA total | `value_per_day × days` | `RHReembolsos.tsx:102` |
| VA cota do colaborador | `total × 0.20` — **20 % hardcoded**, ignora `meal_voucher_pct` das configurações | `:103,116` |
| VT total | `value_per_day × work_days` — os campos ônibus/dia e metrô/dia **não entram no cálculo** | `:205` |
| VT a depositar | `max(total − previous_balance, 0)` | `:206` |
| Combustível total | `km_per_day × price_per_km × work_days` | `:312` |
| Combustível desconto | `base_salary × 0.06` — **6 % hardcoded**, ignora `fuel_pct` | `:313` |
| Combustível a pagar | `max(total − desconto, 0)` | `:314` |
| `value_per_day` gravado | `km_per_day × price_per_km` | `:339` |

Defaults: VA `value_per_day = 18.81`, `days = 20` (`:100-101`); VT `bus = 2`, `metro = 0`,
`work_days = 20` (`:199-201`); Combustível `price_per_km = 0.70`, `work_days = 20` (`:309-310`).

#### KPIs de `meu-rh` (`MeuRH.tsx:101-107`)
Saldo de férias = `${profile?.vacation_balance_days ?? 30} dias` — **valor estático do cadastro,
nunca decrementado**; Solicitações abertas = `vacations.filter(v => v.status === 'pendente').length`
(`:69`); Holerites não lidos = `payslips.filter(p => !p.viewed_at).length` (`:70`); Matrícula =
`profile?.matricula || '—'`.
Dias solicitados no diálogo (`:429-432`): `differenceInCalendarDays(end, start) + 1` — **dias
corridos**, sem descontar fim de semana ou feriado (o hook repete a conta em
`useMeuRH.ts:110`).

#### `RHPeopleWidget` (`RHRelatorios.tsx:139-227`)
Consulta `rh_employee_profiles` do tenant com join em `profiles` (`:145-149`).
Aniversariantes do mês (`:157-159`): `mês(birth_date) === mês atual`, ordenado por dia crescente.
Tempo de casa (`:161-173`): `mês(admission_date) === mês atual` **e**
`differenceInYears(hoje, admission_date) >= 1`, ordenado por anos desc.
**Duplicação**: as mesmas duas contas existem em `DetailedRHTable.tsx:85-90`.

#### Vencimento de documento
RH (`RHDocumentos.tsx:75-79,116-118`) e colaborador (`MeuRH.tsx:303-305`) usam a mesma fórmula:
`diff = differenceInDays(expires_at, hoje)`; **vencendo** = `0 <= diff <= 30`; **vencido** =
`diff < 0`.

### 3.4 Hooks

#### `src/hooks/useRH.ts` (390L — lado RH/staff)

| Export | Tabela / RPC | O que faz |
|---|---|---|
| `useRHCompanies` (`:15-52`) | `rh_companies` | select por tenant ordenado por `code`; `upsert`; `remove` |
| `useRHDepartments` (`:55-92`) | `rh_departments_catalog` | select ordenado por `sort_order`; upsert; remove |
| `useRHEmployees(filters)` (`:118-182`) | `rh_employee_profiles` | select por tenant ordenado por `full_name`, filtros opcionais `company_id` e `status` (`:126-128`); `upsert`; `remove`; `linkAccount` |
| `useRHPayrollSettings` (`:185-220`) | `rh_payroll_settings` | 1 registro do tenant, `order('company_id', {nullsFirst:false}).limit(1)`; `save` |
| `useRHPayroll(month)` (`:223-273`) | `rh_payroll_entries` | select com joins de `employee` e `company` por `reference_month`; `update`; `generate` (RPC); `remove` |
| `useRHAbsences(month)` (`:276-320`) | `rh_absences` | janela `[month, month+1mês)` sobre `date` (`:279-280,290-291`), join de `employee`, ordem `date` desc; upsert; remove |
| `useMonthly(table, month)` (`:323-385`) | genérico | base das 4 tabelas mensais |
| `useRHTransport` / `useRHMeal` / `useRHFuel` / `useRHDeductions` (`:387-390`) | 4 tabelas mensais | aliases de `useMonthly` |

**Regra de negócio embutida — período de experiência** (`:140-144`): ao salvar colaborador, se
`admission_date` foi informada e `probation_45` não veio, calcula
`probation_45 = admission_date + 45 × 86400000 ms` e `probation_90 = admission_date + 90 ×
86400000 ms`, truncados para `YYYY-MM-DD`.

**Replicar mês anterior** (`:363-382`): lê o mês anterior, remove `id`/`created_at`/`updated_at`,
troca `reference_month` e faz upsert com `onConflict: 'tenant_id,employee_id,reference_month'`
(`:374-376`). Lança "Mês anterior sem dados." se vazio (`:369`).

> **Bug**: `useRHPayrollSettings(companyId)` recebe `companyId`, coloca-o na `queryKey` (`:190`) mas
> **nunca o usa na consulta** (`:193-198`) — sempre devolve a mesma linha do tenant. Efeito
> prático: **os parâmetros de folha por empresa nunca são editáveis pela UI**, apesar de a tabela
> ter `company_id` com `UNIQUE (tenant_id, company_id)`.

#### `src/hooks/useMeuRH.ts` (350L — lado colaborador)
Todas as queries filtram por `user_id = auth user.id`. `useMyRHProfile` (`:66-81`, `maybeSingle`);
`useMyVacationRequests` (`:84-100`); `useCreateVacationRequest` (`:102-135`, calcula
`days_requested = floor((end−start)/86400000)+1`, `:108-110`); `useCancelVacationRequest`
(`:137-153`, `status='cancelada'`); `useMyCertificates` (`:156-172`); `useUploadCertificate`
(`:174-220`, caminho `{tenant}/{user}/{ano do issue_date}/atestados/{Date.now()}.{ext}` com
`upsert:false`); `useMyPayslips` (`:223-239`); `useDownloadRHFile` (`:241-252`,
`createSignedUrl(path, 60)` — **60 segundos**); `useMarkPayslipViewed` (`:254-266`, com guarda
`.is('viewed_at', null)` em `:262`, só marca a primeira vez); `useMyBenefits` (`:296-312`);
`useMyDocuments` (`:333-349`). **Não há indicador algum neste hook** — é CRUD puro.

#### `src/hooks/useDepartmentMembers.ts` (30L)
Consulta `profiles` por `department` e `is_active = true`, ordenado por `full_name` (`:16-21`).
**Não é usado por nenhuma tela de RH** — o único consumidor é
`src/components/helpdesk/DynamicFormFields.tsx:16,28` (campo dinâmico genérico).

#### `src/hooks/useEmployeeAccessGrants.ts` (100L)
`useEmployeeAccessGrants({employeeId, revokeTicketId})` (`:31-44`): select ordenado por
`access_type` e `name`, filtrando por `revoke_ticket_id` se veio, **senão** por `employee_id`
(`:37-38`). `useBatchCreateAccessGrants` (`:46-75`): busca `tenant_id` do próprio `profiles`
(`:58`), monta as linhas com `granted_by = user.id` e `details = note ? {note} : {}` (`:59-68`).
`useToggleRevokeGrant` (`:77-92`): alterna `{revoked_at: now, revoked_by: user.id}` ↔ `{null,
null}`. `ACCESS_TYPE_LABEL` (`:94-100`): Sistema / E-mail / Pasta ou Drive / Equipamento / Outro.

> **Implementação frágil** (`:29`): `const TABLE = 'employee_access_grants' as 'profiles'` — cast
> mentiroso para enganar os tipos gerados; todas as chamadas usam `as any` (`:36,69,86`). Nenhuma
> consulta filtra por `tenant_id` — depende inteiramente da RLS.

#### Hooks genéricos aplicados ao RH
`useTicketMetrics`/`useTicketTrends` com `{period, module:'rh'}` — o único ponto de "RH" é o
`.eq('module','rh')`. **`usePreviousMetrics` não é chamado por `RHRelatorios.tsx`**, por isso
`variations={{}}`. **`useReportMetrics` não é usado no RH** (só em `src/pages/TIRelatorios.tsx:34`).
`useSLAPolicies` e `useDepartmentPermissions('rh')` são genéricos.

### 3.5 Tabelas do banco

| Tabela | Colunas relevantes | Consumida por |
|---|---|---|
| `rh_employee_profiles` | `user_id` (nullable), `admission_date`, `vacation_balance_days` (default 30), `last_vacation_end`, `cpf`, `matricula`, `manager_user_id`, `birth_date`, `position`, `cost_center`, `company_id`, `full_name`, `department`, `job_title`, `manager_name`, `contract_type` (default `CLT`), `probation_45`, `probation_90`, `base_salary`, `status` (default `ativo`), `termination_date`, `access_email` | `useRH.ts:126`, `useMeuRH.ts:73`, `RHRelatorios.tsx:146` |
| `rh_vacation_requests` | `user_id`, `ticket_id`, `start_date`, `end_date`, `days_requested`, `type` CHECK `ferias\|abono\|banco_horas`, `status` CHECK `pendente\|aprovada\|recusada\|cancelada`, `notes`, `decided_by`, `decided_at`, `decision_notes` | `useMeuRH.ts:92`, `RHAprovacoes.tsx:46` |
| `rh_medical_certificates` | `user_id`, `ticket_id`, `issue_date`, `days_off`, `doctor_name`, `doctor_crm`, `cid_code`, `file_path`, `status` CHECK `recebido\|validado\|rejeitado`, `validated_by`, `validated_at`, `validation_notes` | `useMeuRH.ts:164`, `RHAprovacoes.tsx:131` |
| `rh_payslips` | `user_id`, `reference_month`, `type` CHECK `mensal\|13o\|ferias\|rescisao`, `file_path`, `uploaded_by`, `uploaded_at`, `viewed_at` | `useMeuRH.ts:231`, `RHHolerites.tsx:42` |
| `rh_benefit_plans` | `name`, `category` CHECK (9 valores), `provider`, `description`, `monthly_value`, `is_active`, `created_by` | `RHBeneficios.tsx:66` |
| `rh_employee_benefits` | `user_id`, `plan_id` FK RESTRICT, `start_date`, `end_date`, `status` CHECK `ativo\|suspenso\|encerrado`, `dependents` jsonb, `notes` | `useMeuRH.ts:304`, `RHBeneficios.tsx:77` |
| `rh_documents` | `user_id`, `document_type` CHECK (12 valores), `title`, `file_path`, `issue_date`, `expires_at`, `version`, `notes`, `uploaded_by` | `useMeuRH.ts:341`, `RHDocumentos.tsx:41` |
| `rh_companies` | `code`, `name`, `cnpj`, `is_active`; `UNIQUE(tenant_id, code)` | `useRH.ts:23` |
| `rh_departments_catalog` | `name`, `is_active`, `sort_order`; `UNIQUE(tenant_id, name)` | `useRH.ts:63` |
| `rh_payroll_settings` | `company_id`, `transport_voucher_pct` (0.06), `transport_voucher_cap` (500), `meal_voucher_pct` (0.20), `meal_voucher_default_value` (18.81), `advance_pct` (0.20), `fuel_pct` (0.06), `fuel_price_per_km` (0.70), `inss_brackets` jsonb, `irpf_brackets` jsonb | `useRH.ts:193` e RPCs |
| `rh_payroll_entries` | `company_id`, `employee_id`, `reference_month`, os 14 campos editáveis, `total_deductions`, `net_salary`, `notes`; `UNIQUE(tenant_id, employee_id, reference_month)` | `useRH.ts:232` |
| `rh_absences` | `employee_id`, `date`, **`kind`** (default `falta`, **sem CHECK**), `justified`, `reason`, `days`, `hours`, `notes` | `useRH.ts:287` |
| `rh_monthly_deductions` | `employee_id`, `reference_month`, `mobility`, `health_plan`, `health_coparticipation`, `payroll_loan`, `meal_voucher_discount`, `family_allowance` | `useRH.ts:390` |
| `rh_transport_vouchers` | `bus_trips_per_day`, `metro_trips_per_day`, `work_days` (20), `value_per_day`, `total`, `previous_balance`, `to_deposit` | `useRH.ts:387` |
| `rh_meal_vouchers` | `value_per_day` (18.81), `days` (20), `total`, `employee_share_20` | `useRH.ts:388` |
| `rh_fuel_reimbursements` | `km_per_day`, `price_per_km` (0.70), `work_days` (20), `value_per_day`, `total`, `salary_discount`, `to_pay` | `useRH.ts:389` |
| `employee_access_grants` | `employee_id` FK→`profiles`, `employee_name`, `ticket_id` FK→`tickets`, `access_type` CHECK, `name`, `details` jsonb, `granted_at/by`, `revoked_at/by`, `revoke_ticket_id` FK→`tickets` | `useEmployeeAccessGrants.ts:29` |

Migrations de referência: `20260527170235_*.sql`, `20260527172103_*.sql`, `20260612193521_*.sql`,
`20260615112512_*.sql`, `20260616121626_*.sql`, `20260619134028_*.sql`.

**Tabelas de fora consumidas**: `profiles` (selects e joins em `RHHolerites.tsx:28`,
`RHBeneficios.tsx:91`, `RHDocumentos.tsx:54`, `RHAprovacoes.tsx:47,132`, `RHRelatorios.tsx:147`),
`tickets` (indicadores e os dois triggers), `ti_categories` (categorias dos chamados de RH e alvo
das buscas dos triggers).

**Bucket `rh-documents`** (privado), layout `{tenant_id}/{user_id}/{ano}/{tipo}/{arquivo}`, com 5
políticas: o colaborador lê e escreve só onde `foldername[2] = auth.uid()`; o RH lê, escreve e apaga
tudo onde `foldername[1] = tenant` e `has_rh_access`.

**Funções e RPCs**: `has_rh_access(uuid)` (`EXISTS(user_module_access WHERE module='rh') OR
is_supervisor_or_higher()`); `rh_link_employee_user(_employee_id, _email)`;
`rh_auto_link_on_profile()` (trigger em `profiles`); `rh_calc_inss` e `rh_calc_irpf` (percorrem os
brackets: primeira faixa com `salary >= min AND salary <= max` → `GREATEST(salary*rate − deduct,
0)`); `rh_generate_payroll` (§3.6); `create_rh_ticket_from_request` (§3.6);
`create_offboarding_ti_ticket` (§3.6).

> **Assimetria de RLS que importa**: as tabelas do portal do colaborador
> (`rh_employee_profiles`, `rh_vacation_requests`, `rh_medical_certificates`, `rh_payslips`,
> `rh_benefit_plans`, `rh_employee_benefits`, `rh_documents`) usam `has_rh_access()`; já **todas** as
> tabelas de folha, faltas e reembolsos exigem `is_supervisor_or_higher()`. Um analista de RH sem
> cargo de supervisor **não consegue abrir Folha, Faltas nem Reembolsos**, apesar de o menu mostrar
> os itens.

### 3.6 Fluxos

#### Solicitação de férias ou abono e aprovação
1. Colaborador abre `meu-rh` → aba Férias → "Nova solicitação" (`MeuRH.tsx:140,446`).
2. Escolhe tipo, início, fim e observações. A tela calcula dias corridos e bloqueia se `days < 1` ou,
   para férias, `days > saldo` (`:429-435`).
3. `useCreateVacationRequest` insere em `rh_vacation_requests` com `status` default `pendente`
   (`useMeuRH.ts:111-124`).
4. **Trigger `BEFORE INSERT` `create_rh_ticket_from_request`** dispara: mapeia o tipo para nome de
   categoria (`ferias`→"Solicitação de férias", `abono`→"Abono", `banco_horas`→"Banco de horas");
   monta título `Solicitação de {tipo} — DD/MM a DD/MM/YYYY` e descrição com tipo, período, dias e
   observações; busca a categoria em `ti_categories` com `module='rh'`; **insere um ticket**
   `module='rh'`, `priority='medium'`, `status='open'`, `created_by = requester_id = user_id`; grava
   `NEW.ticket_id` de volta na solicitação.
5. Toast "Solicitação enviada! O RH foi notificado." e invalidação das queries
   (`useMeuRH.ts:127-132`).
6. RH abre `rh/aprovacoes` → aba Férias e vê a solicitação pendente.
7. Aprovar ou Recusar → update de `status` e `decided_at` apenas (`RHAprovacoes.tsx:60`).
8. Colaborador vê o novo status (`MeuRH.tsx:408-410`); enquanto `pendente` pode **Cancelar**
   (`:411-415`).

> **Buracos**: nenhuma notificação real; `decided_by` e `decision_notes` ficam nulos; o saldo de
> férias não muda; e o chamado criado no passo 4 **não é atualizado nem fechado** com a decisão —
> fica aberto indefinidamente.

#### Envio e validação de atestado
1. Colaborador em `meu-rh` → aba Atestados → "Enviar atestado" (`MeuRH.tsx:164,526`).
2. Anexa PDF/JPG/PNG (5 MB, `:511-514`), informa data e dias e, opcionalmente, médico, CRM e CID.
3. `useUploadCertificate` sobe para `rh-documents` em
   `{tenant}/{user}/{ano}/atestados/{ts}.{ext}` (`useMeuRH.ts:187-193`) e insere em
   `rh_medical_certificates` com `status` default `recebido` (`:195-209`).
4. O **mesmo trigger** (ramo `ELSIF`) cria ticket de RH com título
   `Atestado médico — N dia(s) a partir de DD/MM/YYYY` e categoria "Atestado médico".
5. RH abre `rh/aprovacoes` → Atestados, clica "Ver arquivo" (signed URL de 60 s,
   `RHAprovacoes.tsx:156-159`) e confere.
6. Validar ou Rejeitar → update de `status` e `validated_at` (`:145`).
7. Colaborador vê o badge atualizado (`MeuRH.tsx:186-188`).

> **Buraco**: validar um atestado **não gera lançamento em `rh_absences`** — o RH precisa digitar a
> falta à mão em `rh/faltas`, num registro que não referencia o atestado.

#### Admissão com concessão de acessos
1. Abre-se um chamado no módulo `rh` com subcategoria "Admissão" (semeada por migration).
2. O gate `isAdmission` liga e o `AdmissionAccessEditor` aparece (`CreateTicketForm.tsx:68,310-314`).
3. Adiciona-se linha a linha: tipo de acesso, nome do sistema/e-mail/pasta/equipamento, observação.
4. No submit, o ticket é criado e, havendo grants com nome preenchido,
   `useBatchCreateAccessGrants` insere em `employee_access_grants` com `employee_id = user.id`,
   `ticket_id` do chamado e `granted_by = user.id` (`:174-184`).
5. Nada mais acontece — **não existe tela de RH que liste ou edite os acessos de um colaborador**; a
   leitura por `employee_id` (`useEmployeeAccessGrants.ts:38`) não tem nenhum chamador.

#### Desligamento / offboarding
1. Abre-se chamado no módulo `rh` com subcategoria começando por "Desligamento".
2. **Trigger `AFTER INSERT ON tickets` `create_offboarding_ti_ticket`**
   (`supabase/migrations/20260619134028_*.sql:51-140`):
   - Confere `module='rh'` e `subcategory ILIKE 'desligamento%'` (`:64`).
   - Resolve a categoria de destino em TI: "Conta AD" no módulo `tickets`, ou a primeira que comece
     com "Acesso" (`:69-80`).
   - Resolve o nome do colaborador em `profiles` pelo `requester_id` (`:83-85`).
   - Agrega em texto os grants ativos (`revoked_at IS NULL`) daquele colaborador, no formato
     `• [tipo] nome — nota` (`:88-101`); se não houver, escreve "(Nenhum acesso registrado na
     admissão — verifique manualmente com o RH.)" (`:103-105`).
   - **Cria o chamado espelho** no módulo `tickets`: título `Revogar acessos — {nome}`, prioridade
     `high`, status `open`, descrição citando o número do chamado de RH (`:108-125`).
   - Marca os grants ativos com `revoke_ticket_id = id do espelho` (`:128-132`), **sem revogá-los** —
     comentário no código (`:127`): "sem revogar ainda — quem fecha é o TI".
3. O TI abre o chamado espelho; `OffboardingAccessPanel` consulta por `revoke_ticket_id` e renderiza
   o checklist com contador.
4. Cada checkbox grava `revoked_at`/`revoked_by`; desmarcar reverte. O item fica riscado com check
   verde (`OffboardingAccessPanel.tsx:43-46`).
5. Nada fecha o chamado ao completar o checklist, e nada muda o `status` do colaborador em
   `rh_employee_profiles` para `desligado` — isso é feito à mão em `rh/colaboradores`
   (`RHColaboradores.tsx:238-240`).

> **Ponto crítico**: se a admissão registrou os grants no usuário errado (o que sempre acontece
> quando o RH abre em nome de terceiro), a lista chega vazia e o chamado de TI vem com a frase de
> fallback.

#### Folha de pagamento
1. RH abre `rh/folha` e escolhe mês e, opcionalmente, empresa (`RHFolha.tsx:86-87`).
2. Antes disso o mês precisa ter os lançamentos-base de VA, VT, Combustível e Descontos, feitos em
   `rh/reembolsos`.
3. Clica **"Gerar folha do mês"** → RPC `rh_generate_payroll(tenant, company, month)`.
4. A RPC (`supabase/migrations/20260612193521_*.sql:308-385`):
   - Exige `is_supervisor_or_higher(auth.uid())`, senão `RAISE EXCEPTION 'unauthorized'` (`:314`).
   - Carrega `rh_payroll_settings` da empresa, com fallback para a do tenant (`:316-321`).
   - Itera sobre `rh_employee_profiles` com `status='ativo'` e, se informada, `company_id`
     (`:323-328`). Para cada colaborador:
     `_gross = base_salary`; `_adv = ROUND(gross × advance_pct, 2)`;
     `_va = meal_vouchers.total − meal_vouchers.employee_share_20`;
     `_vt = transport_vouchers.to_deposit`; `_fuel = fuel_reimbursements.to_pay`;
     `_ded` = a linha de `rh_monthly_deductions` do mês;
     `_inss = rh_calc_inss(gross)`; `_irpf = rh_calc_irpf(gross − inss)` — **sem dedução por
     dependentes**;
     `_total_ded = adv + health_plan + health_coparticipation + payroll_loan + meal_voucher_discount
     + inss + irpf`; `_net = gross + family_allowance − total_ded`;
     `thirteenth_vacation = ROUND(gross × 1.333, 2)` e
     `irpf_thirteenth = rh_calc_irpf(gross×1.333 − rh_calc_inss(gross×1.333))` (`:363`).
   - `INSERT … ON CONFLICT (tenant_id, employee_id, reference_month) DO UPDATE` sobrescrevendo
     **todas** as colunas calculadas (`:365-381`).
   - Devolve a contagem processada, exibida como "Folha gerada para N colaborador(es)."
5. RH ajusta células à mão; cada `onBlur` atualiza o campo isolado, **sem recalcular**
   `total_deductions` nem `net_salary`.
6. Exporta CSV (`RHFolha.tsx:60-71`).

> **Armadilha documentada no próprio código** (`RHFolha.tsx:180-183`): rodar "Gerar folha do mês"
> outra vez **apaga todas as edições manuais** por conta do `DO UPDATE`. Só `other_deductions` e
> `notes` sobrevivem — não estão na lista do `DO UPDATE`.
>
> **Divergência de parâmetro**: `mobility` na folha recebe `_fuel` (o `to_pay` de combustível,
> `:362`), enquanto `rh_monthly_deductions.mobility` — o desconto de mobilidade lançado à mão — é
> **ignorado** pela RPC. As duas coisas colidem na mesma coluna.

#### Faltas (lado RH)
Abrir `rh/faltas` → escolher mês → "Lançar" → colaborador ativo, data, tipo, dias, horas,
justificada, motivo e observação → `useRHAbsences.upsert` grava em `rh_absences`. Os 4 KPIs
recalculam. Editar e remover por linha.
> **Sem ligação com a folha**: `rh_absences` **não é lida** por `rh_generate_payroll` — faltas não
> descontam nada.

#### VT, VA, Combustível e Descontos
Abrir `rh/beneficios` → aba "VT, VA, Combustível e Descontos" (ou a rota direta `rh/reembolsos`,
fora do menu) → escolher o mês → em cada aba, **"Replicar mês anterior"** (copia as linhas do mês
anterior trocando `reference_month`, com upsert por `(tenant, employee, mês)`) ou **"Lançar"** linha
a linha. Os diálogos calculam os totais em tempo real e gravam **os resultados já calculados** nas
colunas. Os percentuais de 20 % (VA) e 6 % (combustível) estão **hardcoded no front**, não vêm de
`rh_payroll_settings`. Esses valores viram insumo da RPC de folha.

#### Holerite
RH escolhe colaborador (de `profiles`), tipo, mês e PDF → upload para `rh-documents` mais insert em
`rh_payslips` (`RHHolerites.tsx:52-65`). O colaborador vê o item em `meu-rh` com badge "novo"
(`MeuRH.tsx:222`) e o contador de não lidos no KPI e na aba. Ao clicar "Baixar", abre por signed URL
de 60 s e dispara `useMarkPayslipViewed`, que só grava se `viewed_at IS NULL`, preservando a
primeira leitura. O RH vê "Visto em dd/MM HH:mm" ou "Não lido".

#### Documentos (cofre)
RH abre `rh/documentos` → "Arquivar" → colaborador, tipo, título, emissão, validade opcional e
arquivo (até 20 MB, PDF ou imagem) → upload em `{tenant}/{user}/{ano}/cofre/{tipo}-{ts}.{ext}` mais
insert em `rh_documents`. O banner e as badges de vencimento recalculam. Baixar usa signed URL de
60 s; remover apaga **storage e linha**. O colaborador vê o mesmo documento em `meu-rh`, só para
download.

### 3.7 O que está incompleto no RH

**Casca declarada**: aba "Acesso" de `RHConfiguracoes.tsx:421-438` — card com texto dizendo que
perfis granulares "entram em uma próxima fase". Zero funcionalidade.

**Indicadores que sempre mostram zero ou traço** (§3.3): Headcount ativo, Atestados no mês, Atrasos
no mês, Em aberto, Resolvidos, Encerrados, 1ª resposta média, VA/VT/Combustível pelo fallback, Top
combustível, coluna Atrasos do Top faltas e todas as setas de variação — todos em `DetailedRHTable`.

**Campos de banco que nenhuma tela escreve**: `decided_by`, `decision_notes`, `validated_by`,
`validation_notes`; `vacation_balance_days` e `last_vacation_end` (só leitura); `manager_user_id`,
`position`, `cost_center`; `rh_documents.version` e `.notes`; `rh_employee_benefits.status`,
`.end_date` e `.notes`; `rh_benefit_plans.is_active`; `rh_departments_catalog.sort_order` e
`.is_active`.

**Caminho de leitura sem chamador**: `useEmployeeAccessGrants({employeeId})` — nenhuma tela lista os
acessos de um colaborador; a única leitura viva é por `revoke_ticket_id`.

**Rota órfã do menu**: `rh/reembolsos`.

**Toasts que mentem**: "O RH foi notificado" e "O colaborador foi notificado"
(`useMeuRH.ts:128,213`, `RHAprovacoes.tsx:65`) — não há notificação nenhuma.

**Código morto**: `RHReembolsos.tsx:204` calcula um `total` que nunca é usado (o usado é
`totalCalc`, `:205`).

**Fluxo de reembolso com comprovante não existe** — o que há é uma planilha mensal preenchida pelo
RH (§3.1).
---

## 4. Módulo Qualidade / SAC

Dois sub-sistemas com autenticações diferentes:

- **Painel interno** (staff), sob `/t/:slug/qualidade/*`.
- **Portal do cliente** (consumidor final), sob `/sac/*`, com login próprio por OTP.

`StaffAwayFromSAC` (`src/components/auth/StaffAwayFromSAC.tsx:12-39`) redireciona qualquer
usuário staff logado (com `profile.tenant_id` e sem `customer_profile`) para
`/t/:slug/inicio` — o SAC público é exclusivo de clientes finais.

**Dois sistemas de chamado distintos convivem aqui**: `qualidade/chamados` usa a tabela
genérica `tickets` (chamados internos da equipe de Qualidade), enquanto o SAC de clientes usa
`sac_tickets`. São bases separadas.

### 4.1 Telas — painel interno

#### `QualidadeChamados` (`src/pages/qualidade/QualidadeChamados.tsx:1-5`)
Casca fina: renderiza `<TechnicianView module="qualidade" />`. Mesma fila genérica do helpdesk
(`useTicketQueue`/`useTicketHistory`, `src/hooks/useHelpdesk.ts:27,64,132,294,316`), com filas
todos / não atribuídos / meus / histórico e filtro de data. Kanban foi removido (comentário em
`src/components/helpdesk/TechnicianView.tsx:24`: "Kanban view removed — table-only helpdesk").

#### `QualidadeDashboard` (`src/pages/qualidade/QualidadeDashboard.tsx`)
Dashboard executivo **do SAC** (não do módulo de chamados). Busca direta em `sac_tickets`,
`sac_ticket_comments` e `sac_ticket_products` (`:66-99`), com seletor de período e comparação
contra o período anterior de mesma duração (`:74-87`). Quatro abas: Visão Geral, Produtividade,
Análise Detalhada e Padrões (IA).
A aba **Padrões (IA) é casca**: card estático dizendo que "está em preparação" (`:530-535`), sem
nenhuma lógica de detecção.

#### `QualidadeSettings` (`src/pages/qualidade/QualidadeSettings.tsx`)
Seis abas: **Link público** (compartilhar com QR Code, `:104-170`), **Produtos e Lotes**
(`ProductsCatalogTab`), **Categorias do SAC** (`sac_categories`, visíveis ao cliente),
**Categorias dos chamados** (internas, via `CategoryManager module="qualidade"`), **Campos do
formulário** (`sac_form_fields`) e **Equipe** — esta última **desativada**
(`TabsTrigger value="team" disabled`, `:64`), com texto informando que a gestão de equipe "foi
movida para Configurações → Usuários → Equipe · Qualidade" (`:72-75`).

#### `SACManagement` — `QualidadeSACList` e `QualidadeSACDetail`
- **`QualidadeSACList`** (`src/pages/qualidade/SACManagement.tsx:31-102`): tabela de todos os
  `sac_tickets`, filtro por status com contadores, coluna de produto com badge `+N` quando o
  chamado é multi-produto (regex sobre `subject`, `:75`).
- **`QualidadeSACDetail`** (`:104-403`): tela de atendimento — dados do ticket, lista de produtos
  reclamados (`ProductComplaintsList`), anexos do cliente (`AttachmentsList`), conversa com
  anexos e nota interna, resposta com sugestão de IA (edge function `ai-suggest-reply`), troca de
  status, e o **encerramento bloqueado** enquanto os laudos técnicos não estiverem completos
  (`disabled={!allReportsDone}`, `:356`; a mensagem de erro do banco é tratada em `:143-151`,
  indicando uma trigger/constraint no Postgres).

#### `TechnicalReport` — laudo técnico (`qualidade/sacs/:id/laudo`)
Formulário de laudo, **um por produto** quando o SAC é multi-produto (`sac_ticket_products`).
Campos: identificação (nº do laudo, data, cliente, contato), reclamação, tratativa, local do
teste, análise físico-química (pH, densidade, viscosidade, aspecto, cor, odor, especificação,
valores encontrados), evidências (upload), conclusão e responsável técnico assinante. Salva
rascunho ou conclui (`status: 'draft' | 'completed'`). Ao concluir, pula automaticamente para o
próximo laudo pendente ou volta ao SAC (`src/pages/qualidade/TechnicalReport.tsx:226-237`).
Inclui **layout de impressão dedicado** (`PrintLayout`, `:368-429`, via `print:block`) para gerar
o PDF do laudo assinado.

### 4.2 Telas — portal do cliente

#### `Gateway` (`src/pages/sac/Gateway.tsx`)
Landing do portal com branding do tenant (`useTenantBranding`) e dois CTAs — "Entrar" e "Criar
cadastro" — preservando `?tenant=` via `useSacTenantSlug`.

#### `OTPLogin` (`src/pages/sac/OTPLogin.tsx`)
Login sem senha por código de 6 dígitos (`InputOTP`). Fluxo: e-mail → edge function
`send-sac-otp` (`purpose: 'login'`) → tela de código → `verify-sac-otp` →
`supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`. Trata erros específicos:
`not_registered`, `rate_limited`, `blocked`, `expired`, `too_many_attempts`. Se `?email=` vier
na URL, envia o código automaticamente (`autoSent` ref, `:53-59`).

#### `Register` (`src/pages/sac/Register.tsx`)
Cadastro sem senha: formulário de identificação e endereço, com autocompletar por CEP via
`viacep.com.br` (`:165-180`) → `send-sac-otp` (`purpose: 'signup'`) → verificação →
`verify-sac-otp` (cria o `auth.user` no servidor) → `supabase.auth.verifyOtp` (login) → **insert
direto** em `customer_profiles` pelo próprio cliente autenticado (`:98-115`, exige RLS
`user_id = auth.uid()`, comentado em `:91`).

#### `PublicForm` — nova solicitação (`src/pages/sac/PublicForm.tsx`)
Abertura de chamado para cliente já autenticado (redireciona para `/sac/acesso` se não logado,
`:39-62`). Usa `MultiProductWizard` para reclamação **multi-produto**. Ao enviar, grava:
1 registro em `sac_tickets` (cabeçalho, com os dados do primeiro produto por compatibilidade
legada) + 1 registro em `sac_ticket_products` por item (fonte de verdade do multi-produto,
comentário em `:144`) + upload de anexos e nota fiscal para o bucket `sac-attachments`. Grava
**também** na tabela legada `sac_ticket_attachments` para cada anexo de produto (`:156-165`) —
duplicação intencional entre o jsonb `sac_ticket_products.attachments` e a tabela relacional.
Tela de sucesso mostra o protocolo `SAC-XXXXX`.

> Este formulário **não** chama a edge function `sac-public-submit` — insere direto pelo client
> Supabase autenticado, sob RLS. A edge function existe mas está desconectada do fluxo (§4.6).

#### `MyTickets` e `MyTicketDetail` (`src/pages/sac/MyTickets.tsx`)
- **`MyTickets`**: lista os chamados do cliente logado, com filtros (Todos / Em aberto /
  Aguardando você / Encerrados), contagem de **não lidas** por ticket (comentários de staff não
  internos posteriores a `customer_last_seen_at`, `:114-131`), realtime via `postgres_changes` no
  INSERT de `sac_ticket_comments` (`:161-170`), disparo do `SACOnboardingDialog` no primeiro
  acesso e do `RatingDialog` quando há ticket resolvido/encerrado sem avaliação (`:141-144`).
- **`MyTicketDetail`**: conversa do ticket ocultando comentários internos (`:326`), resposta do
  cliente com upload de anexos, realtime de comentário e de UPDATE do ticket, marcação de
  `customer_last_seen_at` a cada load (`:330`) e botão de avaliação quando encerrado sem nota.

#### `KnowledgeBase` (`src/pages/sac/KnowledgeBase.tsx`)
Lista e busca artigos da tabela `pops` filtrados por `audience = 'customer'` e `is_active = true`.
O detalhe renderiza conteúdo em blocos (`POPPreview`) ou markdown (`MarkdownPreview`).

### 4.3 Componentes

#### `src/components/qualidade/`

| Componente | O que faz |
|---|---|
| `DetailedSACTable.tsx` | Tabela consolidada da aba "Análise Detalhada". Filtro por chip de categoria (atendimento/prazos/clientes/produtos/equipe) persistido em `localStorage['sac-detailed-categories']` (`:73-89`). Renderiza 15 métricas com variação (`:96-138`), distribuição por prioridade, matriz categoria x status, produtos mais reclamados (com hover-list de tickets), lotes problemáticos com badge de surto, performance por atendente e lista colapsável de motivos de não-solução |
| `ProductsCatalogTab.tsx` | CRUD de produtos (`sac_products`) e lotes (`sac_product_batches`) do catálogo usado no formulário público. Upload de imagem com **redimensionamento client-side para 800x800** via `<canvas>` (`resizeTo800`, `:16-33`) antes de subir para `sac-attachments` |
| `SatisfactionBlock.tsx` | Bloco de satisfação embutido na Visão Geral (KPIs mais drawer de avaliações baixas). Fórmulas em §4.4 |
| `TicketHoverList.tsx` | Utilitário: envolve qualquer elemento em um `HoverCard` que lista até 25 tickets relacionados (produto, lote, cliente) com link para `qualidade/sacs/:id` |

#### `src/components/sac/`

| Componente | O que faz |
|---|---|
| `AttachmentsList.tsx` | Lista anexos de `sac_ticket_attachments`, gera signed URLs de 1 h do bucket `sac-attachments`, grid com thumbnail para imagens |
| `CommentAttachments.tsx` | Mesma lógica de signed URL, mas para os anexos embutidos (jsonb) de um comentário individual (`sac_ticket_comments.attachments`) |
| `InvoiceUploader.tsx` | Uploader que só acumula `File[]` local (não sobe direto), com limite configurável — padrão 5 arquivos de até 5 MB — usado para a nota fiscal no `PublicForm` |
| `MultiProductWizard.tsx` | Wizard passo a passo (um step por produto) para a reclamação multi-produto: seleção de produto/lote do catálogo ou "outro" livre, descrição individual com botão de melhoria por IA (`ImproveTextButton`), até 5 fotos por produto (máx. 5 MB cada, filtro client-side em `:180`) |
| `ProductComplaintsList.tsx` | Exibição read-only das reclamações por produto, com variante `customer`/`staff` (muda só o rótulo: "O que você relatou" x "Relato do cliente"), grid de anexos com thumbnail e signed URL |
| `RatingDialog.tsx` | Avaliação: nota de 1 a 5 estrelas, resolvido sim/parcial/não, e comentário **obrigatório** (mín. 5 caracteres) quando a nota é menor ou igual a 3 ou o resolvido é "não"/"parcial" (`:27`). Grava direto em `sac_tickets` (`satisfaction_rating`, `satisfaction_resolved`, `satisfaction_comment`, `satisfaction_rated_at`) |
| `SACOnboardingDialog.tsx` | Tour de 6 passos no primeiro acesso (boas-vindas, como abrir chamado, protocolo, notificação por e-mail, base de conhecimento, avaliação). "Visto" em `localStorage` (`sac_onboarding_seen_<uid>`) e, opcionalmente, em `customer_profiles.onboarded_at` quando `persistSeen=true` |

#### `src/components/settings/SACCustomersTab.tsx`
Usado em `src/pages/SystemSettings.tsx:362` (Configurações → Sistema), **não** em
`QualidadeSettings`. Gestão de `customer_profiles`: busca, editar dados, bloquear/desbloquear,
excluir (via edge function `sac-delete-customer`) e "reenviar acesso por e-mail".

### 4.4 Indicadores — fórmulas

Todas calculadas em `QualidadeDashboard.tsx` via `useMemo` sobre os tickets do período
(`sac_tickets` filtrados por `created_at >= periodStart(period)`).
Helpers: `pct(n, total) = round(n / total * 100)` (`:43`);
`variation(curr, prev) = prev === 0 ? (curr > 0 ? 100 : 0) : round((curr - prev) / prev * 100)`
(`:44-47`).

#### KPIs — Visão Geral (`src/pages/qualidade/QualidadeDashboard.tsx:107-117`)

| Indicador | Fórmula |
|---|---|
| `total` | `tickets.length` |
| `open` | Tickets com `status` em `{open, in_analysis, awaiting_customer}` |
| `resolved` | Tickets com `status` em `{resolved, closed}` |
| `rate` (taxa de resolução) | `pct(resolved, total)` |
| `avgResponse` (1ª resposta, h) | Média de `(first_response_at - created_at)` em horas, só tickets com `first_response_at` |
| `avgResolve` (resolução, h) | Média de `(resolved_at - created_at)` em horas, só tickets com `resolved_at` |

#### KPIs — Análise Detalhada (`:120-167`)

| Indicador | Fórmula |
|---|---|
| `avgResp` | Média de `(first_response_at - created_at)` em horas |
| `respUnder24` | `pct(#tickets com 1ª resposta <= 24 h, total com 1ª resposta)` |
| `avgRes` | Média de `(resolved_at - created_at)` em horas |
| `slaTotal` | Tickets com `sla_due_at` preenchido |
| `slaOk` | Tickets com `sla_due_at` **e** `resolved_at` **e** `resolved_at <= sla_due_at` |
| `slaPct` (SLA cumprido) | `pct(slaOk, slaTotal)` |
| `slaBreached` (SLA estourado) | Tickets com `sla_due_at` e: se há `resolved_at`, `resolved_at > sla_due_at`; senão, se o status não é `resolved/closed/cancelled/rejected`, `sla_due_at < agora` (`:134-140`). Comentário no código: "Marco final = resolved_at; chamados fora do relógio não acumulam atraso" |
| `avgClose` (tempo de encerramento) | Média de `(closed_at - resolved_at)` em horas, só tickets com ambos |
| `solved` / `partial` / `notSolved` | Contagem de `satisfaction_resolved` em `{yes, partial, no}` sobre o subconjunto com esse campo preenchido (`ratedSet`) |
| `reopened` (reaberturas) | Nº de tickets com pelo menos 1 comentário de `author_type='customer'` cujo `created_at > resolved_at` do próprio ticket (`:150-157`) |
| `selfServe` (auto-atendimento) | Tickets `resolved/closed` **sem** `first_response_at` — nunca tiveram resposta humana |
| `reopenRate` | `round(reopened / total * 100)` (`src/components/qualidade/DetailedSACTable.tsx:92-94`) |
| `selfRate` | `round(selfServe / total * 100)` (idem) |
| `solvedRate` | `round(solved / ratedTotal * 100)` (idem) |

**Variações vs. período anterior** (`:170-188`): mesma janela de dias imediatamente anterior
(`:74-87`); `variation()` aplicado a `total`, `resolved`, `avgResp` (arredondado antes),
`avgRes` (arredondado antes) e `sla`.

#### Rankings e agregações

| Indicador | Fórmula |
|---|---|
| `topClients` | Top 5 por `customer_name` (`:200-217`) |
| Top produtos | Conta ocorrências de `product_name`, somando o campo legado `ticket.product_name` **e** cada item de `sac_ticket_products.product_name`; top 8 (`:220-243`) |
| Lotes problemáticos / **surto** | Agrupa por `produto__lote` (campo legado `product_batch` mais os itens de `sac_ticket_products`); **surto = true** se existirem 3 ocorrências cujas datas cabem numa janela de até 7 dias corridos (janela deslizante sobre as datas ordenadas, `:270-274`); top 8 por contagem (`:246-277`) |
| Prioridade | Agrupa por `priority`, com tempo médio de resolução (`resolved_at - created_at`) por grupo (`:280-295`) |
| Tendência (área) | Por dia do período: `opened` = tickets com `created_at` naquele dia; `resolved` = tickets com `resolved_at` naquele dia (`:298-308`) |
| Atendentes / Produtividade | Por `assigned_to`: `total`, `resolved`, `avgFirst` (h), `avgResolve` (h), `slaBreached`, `staleOpen` (aberto há mais de 7 dias, `:328`), `ratePct = pct(resolved, total)`. `fastest` = top 8 por `resolved` desc (`:311-345`) |
| Não-solução | Até 10 tickets com `satisfaction_resolved` em `{no, partial}` (`:382-394`) |
| Por Prioridade (% do total) | `pct(p.value, detail.total)` (`DetailedSACTable.tsx:243`) |
| SACs por Categoria x Status | Matriz recomputada localmente a partir de `tickets`, ordenada por soma de status desc (`DetailedSACTable.tsx:142-148,276-297`) |

#### `SatisfactionBlock` (`src/components/qualidade/SatisfactionBlock.tsx:43-59`)

Fonte: `sac_tickets` com `satisfaction_rating` não nulo, filtrados por
`satisfaction_rated_at >= startDate` quando o período não é "todo o histórico".

| Indicador | Fórmula |
|---|---|
| `count` | Total de avaliações |
| `avg` | `round((Σ rating / count) * 10) / 10` — média com 1 casa decimal |
| `solved` (% solucionados) | `round(#resolved === 'yes' / count * 100)` |
| `low` | Contagem de `rating <= 2` |
| `nps` (NPS simplificado) | `round((promoters - detractors) / count * 100)`, com `promoters = rating >= 5` e `detractors = rating <= 3`. É uma adaptação da escala 1-5 (não a NPS clássica de 0-10): a nota 3, normalmente neutra, conta como detrator |

### 4.5 Tabelas do banco

| Tabela | Onde é usada | Papel |
|---|---|---|
| `sac_tickets` | Dashboard, `SACManagement`, `TechnicalReport`, `MyTickets`, `PublicForm`, `SatisfactionBlock`, `sac-public-submit` | Cabeçalho do chamado de SAC — status, prioridade, SLA, satisfação, produto legado (compatibilidade single-produto) |
| `sac_ticket_products` | `PublicForm`, `SACManagement`, `TechnicalReport`, `MyTicketDetail`, Dashboard | Itens de produto por chamado — fonte de verdade do multi-produto |
| `sac_ticket_comments` | `SACManagement`, `MyTickets`, Dashboard | Conversa staff/cliente, com `is_internal` e `attachments` (jsonb) |
| `sac_ticket_attachments` | `AttachmentsList`, `PublicForm`, `sac-public-submit` | Anexos relacionais do ticket, em paralelo ao jsonb de `sac_ticket_products` |
| `sac_categories` | `QualidadeSettings`, `PublicForm`, Dashboard | Categorias visíveis ao cliente no formulário público |
| `sac_form_fields` | `QualidadeSettings` | Campos customizados do formulário público — **sem consumidor** (ver §4.7) |
| `sac_products` | `ProductsCatalogTab`, `PublicForm` | Catálogo de produtos |
| `sac_product_batches` | `ProductsCatalogTab`, `PublicForm` | Lotes por produto |
| `sac_technical_reports` | `SACManagement`, `TechnicalReport` | Cabeçalho do laudo técnico (1 por produto) |
| `sac_report_products` | `TechnicalReport` | Análise físico-química vinculada a um laudo |
| `sac_otp_codes` | `send-sac-otp`, `verify-sac-otp` | Códigos OTP (hash SHA-256, expiração de 10 min, até 5 tentativas) |
| `customer_profiles` | `Register`, `PublicForm`, `MyTickets`, `SACOnboardingDialog`, `SACCustomersTab` e 4 edge functions | Perfil do cliente final (endereço, documento, bloqueio, onboarding) |
| `tenants` | `QualidadeSettings`, `Gateway`/`OTPLogin` (via `useTenantBranding`), `StaffAwayFromSAC`, `resolveSacTenant` | Identificação e branding do tenant no fluxo público |
| `profiles` | `SACManagement` (nome do autor da resposta), `sac-delete-customer` | Perfil staff |
| `user_roles` | `sac-delete-customer`, `sac-public-submit` | Papel do usuário (staff `owner/admin/manager` ou `customer`) |
| `pops` | `KnowledgeBase` | Artigos filtrados por `audience='customer'` |
| `tickets` | `QualidadeChamados` via `TechnicianView`/`useHelpdesk` | Chamados **internos** do departamento — tabela genérica, não é SAC |

Bucket de storage: **`sac-attachments`** — anexos de ticket, respostas, evidências de laudo,
notas fiscais e imagens de produto. Signed URLs de 1 h nos anexos e de 5 anos para imagem de
produto (`ProductsCatalogTab.tsx:88`).

### 4.6 Edge Functions do SAC

| Função | O que faz |
|---|---|
| `send-sac-otp` | Recebe `email` e `purpose` (`login`/`signup`), resolve o tenant no servidor (`resolveSacTenant` — por hostname próprio ou por `tenant_id`/`tenant_slug` validado no host padrão, sem fallback para "primeira empresa"). `login` exige cliente já cadastrado (`not_registered`); `signup` rejeita se já existe (`already_registered`); bloqueia `is_blocked=true`. Rate-limit de 60 s entre pedidos (`:110-117`). Gera código de 6 dígitos, grava o hash SHA-256 de `code:email` em `sac_otp_codes` com expiração de 10 min e envia e-mail por `_shared/email.ts` (ADR-003) com HTML da marca do tenant |
| `verify-sac-otp` | Valida expiração e tentativas (máx. 5; ao estourar marca como usado), confere o hash. Resolve/cria o usuário via RPC `get_auth_user_status` (comentário: "avoid GoTrue listUsers bug", `:93`); `login` exige `customer_profiles` do tenant, `signup` cria via `auth.admin.createUser` com e-mail confirmado. Gera `magiclink` por `auth.admin.generateLink` e devolve o `token_hash`, que o front troca em `supabase.auth.verifyOtp`. **É o mecanismo real de autenticação passwordless do cliente** |
| `sac-delete-customer` | Autenticada (Bearer do staff), exige role `owner/admin/manager` do **mesmo tenant** do cliente-alvo; apaga `customer_profiles` e o `auth.user` via `auth.admin.deleteUser`. Usada por `useDeleteSACCustomer` |
| `sac-check-customer` | Recebe `email` mais tenant e devolve `{ exists, blocked }` consultando `customer_profiles`. **Não é chamada por nenhum arquivo em `src/`** — a checagem equivalente é feita inline pelas outras duas funções |
| `sac-public-submit` | Endpoint sem JWT para submissão pública: cria/reaproveita `auth.user` e `customer_profiles` por e-mail (senha aleatória se não informada), insere `sac_tickets` e `sac_ticket_attachments`, valida anexos (`validateUploadMeta`) e o prefixo de path por tenant. **Não é chamada de nenhum lugar em `src/`** — o fluxo real usa OTP mais insert autenticado |

### 4.7 Hooks

- **`useSacTenantSlug`** (`src/hooks/useSacTenantSlug.ts:11-28`): lê `?tenant=` da URL; se
  presente, persiste em `localStorage['sac_tenant_slug']`; se ausente, devolve o último valor
  salvo — suporta reload sem perder o tenant no fluxo público whitelabel.
- **`useSACCustomers`** (`src/hooks/useSACCustomers.ts`): 5 hooks React Query sobre
  `customer_profiles` — listagem, `useUpdateSACCustomer`, `useToggleBlockSACCustomer` (seta
  `blocked_at`), `useResetSACCustomerPassword` e `useDeleteSACCustomer` (invoca a edge function).

`QualidadeDashboard` **não usa** `useReportMetrics` nem `useHelpdeskMetrics` — toda a lógica de
métricas do SAC está inline no componente. Não existe hook dedicado de métricas de SAC.

### 4.8 Fluxos

#### Cliente externo
1. **Acesso**: recebe o link `/sac/acesso?tenant=<slug>` (gerado em `QualidadeSettings` →
   ShareLinkTab, `:104-170`, com QR Code) e chega ao `Gateway`.
2. **Cadastro** (1ª vez): preenche os dados → `send-sac-otp(purpose=signup)` → código por e-mail
   → `verify-sac-otp` cria o `auth.user` → `auth.verifyOtp` loga → insert em `customer_profiles`
   pelo próprio cliente.
3. **Login** (demais vezes): e-mail → `send-sac-otp(purpose=login)` → código → `verify-sac-otp` →
   `auth.verifyOtp`.
4. **Onboarding**: no primeiro acesso a `/sac/meus-chamados`, `SACOnboardingDialog` roda o tour de
   6 passos (não bloqueante, com "Pular").
5. **Abertura de chamado**: `PublicForm` mais `MultiProductWizard` — um ou mais produtos, cada um
   com descrição e fotos próprias; dados da compra (data, nº do pedido, NF); categoria e resumo
   geral obrigatórios. Grava `sac_tickets`, N `sac_ticket_products` e os anexos. Devolve o
   protocolo `SAC-XXXXX`.
6. **Acompanhamento**: `MyTickets`/`MyTicketDetail` — filtros, badge de não lidas, realtime,
   conversa bidirecional (sem ver notas internas), `customer_last_seen_at` atualizado.
7. **Avaliação**: `RatingDialog` dispara automaticamente ao logar se houver chamado
   `resolved`/`closed` sem `satisfaction_rating`, ou manualmente pelo botão "Avaliar agora".

#### Staff de Qualidade
1. **Triagem**: `QualidadeSACList`, com filtro por status.
2. **Atendimento**: `QualidadeSACDetail` — responde (com sugestão de IA via `ai-suggest-reply`),
   anexa arquivos, marca nota interna, muda status.
3. **Laudo técnico obrigatório**: `TechnicalReport` — um laudo por produto; análise
   físico-química, conclusão e responsável técnico; rascunho ou conclusão; impressão/PDF.
4. **Encerramento condicionado**: o botão "Encerrar SAC" fica desabilitado até
   `completedReports >= max(productCount, 1)` (`SACManagement.tsx:356`), regra reforçada também no
   banco.
5. **Indicadores**: `QualidadeDashboard`, com a aba detalhada tabular (`DetailedSACTable`).
6. **Catálogo e config**: `QualidadeSettings` — produtos/lotes, categorias públicas e internas,
   campos do formulário, link de compartilhamento.
7. **Gestão de clientes SAC**: fora do módulo, em `SystemSettings` → `SACCustomersTab`.

Não há checklist de conformidade dedicado no módulo — o mecanismo de conformidade é o próprio
laudo técnico obrigatório por produto antes do encerramento.

### 4.9 O que está incompleto no Qualidade/SAC

| Item | Estado |
|---|---|
| Aba "Padrões (IA)" do dashboard | Casca — texto estático, sem lógica (`QualidadeDashboard.tsx:530-535`) |
| Aba "Equipe" de `QualidadeSettings` | Desativada, com texto de redirecionamento (`:64,72-75`) |
| `sac_form_fields` (campos customizados) | Gerido na tela de configuração, mas o `PublicForm` tem campos fixos no código e não consulta essa tabela — funcionalidade sem consumidor |
| `heatmap` (`:348-363`), `funnel` (`:366-378`), `productByCategory` (`:397-406`), `topCategories` (`:200-217`), `slowest` (`:311-345`) | Calculados em `useMemo` e **nunca renderizados** — código morto |
| `src/pages/sac/Login.tsx` | Login por e-mail/senha, **não importado em lugar nenhum** — substituído por `OTPLogin.tsx`, arquivo morto |
| `CustomerKnowledgeDetail` (`src/pages/sac/KnowledgeBase.tsx:65-95`) | **Sem rota registrada** — `App.tsx` define só `/sac/base-conhecimento`, sem `/:id`. O link do card (`:52`) aponta para uma rota inexistente |
| `sac-check-customer`, `sac-public-submit` | Edge functions **órfãs** — nenhum arquivo em `src/` as invoca |
| `useResetSACCustomerPassword` (`src/hooks/useSACCustomers.ts:72-83`) | Chama `auth.resetPasswordForEmail`, incompatível com o login OTP sem senha do cliente — resquício de um fluxo antigo |
| Trigger de "laudo obrigatório" no encerramento | Comportamento inferido pela mensagem de erro tratada no front (`SACManagement.tsx:143-151`); a regra vive no banco |
---

## 5. Módulo Marketing (MKT)

Rotas: `mkt/chamados`, `mkt/social`, `mkt/inventario`, `mkt/fornecedores`, `mkt/indicadores`,
`mkt/configuracoes`.

> **Leitura geral do módulo**: a camada de dados é bem mais ampla do que a interface expõe. Três
> famílias inteiras de hooks são órfãs (cotações, métricas agregadas de MKT e geração por IA), o
> botão de conexão OAuth com a Meta não é renderizado em nenhuma tela, e a publicação real de
> posts só acontece pelo worker de cron. Detalhes em §5.6.

### 5.1 Telas

#### `mkt/chamados` — fila de chamados de Marketing
`TechnicianView module="marketing"` (`src/routes/StaffAppRoutes.tsx:5,83`), o mesmo componente
genérico usado por TI (`:68`) e RH (`:98`). Nenhuma lógica específica de Marketing.

#### `mkt/social` — Cronograma Social (`src/pages/MKTSocialCalendar.tsx`)
**Mostra**: calendário mensal (`Calendar` do shadcn) mais grade semanal com os posts do dia
(`:327-372`), lista dos posts do dia selecionado em cards (`:383-449`) e filtros por plataforma e
status (`:304-319`).

**Permite**:
- **Criar post** pelo diálogo "Novo Post" (`:165-300`): título interno, plataforma
  (`SocialPlatform`, 8 valores em `src/types/mkt.ts:3-11`), tipo de post (`PostType`, 8 valores em
  `src/types/mkt.ts:13-21`), conta vinculada opcional (filtrada por plataforma, `:74-77`),
  conteúdo/legenda, mídia (upload para o bucket `mkt-media` **ou** link externo, `:95-114` e
  `:236-263`, limite de 5 MB em `MAX_IMAGE_BYTES`, `:31`), observação de estratégia interna
  (`:265-274`, visível só ao time), data/hora de agendamento e hashtags.
- Ao salvar, o post nasce com `status: 'scheduled'` se houver `scheduled_date`, senão `'draft'`
  (`:120-133`).
- **Marcar publicado manualmente** (`:409`) — chama `publishPost.mutate(post.id)`, que **apenas
  troca o status no banco**; não chama a Graph API (§5.5).
- **Excluir post** (confirm nativo, `:149-151`).

#### `mkt/fornecedores` — Fornecedores (`src/pages/MKTSuppliers.tsx:10-53`)
Página fina: `WorkOSPageHeader` mais botão "Novo Fornecedor", `SupplierTable` e `SupplierForm` em
modal. **Não há nenhuma menção a cotações nesta tela**, apesar de existir toda a camada de dados
de cotações (§5.4, §5.6).

#### `mkt/inventario` — Inventário de Marketing (`src/pages/MKTInventory.tsx`)
**Mostra**: chips de filtro por status com contadores (Todos, Ativo, Em uso, Em manutenção, Em
estoque — `:20-25`, `:138-149`) e tabela com Patrimônio / Item / Categoria / Localização / Status
(`:160-198`).

**Permite**: criar e editar item via modal (`:201-271`) com `asset_tag` obrigatório (formato
sugerido `MKT-2026-001`), nome obrigatório, categoria de uma lista fixa de 9 opções
("Equipamento de gravação", "Iluminação", "Áudio", "Computador/Notebook", "Câmera/Foto", "Brindes
e materiais promocionais", "Material gráfico", "Stand/Estrutura de evento", "Outros" — `:27-37`),
fabricante, modelo, número de série, localização, data de compra, valor em R$ e observações;
excluir item (confirm nativo, `:113-116`).

#### `mkt/indicadores` — Indicadores (`src/pages/MKTRelatorios.tsx`)
Reaproveita quase inteiramente o dashboard genérico de chamados (`useHelpdeskMetrics` filtrado por
`module: 'marketing'`, `:36,38`) e acrescenta **um único dado realmente de Marketing**: contagem
de posts agendados por plataforma (`:52-60`) mais um link para o Cronograma Social (`:168`).
Quatro abas: Visão Geral, Produtividade, Análise Detalhada e Padrões (IA) — as três últimas são
componentes genéricos de helpdesk (`TechnicianPerformanceChart`, `TopRequestersCard`,
`PatternsAnalysis`).

#### `mkt/configuracoes` — Configurações (`src/pages/MKTConfiguracoes.tsx:28`)
Tela única com `CategoryManager module="marketing" allowForms readOnly={!canEdit}` — o gerenciador
genérico de categorias, subcategorias e formulários por categoria, compartilhado com TI
(`src/components/ti/CategoryManager.tsx`). Permissão por `useDepartmentPermissions('marketing')`
(`:8`).

> Apesar do nome, **esta tela não tem nenhuma seção de contas sociais ou integração com a Meta**.
> Não existe UI em lugar nenhum do sistema para conectar Instagram ou Facebook (§5.5).

### 5.2 Componentes (`src/components/mkt/`)

| Componente | O que faz |
|---|---|
| `SupplierTable.tsx` | Tabela com Fornecedor (nome e CNPJ), Categoria (badge), Contato (nome/email/telefone), Avaliação em estrelas (`renderRating`, `:58-66`), Status (badge por `statusColors`, `:41-45`) e menu de ações. Exclusão via `AlertDialog` (`:194-207`) chamando `useDeleteMKTSupplier` (`:49`). Estado vazio com `EmptyState` (`:99-107`) |
| `SupplierForm.tsx` | `react-hook-form` mais `zod` (schema em `:33-43`): nome obrigatório, CNPJ, nome/email/telefone de contato (email validado), categoria (`MKTSupplierCategory`: grafica, producao, midia, eventos, brindes, digital, audiovisual, outro — `src/types/mkt-expanded.ts:4`), avaliação de 0 a 5 em passos de 0,5, status (active/inactive/blocked) e observações. Cria ou atualiza conforme `isEditing` (`:114-121`). **Sem nenhum campo ou seção de cotações** |
| `MetaConnectButton.tsx` | **Componente órfão** (§5.5). Chama a edge function `mkt-meta-oauth` com `action: 'get_auth_url'` (`:21-27`), abre popup centralizado de 600x700 (`:33-42`), faz polling a cada 500 ms tentando ler `popup.location.href` (`:45-75`), extrai `code`/`state`/`error` da URL de callback, troca o código por token com `action: 'exchange_code'` (`:90-113`), com timeout de 5 minutos (`:78-81`) |

### 5.3 Indicadores — fórmulas

Todos vêm de `useTicketMetrics` (`src/hooks/useHelpdeskMetrics.ts`) filtrado por
`module: 'marketing'` (`src/pages/MKTRelatorios.tsx:36`). **Nenhum é métrica de negócio de
Marketing** — não há CTR, engajamento, alcance nem custo de campanha em lugar nenhum do módulo.

| Card | Fórmula | Fonte |
|---|---|---|
| Chamados no período | `tickets.length` após filtrar `created_at` no período e `module = 'marketing'` | `useHelpdeskMetrics.ts:101` |
| SLA atendido (%) | `slaCompliance = total > 0 ? round((slaMetCount / total) * 100) : 0`. `slaMetCount` incrementa quando (a) o ticket tem `resolved_at` e `resolved_at <= sla_due_at`, ou (b) o ticket ainda não foi resolvido/fechado/cancelado/rejeitado (`slaRunning`) e `now <= sla_due_at` | `:159-170,190` |
| SLA violados | `slaViolated` incrementa quando `slaRunning && now > sla_due_at` — só chamados com o relógio ainda correndo; resolvidos e fechados ficam de fora | `:164,173-177` |
| Tempo médio de entrega (h) | `avgResolutionTime = round((Σ (resolved_at - created_at) em horas) / resolvedCount * 10) / 10`, só para tickets com `resolved_at` e `created_at` | `:182-186,191` |
| Evolução de chamados (área) | Série diária `{date, opened, resolved}`: `opened` conta por `created_at.split('T')[0]`, `resolved` por `resolved_at.split('T')[0]`; dias sem eventos entram zerados (grid completo do período) | `:200-256` |
| Por prioridade (barras) | Contagem simples por `priority`, com default `'medium'` quando nulo | `MKTRelatorios.tsx:44-46`; `useHelpdeskMetrics.ts:155-156` |
| Por categoria (barras, top 8) | Contagem por `category` (default `'Sem categoria'`), ordenada desc e cortada em 8 | `MKTRelatorios.tsx:48-50`; `useHelpdeskMetrics.ts:144-145` |
| Plataformas com mais posts agendados | Conta `SocialPost` com `status === 'scheduled'` agrupados por `SOCIAL_PLATFORM_LABELS[platform]`, ordenado desc, top 5 | `MKTRelatorios.tsx:42,52-60` |
| Cronograma social (card texto) | `scheduledPosts.length` | `MKTRelatorios.tsx:42,166-169` |

Métricas calculadas mas **não exibidas** em `MKTRelatorios` (`usePreviousMetrics` é chamado e seu
retorno descartado, `:39`): `slaViolationRate`, `avgOverdueTime`, `violatedByPriority`,
`violatedByCategory`, `open`, `inProgress`, `resolved`, `closed`, `byCategoryAndStatus`
(`useHelpdeskMetrics.ts:111-116,192-193`).

As métricas de `useMKTMetrics` (`src/hooks/useMKTMetrics.ts:4-11`) — `totalPosts`,
`scheduledPosts`, `publishedPosts`, `draftPosts`, `totalAssets`, `totalSuppliers` — **nunca
aparecem em tela nenhuma**: o hook é 100 % órfão.

### 5.4 Tabelas do banco

| Tabela | Onde é usada | Observações |
|---|---|---|
| `mkt_social_posts` | `src/hooks/useMKTSocialPosts.ts:26-153`, `MKTRelatorios.tsx:41` | Criada em `supabase/migrations/20260201151831_*.sql:75-93` (`title`, `content`, `platform`, `post_type`, `scheduled_at`, `published_at`, `status`, `media_urls[]`, `hashtags[]`, `event_id`, `influencer_id`, `notes`); `account_id`, `external_link` e `strategy_notes` em `20260616173936_*.sql:12-15`. **Tem** trigger `inject_tenant_mkt_social_posts` (`20260201151831_*.sql:136-138`). RLS: SELECT para membro do tenant, INSERT/UPDATE exige `member+`, DELETE exige `supervisor_or_higher` (`:200-216`) |
| `mkt_social_accounts` | `src/hooks/useMKTSocialAccounts.ts`, leitura em `MKTSocialCalendar.tsx:55` | `20260201192854_*.sql:210-223`. Coluna `is_connected` adicionada em `20260829014821_*.sql:44-45` e **ausente do type TS** `MKTSocialAccount` (`src/types/mkt-expanded.ts:173-186`) — drift entre schema e tipo. **Sem** trigger de tenant. RLS mais restrita: SELECT/INSERT/UPDATE exigem `is_supervisor_or_higher`, DELETE exige `is_admin_or_higher` (`:229-244`) |
| `mkt_social_account_secrets` | `mkt-meta-oauth:311-322,410-419`; leitura em `mkt-meta-publish:83-94` e `mkt-publish-due:172-176` | `20260829014821_*.sql:29-38`. Guarda o `access_token` fora de `mkt_social_accounts`, sem GRANT para `authenticated`/`anon` — só service role |
| `mkt_suppliers` | `src/hooks/useMKTSuppliers.ts`, `MKTSuppliers.tsx`, `SupplierTable`, `SupplierForm` | `20260201192854_*.sql:28-44`. **Sem** trigger de tenant (§5.6). RLS: SELECT tenant-wide, INSERT/UPDATE `member+`, DELETE `supervisor+` (`:50-65`) |
| `mkt_quotations` | Só `src/hooks/useMKTQuotations.ts` — **hook órfão** | `20260201192854_*.sql:75-93` (`supplier_id`, `event_id`, `title`, `items JSONB`, `total_value`, `status`, `approved_by/at`, `purchase_order_ref`, `valid_until`). **Sem** trigger de tenant |
| `mkt_assets` | `src/hooks/useMKTInventory.ts`, `MKTInventory.tsx` | `20260616173936_*.sql:18-41`; `asset_tag` único por tenant, reaproveita o enum `asset_status` do TI (valores `in_use`/`in_stock` adicionados em `:3-4`). **Sem** trigger de tenant, mas com GRANT para `authenticated` (`:43`) e trigger de auditoria `mkt_assets_audit` (`:68-70`) |
| `mkt_ai_generations` | Só `src/hooks/useMKTAICreative.ts` — **hook órfão** | `20260201192854_*.sql:176-188` (`type`, `prompt`, `result`, `model_used`, `post_id`, `event_id`, `accepted`). **Sem** trigger de tenant |
| `mkt_ugc_content` | Nenhum consumidor | Criada em `20260201192854_*.sql:124-145`, alterada em `20260519143323_*.sql:1-43` e **excluída** em `20260526192629_*.sql:27`. Os tipos TS `MKTUGC` e variantes (`src/types/mkt-expanded.ts:91-145`) continuam apontando para uma tabela que não existe mais |
| `mkt_events`, `mkt_influencers`, `mkt_event_participants`, `mkt_artists` | Referenciadas por join em `useMKTQuotations.ts:35` | `20260201151831_*.sql:12-72`; `mkt_artists` em `20260526192629_*.sql:217-250`. **Não há tela de Eventos nem de Influenciadores/Artistas** nas rotas de Marketing |
| Storage `mkt-media` | `MKTSocialCalendar.tsx:104-107` | `20260201192854_*.sql:254-273`; público para leitura, upload liberado a qualquer autenticado |

### 5.5 Fluxos

#### Cronograma social: criar, agendar, publicar
1. O usuário cria o post em `mkt/social` (`MKTSocialCalendar.tsx:116-147`), gravando em
   `mkt_social_posts` com `status: 'scheduled'` se houver data, senão `'draft'`.
2. **Publicação automática (a via real)**: o job `pg_cron` `mkt-publish-due-5min` roda a cada 5
   minutos (`supabase/migrations/20260519143027_*.sql:11-21`) e chama a edge function
   `mkt-publish-due` por `net.http_post`, sem JWT (`supabase/config.toml:26-27`,
   `verify_jwt = false`). A função busca posts `scheduled` com `scheduled_at <= now()`, até 50 por
   execução (`mkt-publish-due/index.ts:130-135`), acha uma conta ativa do mesmo tenant e
   plataforma (`:150-157`) e chama `publishToMeta` (`:33-119`): Instagram usa o fluxo de 2 passos
   (criar container de mídia e depois `media_publish`, exigindo ao menos 1 imagem, `:46-77`);
   Facebook posta foto (`/photos`) ou texto (`/feed`) conforme haja mídia (`:79-113`). Plataformas
   fora de Instagram e Facebook retornam `Unsupported platform` e o post vira `failed`
   (`:115,194-204`) — isso cobre TikTok, YouTube, LinkedIn, Twitter, WhatsApp e Meta Ads, todos
   presentes no enum mas sem publicação real.
3. **Botão "Marcar publicado"** (`MKTSocialCalendar.tsx:409` → `usePublishPost`,
   `src/hooks/useMKTSocialPosts.ts:134-152`): faz **apenas um UPDATE local**
   (`status: 'published'`, `published_at: now()`). Não chama edge function nem Graph API — marcar
   como publicado não publica nada.
4. A edge function `mkt-meta-publish` (invocação manual com JWT) faz a publicação real, duplicando
   a lógica do worker, mas **não é chamada de lugar nenhum do frontend**. Além disso, para
   plataformas não suportadas ela **não retorna erro**: nenhum branch é executado, `publishedId`
   fica `null` e o post é marcado como `published` mesmo assim (`mkt-meta-publish/index.ts:118-264`)
   — inconsistente com o worker.

#### Fornecedores e cotações
O fluxo de fornecedor (criar, editar, listar, excluir) está completo e ligado à UI (§5.2), sujeito
ao problema de `tenant_id` de §5.6. **Cotações não têm fluxo algum**: `useMKTQuotations.ts` traz 8
funções prontas (criar, listar por fornecedor, aprovar, listar aprovadas, atualizar, excluir) sobre
`mkt_quotations`, com join para `mkt_suppliers` e `mkt_events`, mas nenhuma tela as importa. Não
existe "Nova cotação" em lugar nenhum.

#### Integração de conta social (OAuth Meta) — backend pronto, sem porta de entrada
1. `MetaConnectButton` chamaria `mkt-meta-oauth` com `action: 'get_auth_url'`, que monta a URL de
   autorização do Facebook com escopos distintos por plataforma — Instagram:
   `instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement`; Facebook:
   `pages_show_list,pages_read_engagement,pages_manage_posts` (`mkt-meta-oauth/index.ts:151-153`) —
   protegida por `state` assinado com HMAC-SHA256 e TTL de 10 minutos (`:11-60`), com allowlist de
   `redirect_uri` restrita a `localhost`, `helpoint.com.br`, `www.helpoint.com.br` e domínios
   `*.vercel.app` (previews), apenas nos paths `/mkt/social` e `/mkt/configuracoes` (`:62-82`).
2. `exchange_code` troca o código por token de curta duração e depois por um de longa duração (60
   dias, `:219-243`); para Instagram, busca a Instagram Business Account vinculada à página
   (`:253-274`); salva a conta em `mkt_social_accounts` e o token em
   `mkt_social_account_secrets` (`:291-322`).
3. `refresh_token` renova o token longo (`:336-419`), mas o hook cliente que faria isso
   (`useRefreshSocialAccountToken`, `src/hooks/useMKTSocialAccounts.ts:169-190`) invoca uma edge
   function **inexistente**, `mkt-meta-refresh-token` — o correto seria `mkt-meta-oauth` com
   `action: 'refresh_token'`.
4. Como `MetaConnectButton` não é renderizado em lugar nenhum, **nenhuma conta social pode ser
   conectada pela interface**; a única forma de popular `mkt_social_accounts` é inserir no banco.

#### Geração de conteúdo por IA — camada pronta, sem UI
`useMKTAICreative.ts` cobre listar gerações (geral e por post), gerar conteúdo
(`useGenerateAIContent`, que invoca `mkt-ai-creative`), salvar e aceitar geração — e **nenhuma tela
usa nenhuma das 5 funções**. A edge function é rica: para texto (`caption`, `idea`, `reminder`) usa
a IA do próprio tenant via BYOK (`callTenantAI`, `mkt-ai-creative/index.ts:166-178`), com prompts
de sistema por tipo (`:76-131`); para imagem (`image`, `image-edit`) ainda usa um gateway externo
(`:181-237`), a trocar por OpenAI BYOK via `_shared/ai.ts` (ver `docs/decisoes.md`), tratando rate
limit (429) e créditos insuficientes (402).

### 5.6 O que está incompleto no Marketing

1. **Cotações**: schema e 8 hooks completos, **zero UI**. Fornecedor não tem aba de cotações.
2. **Geração de IA**: schema, 5 hooks e edge function completos, **zero UI**. O `ReferenceError`
   que este item registrava não existe mais: `mkt-ai-creative/index.ts:4` importa `callTenantAI` e
   `aiErrorResponse` de `../_shared/ai.ts` (conferido em 2026-09-04). O que falta é só a tela.
3. **`useMKTMetrics`**: hook completo, nunca usado — os indicadores reais vêm do módulo de chamados.
4. **UGC**: tipos TS inteiros apontando para `mkt_ugc_content`, tabela **excluída do banco** em
   migração posterior — código morto duplo.
5. **Conexão de conta social**: backend cuidadoso (CSRF, allowlist, refresh), mas
   `MetaConnectButton` **nunca é renderizado** — não há como conectar uma conta pela interface.
6. **Publicação real x botão manual**: "Marcar publicado" só troca o status; a publicação de fato
   só ocorre pelo cron de 5 em 5 minutos. É fácil confundir os dois.
7. **`tenant_id` não é preenchido em 5 tabelas**: `mkt_suppliers`, `mkt_quotations`,
   `mkt_ai_generations`, `mkt_social_accounts` e `mkt_assets` têm `tenant_id UUID NOT NULL` sem
   `DEFAULT` e sem trigger `BEFORE INSERT` de injeção (ao contrário de `mkt_social_posts`,
   `mkt_influencers` e `mkt_events`, que têm `inject_tenant_mkt_*` —
   `20260201151831_*.sql:124-138`). Nenhum dos hooks de criação envia `tenant_id`
   (`useMKTSuppliers.ts:76-98`, `useMKTQuotations.ts:109-130`, `useMKTSocialAccounts.ts:91-109`,
   `useMKTAICreative.ts:84-103`, `useMKTInventory.ts:65-73`). Isso atinge dois fluxos **ativos na
   UI**: criar fornecedor e criar item de inventário.
8. **`useRefreshSocialAccountToken`** chama uma edge function inexistente
   (`mkt-meta-refresh-token`).
9. Os indicadores de `mkt/indicadores` são 100 % reaproveitados do dashboard genérico de chamados —
   **não existe nenhuma métrica de negócio de Marketing** implementada no módulo.
---

## 6. Módulo Financeiro

Rotas: `financeiro/chamados`, `financeiro/chamados/:id`, `financeiro/compras`,
`financeiro/produtos`, `financeiro/compras/indicadores`, `financeiro/contas-a-pagar`,
`financeiro/contas-a-receber`, `financeiro/fluxo-de-caixa`, `financeiro/indicadores`,
`financeiro/configuracoes`.

### 6.1 Telas

#### `FinTickets` — chamados do financeiro (`financeiro/chamados`)
Renderiza `<TechnicianView module="financeiro" />` (`src/pages/financeiro/FinTickets.tsx:13`).
Reaproveita a fila genérica do helpdesk filtrada pelo módulo. **Casca fina**: nenhuma lógica
financeira própria. A inteligência de compra vive no `PurchasePanel`, que aparece dentro do
detalhe de um chamado individual.

#### `FinPayables` / `FinReceivables` — contas a pagar / a receber
Wrappers de 10 linhas que só passam `kind` para `FinEntriesPage`
(`src/pages/financeiro/FinPayables.tsx:1-10`, `src/pages/financeiro/FinReceivables.tsx:1-10`).
Toda a funcionalidade real está em `FinEntriesPage` (§6.2).

#### `FinCashFlow` — fluxo de caixa (`financeiro/fluxo-de-caixa`)
Entradas x saídas por mês, saldo do mês e saldo acumulado. Toggle **Projetado** (agrupa por
`competence`, o vencimento) x **Realizado** (agrupa por `settled_at`, a liquidação) e seletor
de 6/12/24 meses (`src/pages/financeiro/FinCashFlow.tsx:16-59`). `ComposedChart` do recharts:
barras de entradas/saídas mais linha de saldo acumulado, seguido de tabela detalhada por mês.
Somente leitura.

#### `FinIndicators` — indicadores financeiros (`financeiro/indicadores`)
KPIs de saldo, a pagar, a receber, inadimplência, prazo médio de pagamento e de recebimento,
cada um comparado ao período anterior; mais três listas: vence em 7 dias, já vencidos e
categorias de despesa fora do padrão. Fórmulas em §6.3.1.

#### `FinPurchaseIndicators` — indicadores de compras (`financeiro/compras/indicadores`)
KPIs de compras do ano corrente: total aprovado no mês, aguardando aprovação, tempo médio de
aprovação, produtos comprados no ano; gasto do mês por setor (com barra de progresso contra o
teto, se ativo); ranking de produtos e de fornecedores. Fórmulas em §6.3.2.

#### `FinProducts` — catálogo de produtos (`financeiro/produtos`)
CRUD dos produtos usados nas solicitações de compra: criar, editar, ativar/desativar (sem
exclusão física). Busca por nome/categoria e coluna "último fornecedor / último preço / última
compra" derivada de `usePurchaseHistoryByProduct` (`src/pages/financeiro/FinProducts.tsx:66-207`).
Diálogo com nome, categoria e descrição.

#### `FinPurchaseRequests` — solicitações de compra (`financeiro/compras`)
Lista todas as solicitações da empresa sem precisar abrir chamado por chamado. Abas de status
(Todas / Aguardando / Aprovadas / Reprovadas / Concluídas), filtro de período (30d/90d/ano),
filtro de setor e total estimado somado; clique na linha navega para o chamado
(`src/pages/financeiro/FinPurchaseRequests.tsx:43-192`). **Somente leitura e navegação** —
aprovar, reprovar e concluir acontecem no `PurchasePanel`, dentro do chamado.

#### `FinSettings` — configurações (`financeiro/configuracoes`)
Duas abas (`src/pages/financeiro/FinSettings.tsx:19-143`):
1. **Teto e importações** — `BudgetSettingsCard` mais tabela de importações com exclusão de lote.
2. **Categorias** — usa o `CategoryManager` genérico com `module="financeiro"`; só aparece se o
   usuário tiver `categories:view` no departamento financeiro.

### 6.2 Componentes (`src/components/financeiro/`)

| Componente | O que faz |
|---|---|
| `BudgetSettingsCard.tsx` | `Switch` liga/desliga o modo teto por setor (`fin_budget_settings.mode`: `none` ou `per_department`); quando ligado, um input de `monthly_limit` por setor (lista de `DEPARTMENT_LIST`/`DEPARTMENT_SCHEMAS`) com botão Salvar individual (`:13-76`). O teto **não bloqueia** aprovação — é alerta visual (`:41`) |
| `FinEntriesPage.tsx` | Página compartilhada por Pagar/Receber: 4 KPI cards, busca textual, filtro de situação, filtro de competência, botões "Importar planilha" e "Novo lançamento", tabela paginada, diálogos de criação/edição/importação e confirmação de exclusão (`:28-166`). "Liquidar" na linha grava `status:'paid'` e `settled_at: hoje` sem abrir diálogo (`:72-73`) |
| `FinEntriesTable.tsx` | Tabela paginada (25/página) com versão desktop em `<table>` e versão mobile em cards (`:13-156`). Colunas: descrição, contraparte (rótulo muda por `kind`: Fornecedor/Cliente), categoria, competência, vencimento, valor, situação (badge por `effectiveStatus`), ações. "Liquidar" só aparece quando o status efetivo não é paid nem cancelled |
| `FinEntryDialog.tsx` | Formulário de lançamento: descrição, contraparte, categoria, valor, documento, vencimento, data de liquidação, situação, forma de pagamento, centro de custo, observações (`:28-154`). Regras: `settled_at` preenchido força `status='paid'` (`:69`); `competence` é sempre recalculada de `due_date` via `competenceOf()` (`:72`), nunca digitada. Validação mínima: descrição, valor numérico e vencimento (`:58`, `:147`) |
| `FinImportDialog.tsx` | Importa `.xlsx/.xls/.csv` para `fin_entries` com dois "formatos" no combo (`generic`, `forteplus`) e prévia interativa de mapeamento de colunas (`:35-238`). Mostra linhas válidas/ignoradas, total e competências detectadas; bloqueia a confirmação se faltar campo obrigatório mapeado; avisa sem bloquear se a competência já foi importada, dizendo que a importação **soma** aos lançamentos existentes (`:156-167`); painel `<details>` "Conferir o mapa de colunas" para reatribuir manualmente; prévia das 8 primeiras linhas |
| `PurchasePanel.tsx` | Painel injetado no detalhe do chamado quando existe solicitação de compra (`usePurchaseRequestByTicket`). Mostra produto, link, setor, orçamentos selecionáveis (anexo por signed URL), alerta de teto ultrapassado, motivo de reprovação ou laudo mais nota fiscal (`:24-246`). Ações condicionadas a permissão (`useDepartmentPermissions('financeiro')`, escopos `purchases:approve`, `purchases:execute`/`payables:settle`) e ao status atual |
| `PurchaseRequestFields.tsx` | Bloco embutido no `CreateTicketForm` quando a categoria casa `/compra/i`. Busca/seleção de produto do catálogo (ou cadastro rápido), link do produto/fornecedor e exatamente 3 campos de orçamento (fornecedor, valor e anexo opcional) (`:47-225`). Produto com histórico sugere fornecedor e preço no primeiro orçamento vazio (`:60-70`) |

### 6.3 Indicadores — fórmulas

#### 6.3.1 `FinIndicators` (`src/pages/financeiro/FinIndicators.tsx:60-130`)

Período configurável: 30/90/180/365 dias, padrão 90. `start = hoje - span`, `end = hoje`;
período anterior = intervalo do mesmo tamanho imediatamente anterior (`prevEnd = start - 1 dia`,
`prevStart = prevEnd - span`).

| Indicador | Fórmula |
|---|---|
| Total a pagar / a receber no período | Soma de `amount` de lançamentos com `due_date` dentro de `[start, end]`, filtrando `kind` e excluindo `effectiveStatus === 'cancelled'` (`:73-79`) |
| Saldo realizado no período | `recebido - pago`, cada um sendo soma de `amount` de lançamentos com `status === 'paid'` **e** `settled_at` dentro de `[start, end]` (`:81-83`). Usa `status` puro, não `effectiveStatus` |
| Delta (% de variação) | `round(((atual - anterior) / anterior) * 100)`; `null` se não houver base anterior ou ela for zero (`:14-17`) |
| Inadimplência | `round(overdueReceivable / openReceivable * 100)`, onde `overdueReceivable` = soma de `amount` de recebíveis com `effectiveStatus === 'overdue'` e `openReceivable` = soma de recebíveis com `effectiveStatus` em `{overdue, pending}` (`:88-90`). Considera **toda a base**, não é filtrado por período. `openReceivable = 0` resulta em 0% |
| Prazo médio de pagamento / recebimento | `média(settled_at - due_date, em dias)` sobre lançamentos do período com `settled_at` preenchido, filtrados por `kind`, arredondado; negativo significa liquidado antes do vencimento (`:36-42`, `:92-93`) |
| Vence nos próximos 7 dias | `effectiveStatus === 'pending'` e `due_date` entre hoje e hoje+7, ordenado por vencimento (`:98-100`). Lista completa, não filtrada pelo período |
| Já vencidos em aberto | `effectiveStatus === 'overdue'`, todos, ordenados por vencimento (`:101-103`) |
| Gastos fora do padrão (spikes) | Agrupa despesas (`kind === 'payable'`, não canceladas) por categoria no período atual e no anterior; `change = (atual - anterior) / anterior` quando `anterior > 0`; entra na lista se `change >= 0.3` (`DEVIATION_THRESHOLD = 0.3`, `:28`), ordenado do maior desvio para o menor (`:105-124`) |

#### 6.3.2 `FinPurchaseIndicators` e `usePurchaseIndicators` (`src/hooks/usePurchases.ts:556-639`)

Janela de dados: ano corrente (`created_at >= 1º de janeiro`). "Aprovado/liquidado" significa
`status` em `{approved, completed}` (`:590`, variável `settled`).

| Indicador | Fórmula |
|---|---|
| `monthTotal` (aprovado no mês) | Soma de `estimated_amount` dos `settled` cuja data de referência (`approved_at` se existir, senão `created_at`) cai no mês corrente (`:588-602`) |
| `byDepartment` | Mesmo filtro de mês corrente, agrupado por `department` (`'Sem setor'` se nulo), ordenado por total decrescente (`:592-602`, `:629-630`) |
| `topProducts` | Todos os `settled` do ano agrupados por `product_name.trim()`, contando ocorrências e somando `estimated_amount`; **top 8 por contagem**, não por valor (`:609-613`, `:631-632`) |
| `suppliers` | Para cada `settled` com `approved_quote_id`, busca o orçamento em `fin_purchase_quotes` e agrupa por `supplier`, contando e somando o `amount` **do orçamento** (não o `estimated_amount` da solicitação); **top 8 por total** (`:615-619`, `:633-634`) |
| `avgApprovalHours` | `média(approved_at - created_at, em horas)` sobre `settled` que tenham `approved_at`; descarta negativos e não-finitos; `null` se não houver nenhum (`:606-607`, `:621-623`, `:635`) |
| `pendingApproval` | Contagem de `status === 'pending_approval'` no ano (`:636`) |
| Gasto x teto por setor | Só exibido se `fin_budget_settings.mode === 'per_department'`: `pct = min(100, (gastoDoMes / teto) * 100)`; `over = gasto > teto` dispara aviso vermelho, **sem bloquear** (`src/pages/financeiro/FinPurchaseIndicators.tsx:56-94`) |
| `useDepartmentMonthlySpend` (checagem de teto na aprovação) | Soma de `estimated_amount` de solicitações `{approved, completed}` do setor com `approved_at >= 1º dia do mês corrente` (`src/hooks/usePurchases.ts:469-487`). **Diverge** de `usePurchaseIndicators`: aqui não há fallback para `created_at` |

#### 6.3.3 `FinCashFlow` (`src/pages/financeiro/FinCashFlow.tsx:18-64`)

| Indicador | Fórmula |
|---|---|
| Chave do mês | Projetado agrupa por `entry.competence` (YYYY-MM); Realizado agrupa por `entry.settled_at` (YYYY-MM) considerando só `effectiveStatus === 'paid'` (`:18-22`, `:36`) |
| Entradas do mês | Soma de `amount` dos `kind === 'receivable'` do bucket; cancelados sempre excluídos (`:33-43`) |
| Saídas do mês | Soma de `amount` dos `kind === 'payable'` do bucket |
| Saldo do mês | `entradas - saídas` |
| Saldo acumulado | Soma corrida (`running`) do saldo mês a mês, do mais antigo ao mais recente, **dentro da janela** de 6/12/24 meses — o `slice(-limit)` é aplicado antes do acumulado (`:45-58`) |
| Cards "Entradas/Saídas no período" | Soma simples de todos os meses exibidos (`:61-64`) |
| Card "Saldo acumulado" | Valor do `acumulado` do **último mês** da série, não a soma dos saldos mensais (`:117-119`) |

#### 6.3.4 KPIs de `FinEntriesPage` (`src/components/financeiro/FinEntriesPage.tsx:57-70`)

Calculados sobre a lista **já filtrada** (busca, situação e competência):

| KPI | Fórmula |
|---|---|
| Em aberto | Soma de `amount` onde `effectiveStatus` está em `{pending, overdue}` |
| Já pago / recebido | Soma de `amount` onde `effectiveStatus === 'paid'` |
| Vencido em aberto | Soma de `amount` onde `effectiveStatus === 'overdue'` |
| Vence em até 7 dias | Soma de `amount` onde `effectiveStatus === 'pending'` e `due_date` entre hoje e hoje+7 |

#### 6.3.5 `effectiveStatus` — regra central (`src/types/financeiro.ts:92-96`)

```
effectiveStatus(entry) = entry.status !== 'pending'
  ? entry.status
  : (entry.due_date < hoje ? 'overdue' : 'pending')
```

"Atrasado" **não é status persistido** para lançamento manual — é derivado em runtime de
`pending` mais vencimento passado. Na importação, `parseStatus`
(`src/lib/finance-import.ts:137-144`) grava `overdue` diretamente, então o dado persistido pode
já vir marcado; `effectiveStatus` cobre os dois casos.

### 6.4 Tabelas do banco

| Tabela | Onde é usada | Colunas principais |
|---|---|---|
| `fin_entries` | `src/hooks/useFinanceiro.ts:18,58,75,88,154,170` | `id, tenant_id, kind(payable/receivable), description, category, counterparty, document_number, amount numeric(14,2), due_date, settled_at, status(pending/paid/overdue/cancelled), payment_method, cost_center, competence, source, import_id -> fin_imports, external_id, notes, created_by, created_at, updated_at`. RLS por `tenant_id = get_user_tenant_id()` nas 4 operações. Índices `(tenant,kind,due_date)`, `(tenant,competence)`, `(tenant,status)`. Trigger de auditoria `fin_entries_audit` |
| `fin_imports` | `useFinanceiro.ts:34,117,172` | `id, tenant_id, kind, file_name, format, competence, row_count, total_amount, imported_by, created_at, updated_at` |
| `fin_purchase_products` | `src/hooks/usePurchases.ts:39,58,84` | `id, tenant_id, name, description, category, created_by, is_active (default true), created_at, updated_at`. DELETE restrito a `is_manager_or_higher` |
| `fin_purchase_requests` | `usePurchases.ts:117,172,195,217,306,340,371,478,510,565` | `id, tenant_id, ticket_id UNIQUE -> tickets, product_id, product_name, product_link, department, estimated_amount, status(pending_approval/approved/rejected/completed) com CHECK, approved_quote_id, approved_by, approved_at, rejection_reason, rejected_by, rejected_at, purchase_report, purchase_file_path, executed_by, executed_at, created_by, timestamps`. DELETE restrito a manager ou acima |
| `fin_purchase_quotes` | `usePurchases.ts:131,179,260,579` | `id, tenant_id, request_id -> fin_purchase_requests (CASCADE), supplier, amount NOT NULL, link, file_path, notes, position, timestamps` |
| `fin_budget_settings` | `usePurchases.ts:408,425` | `tenant_id PK, mode(none/per_department) com CHECK, timestamps`. Escrita restrita a manager ou acima |
| `fin_department_budgets` | `usePurchases.ts:443,456` | `id, tenant_id, department, monthly_limit, UNIQUE(tenant_id, department)`. Escrita restrita a manager ou acima |
| `tickets` | `usePurchases.ts:320,352,384` | Efeito colateral do fluxo de compra: `status`, `resolution_notes`, `resolved_at`, `closed_at` |
| `ticket_comments` | `usePurchases.ts:291-297` | Comentário interno de sistema a cada aprovação, reprovação ou conclusão |
| Storage `fin-purchases` | `usePurchases.ts:14,19,25,242,369` | Path `{tenant_id}/{ticket_id}/{timestamp}-{nome}`; RLS por pasta igual a tenant. Extensões permitidas: `jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt,zip`. Leitura por signed URL de 10 min (`getPurchaseFileUrl`, `:24-28`) |

Migrations de referência: `supabase/migrations/20260826231707_*.sql`, `20260826232708_*.sql`,
`20260826232736_*.sql`, `20260827140516_*.sql`, `20260829153842_*.sql`.

### 6.5 Fluxos

#### Lançamento financeiro manual
1. "Novo lançamento" ou o ícone de editar na tabela abre `FinEntryDialog`
   (`src/components/financeiro/FinEntriesPage.tsx:135-138,143`).
2. Preenche descrição, contraparte, categoria, valor, documento e vencimento e, opcionalmente,
   liquidação, situação, forma de pagamento, centro de custo e observações.
3. Ao salvar: `competence` é recalculada de `due_date`; `settled_at` preenchido força
   `status='paid'` (`FinEntryDialog.tsx:69,72`).
4. `useCreateFinEntry`/`useUpdateFinEntry` gravam em `fin_entries` com `tenant_id` e `created_by`
   injetados na criação (`src/hooks/useFinanceiro.ts:56-64`).
5. "Liquidar" na linha: `update({status:'paid', settled_at: hoje})` (`FinEntriesPage.tsx:72-73`).
6. Exclusão passa por `AlertDialog` e remove definitivamente (`useFinanceiro.ts:83-94`).
7. Toda mutação invalida `fin-entries` e `fin-imports` (`useFinanceiro.ts:43-49`).

#### Importação de planilha (`FinImportDialog` mais `src/lib/finance-import.ts`)
1. Usuário escolhe o formato (`generic` ou `forteplus`) e sobe `.xlsx/.xls/.csv`.
2. `readSheet()` lê a primeira planilha via `XLSX.utils.sheet_to_json` com `header:1`, gerando
   matriz bruta (`finance-import.ts:174-180`).
3. `detectHeaderRow()` varre as primeiras 25 linhas procurando a que tem pelo menos 2 campos
   reconhecidos por alias **e** contém a coluna de valor (`:150-160`).
4. `autoMap()` casa cada cabeçalho normalizado (sem acento, minúsculo) contra `ALIASES` — match
   exato primeiro, depois `includes` (`:43-55`, `:162-172`).
5. Por linha: `description` (com fallback para `counterparty`), `amount` (aceita `R$ 1.234,56`,
   `1234.56` e parênteses como negativo) e `due_date` (aceita serial do Excel, `dd/mm/aaaa`,
   `aaaa-mm-dd`) são obrigatórios. Linha sem nenhum dos três é descartada como
   rodapé/totalização; faltando só um, vira erro listado (`:198-241`).
6. `status` é inferido: texto com "cancel" vira `cancelled`; pago/quitado/liquidado/recebido/
   baixado vira `paid`; senão, `settled_at` preenchido vira `paid`; senão `due_date < hoje` vira
   `overdue`, caso contrário `pending` (`:137-144`).
7. `competence` é `due_date` truncado para o 1º dia do mês (`:223`).
8. O diálogo mostra prévia de 8 linhas, contagem de erros, mapa de colunas editável e alerta de
   competência já importada — **nunca bloqueia reimportação**, apenas avisa que vai somar.
9. Confirmar dispara `useImportFinEntries`: cria 1 registro em `fin_imports` (competência = a
   primeira ordenada, contagem de linhas, soma total) e insere os lançamentos em lotes de até 400
   (`useFinanceiro.ts:112-157`).
10. Excluir uma importação apaga todos os `fin_entries` daquele `import_id` e depois o registro de
    `fin_imports` (`useFinanceiro.ts:165-177`); é irreversível e avisado em `AlertDialog`.

#### Solicitação de compra, aprovação e execução
1. **Criação**: no `CreateTicketForm`, com `module === 'financeiro'` e categoria/subcategoria
   casando `/compra/i` (`src/components/helpdesk/CreateTicketForm.tsx:65-66`), o formulário injeta
   `PurchaseRequestFields` (`:303-306`). O `department` vem de `user.user_metadata.department`
   (`:166`) — o solicitante não escolhe.
2. Ao submeter, cria o ticket normal; se for compra, chama `useCreatePurchaseRequest`
   (`src/hooks/usePurchases.ts:205-271`): `estimated_amount` inicial é o **menor valor entre os
   orçamentos válidos** (`Math.min`, `:214`); insere a solicitação com `status='pending_approval'`;
   sobe cada anexo para `fin-purchases` e insere as linhas em `fin_purchase_quotes`.
3. **Acompanhamento**: `PurchasePanel` no detalhe do chamado lista os orçamentos. Quem tem
   `purchases:approve` seleciona um e clica "Aprovar orçamento escolhido".
4. `useApprovePurchase` (`:301-333`): grava `status='approved'`, `approved_quote_id`,
   `approved_by`, `approved_at` e **sobrescreve `estimated_amount` com o valor do orçamento
   aprovado**; move o ticket para `in_progress`; grava comentário interno de sistema.
5. **Reprovar** exige motivo obrigatório (`AlertDialog` com input) e chama `useRejectPurchase`
   (`:335-361`): `status='rejected'`, `rejection_reason`, `rejected_by/at`; o ticket vai para
   `rejected` com `resolution_notes`; comenta no chamado.
6. **Execução** (status `approved`, permissão `purchases:execute` ou `payables:settle`): digita o
   laudo (fornecedor final, valor, prazo, nota fiscal), anexa a NF opcionalmente e clica "Concluir
   compra e encerrar chamado", chamando `useCompletePurchase` (`:363-398`): sobe o anexo, grava
   `status='completed'`, `purchase_report`, `purchase_file_path`, `executed_by/at`; fecha o ticket
   (`closed`, `resolved_at`, `closed_at`, `resolution_notes` igual ao laudo); comenta no chamado.
7. **Checagem de teto** (não bloqueante): antes de aprovar, o painel compara
   `spend + quoteAmount > limit` usando `useDepartmentMonthlySpend` contra
   `fin_department_budgets.monthly_limit`, só quando o modo é `per_department`. Se ultrapassar,
   mostra alerta âmbar e o botão Aprovar continua habilitado (`PurchasePanel.tsx:46-49,158-166`).

#### Contas a pagar / a receber
Mesma `FinEntriesPage` parametrizada por `kind`: lançamento manual mais importação, com os KPIs
de §6.3.4 filtrados por `kind`. **Não há conciliação bancária** (matching linha a linha contra o
extrato) — a importação apenas adiciona lançamentos.

#### Fluxo de caixa
Somente leitura, derivado inteiramente em memória a partir de `useFinEntries()` (todos os
lançamentos do tenant, sem filtro de `kind`). Não há tabela nem view SQL de fluxo de caixa, nem
persistência de "orçado x realizado".

#### Orçamento (teto de gasto)
Configurado em `FinSettings` via `BudgetSettingsCard`. Os únicos consumidores do teto são o alerta
não bloqueante do `PurchasePanel` e a barra de progresso de `FinPurchaseIndicators`. Não há teto
para contas a pagar genéricas — o orçamento é exclusivo do fluxo de compras.

### 6.6 O que está incompleto no Financeiro

- **`FinTickets`, `FinPayables` e `FinReceivables`** são cascas finas (10 a 13 linhas) sobre
  componentes compartilhados.
- **Formato de importação "Forteplus"** (`FinImportDialog.tsx:19`) é apenas um rótulo selecionável,
  gravado em `fin_imports.format`. Não existe dicionário de alias nem regra de parsing exclusiva: o
  comentário em `src/lib/finance-import.ts:8-9` promete "dicionários de sinônimos" por formato, mas
  há um único `ALIASES` genérico (`:43-55`) usado para todos. **A feature é decorativa.**
- **Conciliação bancária não existe.** O único controle contra duplicidade é o aviso (não bloqueio)
  de competência já importada.
- **`validatePurchaseFields`** (`PurchaseRequestFields.tsx:29-40`) diz na UI "três orçamentos
  obrigatórios" mas valida `filled.length < 3`, ou seja, um mínimo de 3 — como o formulário só
  oferece 3 linhas, na prática coincide.
- **`department` da solicitação** vem de `user_metadata.department` sem tela de seleção ou edição
  (`CreateTicketForm.tsx:166`); metadado vazio joga a solicitação em "Sem setor" nos indicadores
  (`usePurchases.ts:599`).
- **Saldo acumulado do `FinCashFlow`** é o acumulado dentro da janela selecionada (6/12/24 meses),
  não o histórico total — pode ser lido erroneamente como "caixa da empresa".
- **Sem paginação no backend para indicadores**: `useFinEntries()` sem `kind` traz **toda** a tabela
  `fin_entries` do tenant de uma vez, sem `.limit` (`useFinanceiro.ts:11-25`), para calcular
  indicadores e fluxo de caixa no cliente (`FinIndicators.tsx:57`, `FinCashFlow.tsx:25`). Não escala.
---

## 7. Linguagem visual

Esta seção descreve o
sistema de design, os padrões de layout e as convenções.

### 7.1 Sistema de design (`src/index.css`, `tailwind.config.ts`)

O cabeçalho do arquivo nomeia a intenção: "HELPOINT — Monday-inspired light design system"
(`src/index.css:7-9`). Só existe tema claro — **não há bloco de dark mode** em nenhum dos dois
arquivos.

#### Tipografia
- Fontes carregadas do Google Fonts em `src/index.css:1`: **Figtree** (400, 500, 600, 700, 800) e
  **JetBrains Mono** (400, 500, 600).
- `--font-sans: 'Figtree', system-ui, -apple-system, sans-serif`; `--font-mono: 'JetBrains Mono',
  monospace` (`:123-124`). No Tailwind, `sans` e `display` apontam para Figtree e `mono` para
  JetBrains Mono (`tailwind.config.ts:15-19`).
- `body`: 16 px, `line-height: 1.5`, antialiased (`src/index.css:151-157`).
- Títulos `h1`-`h6`: Figtree, `font-weight: 700`, `letter-spacing: -0.015em`, cor
  `--foreground-bright` (`:159-164`).
- **Dado numérico e identificador usam a face mono**: `.font-mono, code, kbd, samp` recebem
  `font-variant-numeric: tabular-nums` (`:202-208`) — números de colunas alinham verticalmente.
- Tamanho extra `label`: `0.6875rem` / `1rem` (`tailwind.config.ts:20-22`); `letterSpacing`
  extras `tighter: -0.04em` e `micro: 0.04em` (`:23-26`).

#### Cores (todas em HSL, como triplas sem `hsl()`)

| Papel | Token | Valor | Nota |
|---|---|---|---|
| Fundo da página | `--background` | `228 33% 97%` | canvas claro `#f6f7fb` (`:13`) |
| Texto | `--foreground` | `240 4% 21%` | (`:14`) |
| Texto forte (títulos) | `--foreground-bright` | `240 6% 14%` | (`:15`) |
| Cartão / superfície | `--card` | `0 0% 100%` | branco puro (`:19`) |
| Primária (marca) | `--primary` | `212 87% 46%` | azul `#0F6FDE`, AA com texto branco (`:26`) |
| Destaque | `--accent` | `212 87% 46%` | mesmo azul, para foco e realce (`:30`) |
| Secundária / muted | `--secondary`, `--muted` | `225 25% 96%` | (`:33,36`) |
| Texto muted | `--muted-foreground` | `231 8% 44%` | (`:37`) |
| Destrutiva | `--destructive` | `0 57% 41%` | (`:39`) |
| Borda | `--border` | `222 22% 92%` | ultrafina `#e6e9ef` (`:43`) |
| Borda sutil | `--border-subtle` | `222 22% 95%` | (`:44`) |
| Input | `--input` | `222 22% 90%` | (`:45`) |
| Anel de foco | `--ring` | `212 87% 46%` | (`:46`) |

**Paleta Monday (sólidos)** (`:50-57`): `--monday-green 159 100% 39%`,
`--monday-yellow 33 98% 62%` (com `--monday-yellow-fg 30 100% 13%` para texto legível sobre o
amarelo, contraste acima de 4.5:1), `--monday-red 352 72% 58%`, `--monday-purple 272 63% 61%`,
`--monday-orange 25 95% 58%`.

**Status semânticos, sempre com texto branco** (`:59-64`): `--status-success 156 81% 23%`
(`#0B6B45`), `--status-warning 34 87% 31%` (`#92580A`), `--status-danger 0 57% 41%` (`#A32D2D`),
`--status-info 212 87% 35%`, `--status-muted 231 8% 44%`.

**Badges — a regra é explícita no código**: "SEMPRE par fundo claro + texto escuro (>= 4.5:1)"
(`:66`). Sete pares definidos em `:67-80`: success, warning, danger, info, purple, orange e
neutral, cada um com `-bg` claro e `-text` escuro.

**Prioridade** (`:82-87`): `critical 352 72% 58%`, `high 25 95% 58%`, `medium 33 98% 62%`,
`low 159 100% 39%`, `none 231 8% 55%`.

**Níveis de superfície** (`:89-93`): `--surface-0` e `--surface-1` brancos, `--surface-2` igual ao
fundo da página, `--surface-3` igual à borda.

**Site público de marketing** tem superfícies próprias, com comentário dizendo para **não
reutilizar os tokens do painel** (`:95-98`): `--site-surface-1/2/3`.

**Fundos pastel de KPI** (`:100-107`): `--kpi-yellow-bg`, `-green-`, `-red-`, `-blue-`, `-grey-`,
`-purple-`, `-orange-`.

**Sidebar** (`:109-115`): fundo branco, mesmo azul da marca como `--sidebar-primary`.
**Gráficos** (`:117-120`): `--chart-primary` azul da marca, `--chart-secondary` roxo,
`--chart-danger` vermelho.

#### Raio, sombra, espaçamento e transição
- `--radius: 0.5rem` (`src/index.css:48`). No Tailwind: `lg: 8px`, `md: 6px`, `sm: 4px`,
  `DEFAULT: 6px` (`tailwind.config.ts:107-112`).
- Sombras (`tailwind.config.ts:117-124`): `xs` `0 1px 2px rgba(0,0,0,0.04)`, `card`
  `0 1px 3px rgba(0,0,0,0.06)`, `card-hover` `0 4px 12px rgba(0,0,0,0.08)`, `elevated`
  `0 8px 20px rgba(0,0,0,0.1)`, `panel` `0 1px 3px rgba(0,0,0,0.04)`, `monday`
  `0 4px 8px rgba(0,0,0,0.06)`.
- Espaçamentos extras: `18: 4.5rem`, `88: 22rem` (`tailwind.config.ts:113-116`).
- Transições (`src/index.css:126-129`): `--transition-fast: 120ms`, `--transition-default: 150ms`,
  `--transition-slow: 200ms`.
- **Padding de página responsivo por token**: `--page-padding: 1rem`, virando `1.5rem` acima de
  1024 px (`:131-139`).
- `container` do Tailwind: centralizado, sem padding, `2xl: 100%` (`tailwind.config.ts:7-13`) — ou
  seja, largura total, sem coluna máxima.

#### Acessibilidade e comportamento global
- Toda borda herda `hsl(var(--border))` por padrão (`src/index.css:141-145`).
- **Foco de teclado nunca é removido**: `:focus-visible` recebe `outline: 2px solid hsl(var(--ring))`
  com `outline-offset: 2px` (`:190-195`), e dentro de `aside` usa `--sidebar-ring` (`:197-199`).
- Scrollbars finas customizadas, 8 px, thumb `hsl(215 20% 80%)` (`:167-188`).
- `prefers-reduced-motion` zera animações, transições e `scroll-behavior` (`:210-219`).
- Bloco `@media print` (`:510-517`): A4 com margem de 12 mm, esconde tudo por `visibility` e
  revela só `.print\:block` — é o mecanismo usado pelo laudo técnico do SAC.

#### Classes de componente (camada `@layer components`)

| Classe | Definição |
|---|---|
| `.panel` | `--card` de fundo, borda de 1 px, raio 8 px, sombra dupla `0 1px 2px / 0 2px 8px` em `hsl(228 20% 40%)` com 6 % e 4 % (`:224-229`) |
| `.panel-header` | `px-4 py-3`, flex com `justify-between`, borda inferior (`:231-234`) |
| `.status-dot` | Ponto de 8 px arredondado com `mr-2` (`:242-244`); variantes `-info`, `-warning`, `-purple`, `-orange`, `-success`, `-neutral`, `-danger` usam **o mesmo matiz escuro dos badges**, declarado como fonte única de cor (`:246-253`) |
| `.mono` | Família mono, `text-xs`, `tracking-tight` (`:257-260`) |
| `.badge-*` | Sete pares fundo claro / texto escuro, com AA garantido (`:263-269`) |
| `.priority-*` | `critical` reusa o par danger, `high` o orange, `medium` o warning, `low` o success (`:273-276`) |
| `.divider` | Faixa de 1 px de largura total na cor da borda (`:279-282`) |
| `.focus-mode-overlay` | Overlay fixo `inset-0 z-50` com fundo a 98 % de opacidade (`:285-288`) |
| `.lyra-pulse` | Animação `lyra-pulse` de 2 s (opacidade 1→0.85, escala 1→1.05) para o avatar da IA (`:294-299`) |
| `.sidebar-item-hover:hover` | Fundo `--muted` (`:306-308`) |
| `.sector-number` | Mono, 11 px, opacidade 60 %, cor muted (`:312-316`) |
| `.progress-ruler` | Borda de 1 px, fundo muted, raio 6 px (`:319-323`) |

#### Sistema de tabela WorkOS em CSS (`:325-377`)

| Classe | Definição |
|---|---|
| `.workos-row` | `grid` com `items-center`, cursor de ponteiro, borda inferior, fundo `--card`, transição de fundo em `--transition-default` (`:329-335`) |
| `.workos-row:hover` | `hsl(209 100% 97%)` — azul quase branco (`:337-339`) |
| `.workos-row-selected` | `hsl(209 100% 95%)` com `!important` (`:341-343`) |
| `.workos-group-header` | Flex, `gap-3 px-4 py-2`, selecionável desabilitado, **texto branco** em peso 700 e 14 px, com `filter: brightness(1.08)` no hover (`:345-356`) |
| `.workos-status-cell` | `px-2.5 py-1`, semibold, centralizado, 12 px, raio 6 px, `min-width: 100px` (`:358-363`) |
| `.workos-priority-cell` | Igual, porém `rounded-full` e `min-width: 80px` (`:365-369`) |
| `.workos-table-header` | Grid de altura `h-9`, `px-4`, 13 px, fundo `--card`, **borda inferior de 2 px** e cor muted (`:371-377`) |

#### Tiles de KPI (`:386-411`)
`.kpi-tile`: flex com `justify-between`, raio `lg`, `p-4`, transição de 150 ms, borda de 1 px e
**altura mínima de 88 px** (`:390-394`); no hover a borda vira `--accent` a 50 % (`:396-398`).
`.kpi-tile-number`: Figtree, **32 px**, peso 800, `line-height: 1`, `letter-spacing: -0.02em`
(`:400-406`). `.kpi-tile-label`: `text-xs`, semibold, `mt-1` (`:408-411`).

#### Utilitários (`@layer utilities`, `:416-508`)
`bg-surface-1/2/3`; `bg-status-*` e `text-status-*`; `bg-priority-*`; `bg-monday-*`; **`text-monday-*`
resolve para a variante escura do matiz** para garantir AA sobre fundo claro (`:448-453`);
`text-on-yellow`, `text-on-green`, `text-on-orange` para texto sobre os matizes vivos (`:455-459`);
`bg-kpi-*` pastel; `bg-site-1/2/3` do site público; `.anchor-offset` com `scroll-margin-top: 80px`
para compensar a navbar sticky (`:475-476`); `.workos-hover` e `.workos-hover-highlight`;
`.text-foreground-bright`; `.font-display`.

`src/App.css:1` tem **uma única linha**, um comentário (`/* Helpoint — App-level overrides
(minimal) */`), sem nenhuma regra — o boilerplate do Vite já foi removido.

### 7.2 Padrões de layout

#### Casca da aplicação (`src/components/layout/AppLayout.tsx:83-144`)
Sidebar fixa à esquerda (`AppSidebar`) mais coluna à direita com header **sticky de 56 px**
(`h-[56px]`, `:92-94`) contendo breadcrumb à esquerda, busca global no centro (`:127-130`) e sino
de notificação à direita (`:134-136`). Abaixo de 1024 px (`useIsBelow(1024)`, `:33`) a sidebar vira
gaveta com botão hambúrguer (`:96-105`).
O breadcrumb é derivado da rota por `getBreadcrumb()` (`src/components/layout/AppSidebar.tsx:134-176`)
e pode ser sobrescrito pelo "leaf" das telas de detalhe (`#nº — assunto`) via `BreadcrumbContext`
(`AppLayout.tsx:60-66`).
O branding do tenant (cor, logo, fonte) é aplicado como CSS vars a cada troca de tenant, buscado
direto do Supabase dentro do próprio layout (`:38-57`).

#### Sidebar (`src/components/layout/AppSidebar.tsx`, 670 linhas)
**Não usa** o primitivo shadcn `ui/sidebar.tsx` — é componente próprio do zero. Estrutura:
logo/tenant (`:359-437`) → botão de ação primária "Nova solicitação" (`:439-454`) → busca que
filtra o menu em tempo real, insensível a acento e caixa (`:291-304`, `:469-487`) → grupos
colapsáveis por módulo (`:490-583`) → rodapé com avatar e menu do usuário (`:585-641`).

Os módulos são grupos fixos no código: TI (`:32-41`), Marketing (`:43-50`), Qualidade (`:52-57`),
RH (`:59-70`), Financeiro (`:72-82`), Configurações (`:84-88`) e Início (`:90-97`), com
visibilidade controlada por `useVisibleModules()` (`:207`). **O sistema trata os cinco
departamentos como um menu homogêneo** — cada um tem fila de chamados, indicadores e configurações.

O estado de colapso (248 px ↔ 64 px) e o último grupo aberto persistem em `localStorage`
(`COLLAPSE_KEY`/`OPEN_GROUP_KEY`, `:195-196`, `:250-260`, `:279-289`). Badge numérico de pendências
existe hoje só para "Compras" do Financeiro (`itemBadge`, `:332-338`).

#### Busca global (`src/components/layout/GlobalSearch.tsx`, 192 linhas)
Atalho `Ctrl/Cmd+K` (`:36-44`), debounce de 250 ms (`:46-49`), mínimo de 2 caracteres (`:54`).
Consulta 4 tabelas em paralelo com `Promise.all` — `tickets`, `profiles`, `assets`, `pops`
(`:63-81`) — cada uma limitada a 5-6 resultados, com título, hint secundário e rota de destino por
bucket (`:126-131`). Usa `CommandDialog`/`CommandInput`/`CommandGroup` do shadcn (`:4-6`).

#### Sino de notificações (`src/components/layout/NotificationBell.tsx`, 169 linhas)
`Drawer` lateral direito (Vaul) de 380 px (`:88`), com badge vermelho de contagem que vira "9+"
acima de 9 (`:81-85`). Cada tipo de notificação tem ícone e cor próprios em dois mapas paralelos —
`TYPE_ICONS` (`:17-30`) e `TYPE_STATUS` → `STATUS_ACCENT` (`:32-52`) — que pintam uma borda
esquerda de 2 px. Timestamp relativo com `formatDistanceToNow(date, { addSuffix: true, locale: ptBR })`
(`:143-146`). Tem estado vazio próprio, não usa o `EmptyState` compartilhado (`:159-163`).

#### `PageHeader` — o cabeçalho único (`src/components/layout/PageHeader.tsx`)
O JSDoc do próprio arquivo (`:27-31`) diz: *"Cabeçalho único do sistema. **Substitui
`WorkOSPageHeader` e `DashboardHeader`**: h1 de 20px, identificador, badge de status e ações à
direita. O breadcrumb é renderizado pelo `AppLayout`."*
Props (`:7-25`): `title`, `description`, `icon`, `identifier`, `status`, `actions`, `onBack`,
`sticky` e `children` — este último é o slot para filtros e seletor de período abaixo do título
(`:85`). **As telas usam este cabeçalho; `WorkOSPageHeader` é o anterior.**

#### Três páginas representativas
- **`src/pages/Dashboard.tsx`** (52 linhas) é só um roteador de dois estados: `DailyCuration`
  (curadoria diária) ou `FocusMode` (modo foco), sem `PageHeader` nem WorkOS (`:36-51`). O
  "dashboard" do sistema é uma tela de produtividade pessoal, não um painel de KPIs.
- **`src/pages/Inventory.tsx`** (223 linhas) mostra o padrão "lista → detalhe → formulário" no mesmo
  componente, com o modo vivendo na URL via `useQueryState<ViewMode>` (`:26,40`):
  `WorkOSContainer` > `WorkOSPageHeader` (com `action` = botão "Novo Ativo") > KPIs
  (`InventoryKPIs`) > chips de filtro de status feitos à mão (`:148-165`, não um componente
  reutilizável) > `AssetTable` dentro de um card com borda. Exclusão confirmada por `AlertDialog`
  (`:205-220`).
- **`src/components/helpdesk/TechnicianView.tsx`** (222 linhas) é a tela mais densa: resumo de IA no
  topo (`AISecretarySummary`, `:108-114`) → grade de 5 KPIs (`KPIGrid`/`KPICard`, `:117-125`) →
  abas de filtro feitas com `button` simples, não com `Tabs` do shadcn (Todos / Não Atribuídos /
  Meus / Histórico, `:128-152`) → `WorkOSTable` agrupada por prioridade → rodapé fixo com
  contadores em fonte mono (`:196-211`).

### 7.3 Sistema WorkOS (tabela e lista)

Composição em camadas, toda em `src/components/workos/`:

```
WorkOSContainer                    (fundo da página, 18 linhas)
 +- WorkOSPageHeader  [DEPRECATED] (encapsula PageHeader, 24 linhas)
 +- WorkOSTable                    (orquestra grupos e paginação, 331 linhas)
     +- WorkOSTableHeader          (cabeçalho de grid, 32 linhas)
     +- WorkOSGroup x N            (seção colapsável por bucket, 116 linhas)
     |   +- WorkOSTableRow x N     (a linha, 198 linhas)
     |       +- StatusCell         (badge de status, 23 linhas)
     |       +- PriorityCell       (badge de prioridade, 28 linhas)
     +- EmptyState / Skeleton      (vazio / carregando)
```

- **`WorkOSPageHeader.tsx:13`** carrega `@deprecated` explícito: *"Use `PageHeader` diretamente —
  este componente apenas o encapsula"*; só repassa `icon/title/description/action` (`:14-23`).
  **Tela nova usa `PageHeader`, não `WorkOSPageHeader`.**
- **`WorkOSTable.tsx`** é o núcleo: paginação client-side de 50 registros (`PAGE_SIZE = 50`,
  `:14,50-60`); dois modos de agrupamento — `groupBy="priority"` (crítico, alta, média, baixa,
  `:67-73`) e `groupBy="time"` (atrasados, hoje, esta semana, anteriores, com `isToday`,
  `isThisWeek` e `isBefore` do `date-fns`, `:76-96`) — mais o modo `"none"`. Só o **primeiro** grupo
  com itens abre por padrão (`firstFilledKey`, `:98-104`). Abaixo de 768 px cada linha vira cartão
  empilhado (`isMobile`, `:47,174`; `WorkOSTableRow.tsx:57-81` renderiza `CardContent` em vez de
  `RowContent` de `:85-185`). Densidade compacta ou confortável por `useTableDensity`
  (`:46,185-197`). Dois estados vazios distintos — com filtro ativo e sem filtro nenhum
  (`:141-160`), ambos usando o `EmptyState` compartilhado.
- **`WorkOSGroup.tsx`** calcula as próprias estatísticas a partir dos tickets recebidos (`stats`,
  `:28-34`): total, em andamento, resolvidos, SLA violado e sem atribuição. O header do grupo mostra
  contagem, badge de SLA violado, badge de "sem atribuição" e uma barra de progresso
  resolvidos/total (`:73-105`) — a mesma métrica aparece como número e como barra, nunca de duas
  fontes diferentes.
- **`WorkOSTableRow.tsx`** define o próprio grid pela prop `gridCols`: 6 colunas (`#`, título,
  status, prioridade, responsável, SLA) ou 3 no modo `simplified`. Botão "Atribuir" inline quando
  não há responsável (`:159-169`, via `useTicketActions().assignToMe`). Alerta de SLA só quando o
  relógio ainda corre (`slaAlert = sla.isOverdue && !sla.isFrozen`, `:54-55`). Menu de contexto
  (botão direito) envolvendo a linha inteira por `TicketContextMenu` (`:194-196`), desligado no modo
  `simplified`.
- **`WorkOSCard`** e derivados (`WorkOSCard.tsx`, 62 linhas): composição no estilo do `Card` do
  shadcn, mas com classes próprias (`bg-surface-1`, `border-border-subtle`).
- **`WorkOSStatsCard.tsx`** (58 linhas): cartão de KPI com ícone colorido por `color`
  (`default/success/warning/danger/info`, mapa em `:13-19`), valor em mono 2xl e indicador de
  tendência opcional com seta e percentual (`:43-55`).
- **`StatusCell`/`PriorityCell`**: wrappers finos de uma `div`, com a classe de badge resolvida por
  fonte única — `StatusCell` delega para `getTicketStatusMeta()` (`src/config/ticket-status.ts:76-78`,
  mapa completo em `:25-74`); `PriorityCell` tem mapa inline (`PriorityCell.tsx:4-9`: crítico =
  `badge-danger`, alta = `badge-orange`, média = `badge-warning`, baixa = `badge-success`).

### 7.4 Componentes UI compartilhados (`src/components/ui/`, 50 arquivos)

#### Customizados de verdade

| Arquivo | Linhas | O que tem de próprio |
|---|---|---|
| `empty-state.tsx` | 43 | Não é shadcn — ícone circular, título, descrição e ação opcional. O JSDoc (`:15-18`) diz: *"Usado em todas as listas — nunca apenas um ícone esmaecido."* |
| `markdown-renderer.tsx` | 125 | Não é shadcn — parser de markdown escrito à mão, sem biblioteca: `**bold**`, `*itálico*`, `#/##/###`, listas `-` e `1.` (`:37-125`). Usado onde a IA gera texto formatado |
| `VoiceRecorderBar.tsx` | 159 | Não é shadcn — barra de gravação de voz com waveform animado (`WaveformBars`, `:24-44`), preview de áudio e três estados (`idle`/`recording`/`recorded`, `:70-73`) |
| `button.tsx` | 54 | shadcn como base, com **variantes extras** `industrial`, `success`, `warning`, `danger`, `focus` (`:18-22`) e **tamanhos extras** `xl`, `icon-sm`, `icon-lg` (`:27-31`). Tipografia menor que a do shadcn: `text-[13px]` e altura padrão `h-8` em vez de `h-10` |
| `badge.tsx` | 28 | shadcn como base, com as cores trocadas para os tokens do projeto (`bg-primary/10`, `bg-surface-2`); as variantes seguem as 4 do shadcn |

#### shadcn padrão, sem customização relevante
`accordion, alert-dialog, alert, aspect-ratio, avatar, breadcrumb, calendar, card, carousel,
checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card,
input-otp, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group,
resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs,
textarea, toast, toaster, toggle-group, toggle, tooltip, use-toast.ts`.

#### Scaffold shadcn presente mas **morto**
- `ui/sidebar.tsx` (637 linhas) — nenhum arquivo o importa; `AppSidebar.tsx` é reimplementação
  independente.
- `ui/chart.tsx` (303 linhas) — wrapper de Recharts que nenhum arquivo importa; os gráficos usam
  Recharts direto.

### 7.5 Convenções

#### Badges de status e prioridade
Fonte única em `src/config/ticket-status.ts:25-74` (`TICKET_STATUS_META`): cada status carrega
`label`, `icon` (lucide), `badgeClass` **e** `dotClass` do mesmo matiz, para que badge e ponto
compacto tenham leitura idêntica (comentário em `:21-24`). Prioridade tem mapa próprio inline em
`PriorityCell.tsx:4-9`, sem arquivo de config compartilhado e sem equivalente de dot.

#### Formatação de datas
Padrão dominante (94 ocorrências de `date-fns`/`toLocaleDateString` em `src/components|hooks|pages`):
`import { format, formatDistanceToNow } from 'date-fns'` com `import { ptBR } from 'date-fns/locale'`.
- `formatDistanceToNow(date, { addSuffix: true, locale: ptBR })` —
  `src/components/layout/NotificationBell.tsx:12-13,143-146`.
- `format(date, "dd/MM/yy HH:mm")` e `"dd/MM/yyyy"` —
  `src/components/dashboard/IndicatorsView.tsx:485,489,520,548,579`.
- Exceções pontuais que usam `toLocaleDateString('pt-BR', …)` direto, sem `date-fns`:
  `src/components/helpdesk/AssetSelector.tsx:172` e
  `src/components/helpdesk/TicketConversation.tsx:116`.

#### Valores nulos e vazios
A convenção é o **travessão `'—'`** com `||` ou ternário — **nunca "N/A"** (zero ocorrências de
`'N/A'` em `src/components|pages`). Exemplos:
`src/components/access/AccessProfilesHub.tsx:49` (`{p.description || '—'}`) e
`src/components/dashboard/IndicatorsView.tsx:431-435,485,489,518,520,577,579`.

Em dados **acionáveis** a regra muda: em `WorkOSTableRow.tsx`, sem responsável não aparece traço e
sim um **botão "Atribuir"** (`:159-169`); sem SLA aparece o texto explícito "Sem SLA" ou "Sem prazo
definido" (`:53,179`). Nunca um traço sozinho onde o vazio precisa ser nomeado.
