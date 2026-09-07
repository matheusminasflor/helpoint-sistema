# O que existe no código e não funciona

Leitura obrigatória antes de "consertar" ou "completar" qualquer coisa. Estes
itens estão no repositório, mas não são alcançáveis ou não fazem o que o nome
diz. Arquivo existir não é prova de funcionalidade. As referências `§` apontam
para `docs/inventario-sistema.md`.

A maior parte do que está aqui veio da **revisão de sistema de 2026-09-04**:
cinco auditorias em paralelo (TI, RH, Qualidade/SAC, Financeiro e a camada
transversal), cada uma verificando os achados contra o código e o banco reais
antes de reportar. Marketing ficou de fora por decisão do dono do projeto.
O que foi corrigido desde então está **riscado**, com a data.

---

## Buracos de segurança

Isto vem primeiro porque é o que muda a ordem das prioridades de quem chega.
**Nada disso está exposto em produção** — o `helpoint-producao` estava vazio em
2026-09-04 (0 tabelas, 0 usuários, 0 edge functions). Tudo abaixo é do
`test-helpoint`, que guarda o **piloto importado do Lovable**, não uma cópia da
operação: em 2026-09-06 eram 10 usuários, 2 tenants, 14 chamados (o último de
24/06/2026), 2 SACs e **zero** lançamentos financeiros. Ninguém usa o sistema
hoje — nem aqui, nem em produção. Isso é fato de planejamento, não detalhe:
não existe dado sobre onde as pessoas travam, e nenhuma correção produz esse
dado. Só uso produz.

| O quê | Onde | Efeito | Estado |
|---|---|---|---|
| ~~Conta criada por qualquer um, com senha escolhida por quem chama~~ | `sac-public-submit/index.ts:80`, estava no ar com `verify_jwt=false` | Um estranho virava dono da conta de um cliente que ainda não se cadastrou | **Fechado em 2026-09-06.** Deploy apagado **e** pasta removida — `functions deploy` sem argumento sobe todas as pastas, então deixar o código no repositório reabriria o buraco no próximo deploy completo |
| ~~Enumeração de e-mails por tenant~~ | `sac-check-customer`, idem `verify_jwt=false` | Descobrir quem é cliente de qual empresa | **Fechado em 2026-09-06**, do mesmo jeito |
| Cliente troca o próprio `tenant_id` | policy `Customers can update their own profile` em `customer_profiles`: `USING (user_id = auth.uid())` e `WITH CHECK` **nulo** — o Postgres então usa o `USING`, que continua verdadeiro depois da troca | Passa a ler produtos, lotes, categorias e POPs de outra empresa, e a abrir SAC nela. IDs de tenant são públicos via `get_sac_tenant_branding(slug)` | **Aberto.** Precisa de trigger que congele `tenant_id`, `email`, `is_blocked` |
| Colaborador aprova as próprias férias | policy `Colaborador cancela sua própria solicitação pendente`: o `WITH CHECK` não fixa o status de destino | `PATCH {"status":"aprovada"}` na própria linha passa | **Fechado no teste em 2026-09-06** — migration `20260905020100` |
| Colaborador altera o próprio holerite | policy `Colaborador marca holerite como visto` sem restrição de coluna | Troca `file_path`, `type` e `reference_month` | **Fechado no teste em 2026-09-06** — migration `20260905020100` |
| Qualquer usuário do tenant lê o razão | `StaffRoute` não checa módulo nem cargo; RLS das 7 tabelas `fin_*` era só `tenant_id` | `/t/<slug>/financeiro/contas-a-pagar` abre a contabilidade da empresa | **Fechado no teste em 2026-09-06** — migration `20260905020200`. Só supervisor entra até o módulo ser concedido |
| Qualquer usuário edita pedido de compra alheio | policy `tenant update purchase requests`, tenant-wide | — | **Fechado no teste em 2026-09-06** — migration `20260905020200`. Só supervisor entra até o módulo ser concedido |
| `SystemSettings` sem guard | `GlobalSearch.tsx:95` leva qualquer um a `/configuracoes/sistema`; o sidebar só esconde o item | Um `member` vê a tela de gestão de usuários | **Aberto** |

As quatro migrations foram **aplicadas no `test-helpoint` em 2026-09-06**
(`supabase db push`). `supabase/tests/database/rls_policies_da_revisao.test.sql`
prova as dez asserções contra o banco real: 6 ficavam vermelhas antes, 10
verdes depois. Produção continua vazia e não recebeu nada.

---

## Módulo quebrado, não incompleto

**O RH não funciona.** Nenhuma das seis tabelas (`rh_vacation_requests`,
`rh_medical_certificates`, `rh_payslips`, `rh_documents`,
`rh_employee_benefits`, `rh_employee_profiles`) tem chave estrangeira em
`user_id` — conferido no `pg_constraint`. Sem FK, o PostgREST não resolve o
embed `profile:user_id(...)` e devolve `PGRST200`; como todo hook escreve
`const { data } = await ...` sem ler o `error`, o erro vira lista vazia.

Consequência: Aprovações (férias **e** atestados), "Últimos envios" de
holerites, o cofre de documentos, "Colaboradores vinculados" e
Aniversariantes/Tempo de casa mostram "nenhum" para sempre. **Aprovar férias e
validar atestado pela interface é impossível.** O §3.7 do inventário descreve
essas telas como se funcionassem.

**Corrigido no teste em 2026-09-06** — migration `20260905020000`, seis FKs
para `profiles(id)` com `ON DELETE RESTRICT`. Consequência a tratar no front:
`RHColaboradores.tsx:148` exclui colaborador com `confirm()`, e agora isso
falha para quem tem histórico — precisa virar desativação.

---

## Funciona, mas com regra errada — corrigir, não replicar

### Transversal

- **O cache do react-query sobrevive ao logout.** `AuthContext.signOut`
  (`:157-166`) limpa só o estado local; ninguém chama `queryClient.clear()`.
  Chaves sem `user`/`tenant`: `['notifications']`, `['users-management']`,
  `['tenant-invites']`, `useInsightReports`. Segundo login na mesma aba, com
  outro tenant, mostra dados do anterior até o refetch terminar.
- **`useUpdateTenantSettings` diz "Configurações salvas" para quem não pode
  salvar** (`useTenantSettings.ts:91-94`). O `update` não tem `.select()`, a
  policy exige `is_diretor`, o UPDATE afeta 0 linhas, o PostgREST não devolve
  erro e o toast comemora. `TIConfiguracoes` também não checa cargo.
- **`useUserModules` não invalida `['my-modules']`** (`:118-119`): o admin
  edita os próprios módulos e o sidebar dele não muda.

### TI

- **Os contadores de POP só contam supervisores.** A RPC `increment_pop_views`
  **não existe no banco** (conferido em `pg_proc`), então `usePOPs.ts:213-224`
  cai sempre no fallback `UPDATE pops` — e a única policy de UPDATE é
  `Supervisors can update POPs`. Para `member`/`viewer` o UPDATE afeta 0 linhas
  sem erro. `views_count` e `solved_count` alimentam "Visualizações",
  "Problemas resolvidos", "Artigos populares", `resolutionRate` e `topPOPs`:
  todos subcontam.
- **"Desempenho por técnico" e "Top solicitantes" de TI misturam chamados de
  RH, MKT, Qualidade e Financeiro.** `useTechnicianPerformance.ts:24-30` e
  `useRequesterMetrics.ts:80-88` não aplicam `filter.module` (nem
  `technicianId`, no primeiro), embora recebam. A `queryKey` também omite
  `module`, então TI, RH e MKT compartilham cache.
- **Ativo "Em uso" ou "Em estoque" não aparece no formulário de chamado.**
  `useHelpdesk.ts:200,225` filtram `status = 'active'`, mas `AssetForm` cadastra
  como `in_stock` e oferece `in_use`. O ativo atribuído ao usuário some do
  `AssetSelector`. `InventoryKPIs` agrava: rotula `active` como "Em uso" e
  `inactive` como "Em estoque", ignorando os dois valores reais.
- **"SLA cumprido vs. período anterior" compara duas regras diferentes.**
  Atual (`useHelpdeskMetrics.ts:159-168`): cumprido se resolvido no prazo **ou**
  ainda correndo dentro dele. Anterior (`:327-334`): só resolvido no prazo. Nos
  dois o denominador é `metrics.total`, que inclui `cancelled`, `rejected` e
  chamados sem SLA como "não cumpridos".
- **A lista "SLA violado" inclui cancelados e reprovados** e não filtra módulo
  (`:369-370`), embora `getSLATimeRemaining` trate esses status como "SLA
  encerrado" sem violação.
- Links de tutorial sem `tenantPath()`: `Portal.tsx:265,349,402,449`,
  `CategorySection.tsx:66`, `TutorialViewer.tsx:188,285`. Funciona pelo
  `LegacyTenantRedirect`, ao custo de uma consulta e um spinner.
- "Ativos em uso" tem duas definições concorrentes; janela de vencimento tem
  três implementações (§2.3).
- Denominador de `slaCompliance` por técnico usa todos os resolvidos, não só
  os que têm SLA (§2.3).

### RH

- **A conta de mês depende do fuso.** `useRH.ts:280` e `:365` fazem
  `new Date('YYYY-MM-01')` (UTC) → `setMonth` (local) → `toISOString` (UTC). Em
  UTC−3: "Replicar mês anterior" falha em **10 dos 12 meses**; a janela de
  Faltas perde os dias 29 a 31 de março e ganha 01/10 em setembro.
- **Tenant sem linha em `rh_payroll_settings` trava "Parâmetros da Folha" em
  "Carregando…" para sempre** (`RHConfiguracoes.tsx:245`). A migration que
  semeou a linha rodou uma vez; não há trigger em `tenants` que faça isso para
  tenant novo.
- **Quem tem só o módulo RH não lê `rh_companies`** — a policy exige
  supervisor. O `CompanyPicker` fica vazio, o card "Empresas" mostra 0, e o
  diálogo de colaborador não tem opção de empresa.
- Aniversariantes e Tempo de casa contam colaboradores **desligados**
  (`RHRelatorios.tsx:145-149`, `DetailedRHTable.tsx:53,85-90`), e
  `RHPeopleWidget` usa `key={p.user_id}`, nulo para quem não tem conta.
- ~~Toasts que mentiam ("O RH foi notificado", "O colaborador foi
  notificado")~~ — **corrigido em 2026-09-04**. Não havia notificação alguma:
  os triggers dessas tabelas são `audit`, `updated_at` e
  `create_rh_ticket_from_request`.
- **Ressalva ao §3.2/§2.6 sobre o Offboarding:** o inventário diz que
  `revoke_ticket_id` "nada no frontend grava" — verdade para o front, mas o
  trigger `create_offboarding_ti_ticket` grava esse campo no chamado espelho de
  TI. O que esvazia o painel é o `employeeId: user.id` de
  `CreateTicketForm.tsx:178`.
- `RHColaboradores.tsx:148` exclui colaborador com um `confirm()` simples, e o
  banco faz `ON DELETE CASCADE` em folha, faltas e vales — apaga o histórico
  financeiro da pessoa sem avisar.

### Qualidade / SAC

- **O portal promete "aviso por e-mail a cada resposta" e nenhum e-mail sai.**
  Os triggers `emit_sac_reply_event` e `emit_sac_resolved_event` gravam em
  `notification_events`, e **nada lê essa tabela** — zero referências em
  `supabase/functions/` e em `src/`, nenhum cron. Havia 6 eventos `pending`
  parados no teste. O ADR-003 não cobre esse caminho.
- **A avaliação do cliente não grava.** `sac_tickets` não tem policy de UPDATE
  para cliente: o comando volta 200 com zero linhas, sem erro. Daí o
  `RatingDialog` reabrindo a cada visita, o badge "N novas respostas" que nunca
  zera, e `SatisfactionBlock`/NPS permanentemente vazios. **Corrigido no banco em
  2026-09-06** (migration `20260905020300`). **O front continua sem conferir**:
  `RatingDialog.tsx:36-46` precisa de `.select('id')` e tratar zero linhas como
  erro, senão o próximo bloqueio volta a ser silencioso.
- **Editar o e-mail do cliente em Configurações tranca o login dele.**
  `useSACCustomers.ts:39` muda só `customer_profiles.email`, não `auth.users`.
  Com o e-mail novo, `verify-sac-otp` não acha o usuário e o front mostra
  "Código incorreto"; com o antigo, `not_registered`.
- **Mesmo e-mail num segundo tenant quebra o cadastro** e deixa o cliente
  logado no tenant errado (`Register.tsx:98-115` + `customer_profiles_user_id_key`).
- **"Melhorar com IA" nunca funciona para o cliente**: o cliente sempre manda
  Bearer, então `resolveTenantId` procura em `profiles`, não acha, e
  `requireCredential` lança `no_ai_credentials`. O fallback por `tenant_slug` só
  roda sem Bearer.
- `SatisfactionBlock.tsx:138` "Abrir SAC →" vai para `/qualidade/sacs?ticket=<id>`,
  e a lista só lê `?status` — cai na lista, não no chamado, e recarrega a SPA.
- `useResetSACCustomerPassword` chama `resetPasswordForEmail`, incompatível
  com o login OTP do cliente (§4.9).

### Financeiro

- **O PostgREST corta em 1000 linhas, em silêncio, e derruba os lançamentos
  mais novos.** `useFinanceiro.ts:19` não tem `.limit` e ordena por `due_date`
  ascendente, então o corte descarta primeiro os vencimentos **futuros**. Acima
  de 1000 lançamentos por tenant, o fluxo projetado perde os meses à frente,
  "Vence em 7 dias" esvazia e "Total a pagar no período" encolhe — sem erro na
  tela. Isso é pior do que "não escala": é **número errado**, não página lenta.
- **"Últimos N meses" do fluxo de caixa são os N últimos meses *com dados*,
  incluindo o futuro.** `FinCashFlow.tsx:45` faz `sort().slice(-limit)` sobre
  as chaves existentes. Com parcelas lançadas até 2027-08, "Últimos 6 meses"
  mostra `2027-03..2027-08` e o mês corrente some. Meses sem movimento também
  somem, e a linha de acumulado pula os buracos.
- **"Hoje" é a data UTC.** `toISOString().slice(0,10)` em
  `types/financeiro.ts:94`, `FinEntriesPage.tsx:58,73`,
  `finance-import.ts:142` e `FinIndicators.tsx:96`. Das 21h à meia-noite (BRT)
  o sistema acha que já é amanhã: conta que vence hoje aparece "Atrasado", e
  **"Liquidar" grava `settled_at` de amanhã** — no último dia do mês, cai no mês
  seguinte do Realizado.
- **A fronteira do período dos indicadores depende da hora do dia.**
  `FinIndicators.tsx:31-35,62-63` posiciona o lançamento às 12:00 e compara com
  `new Date()`. Antes do meio-dia, o que vence hoje fica fora de "Total a pagar
  no período" e ao mesmo tempo aparece em "Vence nos próximos 7 dias".
- **A variação do "Saldo realizado" inverte o sinal quando o período anterior
  foi negativo.** `calcChange` com anterior −1.000 e atual +500 devolve −150%,
  seta para baixo, vermelho: o saldo saiu de prejuízo para lucro e a tela diz
  que piorou.
- **"Produtos comprados no ano" nunca passa de 8**, porque o hook corta
  `topProducts` em 8 e o card exibe `topProducts.length` como KPI.
- **Liquidado sem data conta em "Já pago" e some do Realizado.** As três telas
  discordam sobre o mesmo dinheiro: `FinEntriesPage` soma, `FinCashFlow` e
  `FinIndicators` exigem `settled_at` e ignoram.
- **O saldo acumulado do fluxo de caixa é o acumulado da janela escolhida**,
  não o caixa da empresa — e a tela não diz isso em lugar nenhum.
- **`overdue` gravado pela importação é pegajoso**: editar o vencimento para o
  futuro não devolve o lançamento a "Pendente".
- ~~Três parsers de valor em R$, dois errando por 100x ou 1000x~~ —
  **corrigido em 2026-09-04**, todos passaram a usar `parseAmount`.
- Formato de importação "Forteplus" é rótulo decorativo, sem regra de parsing
  própria (§6.6). Conciliação bancária não existe.

### Marketing

- `tenant_id` sem trigger em 6 tabelas (§5.6). **Conferido no banco do teste em
  2026-09-04**: `mkt_suppliers`, `mkt_quotations`, `mkt_social_accounts`,
  `mkt_ai_generations`, `mkt_assets` e `mkt_social_account_secrets` têm
  `tenant_id NOT NULL` sem `DEFAULT` e sem `inject_tenant_*` — enquanto
  `mkt_artists`, `mkt_events`, `mkt_social_posts` e as sete irmãs têm. Nenhum
  hook de criação envia o campo, então *criar fornecedor* e *criar item de
  inventário MKT* — dois fluxos com tela viva — falham no INSERT.

---

## Padrões que escondem defeito

Não são bugs isolados: são formas de escrever que transformam falha em
silêncio. Cada uma explica vários itens acima.

1. **`const { data } = await supabase...` sem ler o `error`.** Qualquer falha
   de RLS ou de schema vira lista vazia. É o que manteve o RH quebrado sem
   ninguém perceber, e o padrão está em praticamente todo hook do projeto.
2. **`update`/`insert` sem `.select()`.** O PostgREST responde 200 com zero
   linhas quando a policy não casa — não é erro. O front comemora e nada foi
   gravado. Explica a avaliação do SAC, os contadores de POP e o toast de
   configurações.
3. **`queryKey` sem `tenantId` ou sem `userId`.** Dois tenants na mesma aba, ou
   dois logins seguidos, veem dado trocado até o refetch.
4. **`toISOString()` para obter "hoje".** Devolve a data UTC; das 21h à
   meia-noite, no Brasil, já é amanhã.
5. **Rota escrita à mão em `navigate(...)`, sem confronto com o mapa de
   rotas.** Três rotas mortas já foram encontradas assim.

---

## Existe, mas não é alcançável ou não faz nada

| Onde | Estado real |
|---|---|
| `BlockEditor`, `BlockItem`, `SortableBlockItem`, `POPPreview` | Editor de blocos completo e **nunca importado**; POPs são sempre markdown (§2.6) |
| `DashboardCustomizer` | Grava preferências que **não afetam** a tela renderizada (§2.6) |
| `CreateReportDialog`, `ReportDetailSheet`, `useInsightReports` | CRUD de relatórios agendados **sem tela que os monte** (§2.6) |
| `useMKTQuotations` (8 funções), `useMKTAICreative` (5), `useMKTMetrics` | Camadas de dados **sem nenhuma UI** (§5.6) |
| `MetaConnectButton` | Único caminho para conectar conta social e **não é renderizado em lugar nenhum** (§5.6) |
| Botão "Marcar publicado" do calendário social | **Não publica nada** — só troca o status local (§5.5) |
| `mkt-meta-refresh-token` | O front chama (`useMKTSocialAccounts.ts:175`), a edge function **não existe** |
| Aba "Padrões (IA)" do dashboard de Qualidade | Card estático "em preparação" (§4.9) |
| Aba "Equipe" de `QualidadeSettings` | Desativada por `disabled` (§4.9) |
| `sac_form_fields` | Configurável na tela, **sem consumidor** no formulário público (§4.9) |
| `heatmap`, `funnel`, `productByCategory`, `topCategories`, `slowest` (Qualidade) | Calculados e **nunca renderizados** (§4.9) |
| `src/pages/sac/Login.tsx` | Arquivo morto, substituído pelo OTP (§4.9) |
| ~~`sac-check-customer`, `sac-public-submit`~~ | Apagadas em 2026-09-06, do deploy e do repositório. Estavam no ar sem JWT — ver "Buracos de segurança" |
| `ui/sidebar.tsx`, `ui/chart.tsx` | Scaffold shadcn não importado por ninguém (§7.4) |
| `mkt_ugc_content` e os tipos `MKTUGC` | Tabela **excluída do banco**, tipos ainda no código (§5.4) |
| `useReportMetrics.ts` | Arquivo inteiro é um stub que devolve zeros — e `TIRelatorios` manda esses zeros para a IA como se fossem dados de Kanban |
| `KPIMini`, `ActiveCardsByColumn` (`TIRelatorios.tsx:604-688`) | Nunca renderizados |
| `ensureChecklistAllowsClosing` (`useTicketActions.ts:12-24`) | Reimplementa o trigger `enforce_ticket_checklist_before_closing`, que já lança a mesma mensagem |
| `useUndoRedo` | Zero importadores — e é o **único** uso de `@xyflow/react` no `package.json` |
| `useDashboardTemplates` | Zero importadores (a tabela existe, a tela não) |
| `useTenantSlug` (`useTenantPath.ts:22`) | Exportado, nunca usado |
| `usePurchaseRequests`, `parseFinanceFile` | Sem nenhum chamador |
| `CustomerKnowledgeDetail` | Rota registrada em 2026-09-04; o card do portal voltou a funcionar |
| `/kanban` | Rota **ainda não existe**, os dados sim. `NotificationBell.tsx:58`, `usePersonalPerformance.ts:226` e o briefing da Lyra já mandam o usuário para lá — clique cai no `NotFound`. **Não é código morto a apagar**: o Kanban está planejado como segunda visão da fila de chamados do MKT (detalhado ou kanban) e como parte do módulo Projetos, junto com workflow. Os três chamadores ficam de pé esperando a rota (§2.1) |
| Conciliação bancária no Financeiro | **Não existe** (§6.6) |

---

## Dívidas de base

- **Sem CI.** Não há `.github/` neste repositório: `lint`, `test` e
  `supabase test db` rodam na máquina de quem trabalha, e só.
- Cobertura de teste: 11 testes no front — 1 é `expect(true)`, 10 cobrem o SLA
  em `src/types/helpdesk.test.ts`. No banco, `supabase/tests/database/` tem 7
  asserções sobre isolamento entre tenants em `tickets` e 10 sobre as policies
  da revisão — 17 verdes desde 2026-09-06. É pouco para o tamanho do RLS
  (~309 policies), e para produto (ADR-005) isso é bloqueio antes do primeiro
  cliente de fora.
- `npm run lint`: 550 problemas (510 erros, 40 avisos), 463 `no-explicit-any`.
  Não pode piorar.
- Chunk principal de 3,4 MB sem code splitting.
- Backend de Marketing sem tela: tabelas e hooks existem, UI não (§5.6).
- **A mesma linha de `tenants` é buscada por 6 componentes**
  (`StaffRoute`, `TenantSlugGuard`, `LegacyTenantRedirect`, `StaffAwayFromSAC`,
  `AppLayout`, `AppSidebar`), e `StaffRoute` remonta a cada rota — é uma
  consulta e um spinner por navegação. Resolver no `AuthContext` uma vez.
- **Tabelas com `tenant_id NOT NULL` sem trigger de injeção fora do MKT**:
  `pop_versions`, `pop_attachments`, `calendar_events`, `notifications`,
  `software_license_keys`. Hoje não quebram porque os hooks passam o campo na
  mão; o primeiro chamador que esquecer falha no INSERT.
- `useTicketComments.ts:44-56` faz uma consulta de anexos por comentário (N+1).
