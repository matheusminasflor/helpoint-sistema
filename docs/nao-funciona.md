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
| Cliente troca o próprio `tenant_id` | policy `Customers can update their own profile` em `customer_profiles`: `USING (user_id = auth.uid())` e `WITH CHECK` **nulo** — o Postgres então usa o `USING`, que continua verdadeiro depois da troca | Passa a ler produtos, lotes, categorias e POPs de outra empresa, e a abrir SAC nela. IDs de tenant são públicos via `get_sac_tenant_branding(slug)` | **Fechado no teste em 2026-09-06** — migration `20260905020400`: trigger congela identidade, empresa e bloqueio para o cliente; staff segue podendo bloquear. Provado por `rls_customer_profiles_guard.test.sql` |
| Colaborador aprova as próprias férias | policy `Colaborador cancela sua própria solicitação pendente`: o `WITH CHECK` não fixa o status de destino | `PATCH {"status":"aprovada"}` na própria linha passa | **Fechado no teste em 2026-09-06** — migration `20260905020100` |
| Colaborador altera o próprio holerite | policy `Colaborador marca holerite como visto` sem restrição de coluna | Troca `file_path`, `type` e `reference_month` | **Fechado no teste em 2026-09-06** — migration `20260905020100` |
| Qualquer usuário do tenant lê o razão | `StaffRoute` não checa módulo nem cargo; RLS das 7 tabelas `fin_*` era só `tenant_id` | `/t/<slug>/financeiro/contas-a-pagar` abre a contabilidade da empresa | **Fechado no teste em 2026-09-06** — migration `20260905020200`. Só supervisor entra até o módulo ser concedido |
| Qualquer usuário edita pedido de compra alheio | policy `tenant update purchase requests`, tenant-wide | — | **Fechado no teste em 2026-09-06** — migration `20260905020200`. Só supervisor entra até o módulo ser concedido |
| `SystemSettings` sem guard | `GlobalSearch.tsx:95` leva qualquer um a `/configuracoes/sistema`; o sidebar só esconde o item | Um `member` via a tela de gestão de usuários | **Fechado em 2026-09-06** — `RequireOwnerOrAdmin` nas três rotas de `configuracoes/*`, mesma condição (`showSettings`) que esconde o grupo no sidebar |
| ~~Histórico de execuções das automações aberto a todo membro~~ | policy `Tenant members can view runs` em `automation_runs` — e o run guarda a cópia inteira do registro que o disparou (`to_jsonb(new)` de contato, negócio ou chamado) | Quem não tem o Comercial lia contatos e negócios pelo histórico; solicitante lia chamados alheios. Cancelar e reexecutar tinham o mesmo teto | **Fechado no teste em 2026-09-10** — migration `20260912040000`: ler, cancelar e reexecutar são de gerente para cima. Provado em `automacoes_fluxos.test.sql` (3 asserções) |
| ~~Vendedor "apagava" etapa do funil sem apagar~~ | `crm_delete_stage` é `security invoker`; a policy de DELETE das etapas é de gerente, a de UPDATE dos negócios não | O vendedor movia os negócios, o DELETE afetava 0 linhas em silêncio e a tela dizia "Etapa apagada" | **Fechado no teste em 2026-09-10** — mesma migration: a função exige gerente antes de mover qualquer negócio e confere `row_count` do DELETE. Provado em `crm_funis_editaveis.test.sql` |
| ~~Negócio ia para etapa de outra empresa pelo fluxo~~ | passos `set_stage` e `update_record` do motor gravam o uuid que está na configuração do fluxo, sem conferir a empresa | Uma etapa alheia no negócio (e dado cruzado no funil) | **Fechado no teste em 2026-09-10** — trigger `trg_crm_deal_check_stage_tenant` em `crm_deals`, no molde do que já existia entre etapa e funil. Provado em `crm_funis_editaveis.test.sql` |
| ~~Uuids de configuração do fluxo sem conferir a empresa~~ | passos `notify` (`user_id`), `assign`, `create_deal` (`owner_id`), `add_note` (`author_id`) | Só gerente edita fluxo, então era gerente de uma empresa mirando id de outra — dado cruzado, não vazamento de leitura | **Fechado no teste em 2026-09-17** — migration `20261007010000`: dez colunas de pessoa ganharam a chave composta `(pessoa, tenant_id) → profiles (id, tenant_id)`, em vez de um guard dentro da função de 16 KB que executa os passos. Assim vale para toda escrita, venha de onde vier. Provado em `dividas_das_auditorias.test.sql` (24 asserções, incluindo que o caminho normal e o de **pessoa nula** — de que o formulário do site, o WhatsApp e o Lead Ads dependem — continuam funcionando). **Três das dez perderam o `on delete set null` na primeira tentativa**, o que travaria a exclusão de quem criou contato, negócio ou anotação; restaurado na `20261007020000`, achado da reauditoria |
| Worker de automação (`automation-worker`) com SSRF parcial | não resolvia AAAA, e quando a resolução falhava deixava passar | Passo HTTP de um fluxo podia mirar endereço interno via IPv6 | **Fechado em 2026-09-17** — resolve as duas famílias, recusa quando nenhuma resolve, e a classificação de IPv6 passou a cobrir `::`, `fc00::/7`, `fe80::/10`, `fec0::/10`, `ff00::/8` (multicast), 6to4, NAT64 e o IPv4 embrulhado em `::ffff:` — o multicast faltou na primeira tentativa, enquanto o ramo IPv4 ganhou o par dele na mesma leva (achado da reauditoria). `redirect: 'manual'` já estava lá. **Resta o DNS rebinding**, que pede fixar o IP resolvido na conexão — o Deno não oferece isso sem reimplementar o cliente HTTP; está marcado com `ponytail:` no código |
| Passo de e-mail do fluxo aceita qualquer destinatário | `send_email` valida o formato e manda para onde mandarem | **Não é defeito, é a funcionalidade**: "enviar e-mail para um endereço" é o que o passo faz, e quem configura fluxo é gerente. O que isso significa é que **gerente consegue mandar dado do sistema para fora** — inerente ao passo, não a um descuido | **Registrado, não fechado** — se um dia isso incomodar, a saída é uma lista de domínios permitidos por empresa |
| Comparação do segredo do webhook de fluxo não era de tempo constante | `automation_webhook_fire` | O que se compara são **hashes**, não segredos: saber que três caracteres de um SHA-256 batem não aproxima ninguém do segredo, porque exploraria um ataque de pré-imagem. Risco teórico | **Fechado em 2026-09-17** — `hash_igual()` não sai cedo. Custou quatro linhas e tirou o assunto da lista |
| ~~`TRUNCATE` concedido a quem está logado~~ | padrão da Supabase em **toda** tabela do schema; TRUNCATE não passa por policy nenhuma | Sem caminho hoje (o PostgREST não o expõe), mas privilégio que não se usa não tem por que existir | **Fechado em 2026-09-17** — `revoke truncate on all tables` mais `alter default privileges` para as que ainda vão nascer |
| ~~Perfil de acesso é decoração no banco~~ | Nenhuma policy de RLS, em nenhum módulo, lia `access_profiles.permissions` — a resolução inteira vivia em `resolvePermission`, no navegador (`src/hooks/useAccessProfiles.ts`) | A tela escondia o botão; o PostgREST continuava aberto para quem soubesse a URL. Não é explorável hoje (as cinco contas são `owner`/`admin` e `user_access_profiles` está vazio), mas passa a ser no dia em que o dono atribuir o primeiro perfil achando que ele barra alguma coisa | **Fechado no teste em 2026-09-21** (leva L6a, Painel Comercial) — `public.tem_permissao(_user_id, _departamento, _modulo, _acao)`, a primeira policy do sistema a consultar o perfil: lê `user_access_profiles.overrides` primeiro, `access_profiles.permissions` depois, `false` quando nada foi dito — a mesma precedência de `resolvePermission`. Usada nas policies de escrita de `com_vendas_itens` e das outras tabelas do Comercial. As demais 6 departamentos (TI, Marketing, RH, Qualidade, Financeiro, Educacional) continuam sem policy que leia o perfil — o buraco fecha módulo a módulo, à medida que cada um ganhar uma ação que precise da granularidade fina |

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
para `profiles(id)` com `ON DELETE RESTRICT`. ~~Consequência a tratar no front:
`RHColaboradores.tsx` exclui colaborador com `confirm()`, e agora isso falha
para quem tem histórico~~ — **tratada em 2026-09-17**: o botão virou
**Desligar**, que põe o colaborador em `desligado` (estado que a tela já tinha) **com
a data do dia** — a tela revela "Data de desligamento" nesse estado, e um botão
de um clique que deixasse o cadastro pela metade faria quem consulta o histórico
não saber quando a pessoa saiu — em vez de tentar sumir com a linha. Apagar levaria junto férias, atestado e
holerite, que é justamente o que o RH existe para guardar.

---

## Funciona, mas com regra errada — corrigir, não replicar

### Transversal

- ~~**O painel inicial escondia trabalho atrás do calendário.**~~ Agrupava por
  data de prazo, então tudo com mais de um dia pela frente caía em **"Futuro"**,
  pintado de verde, e a prioridade só desempatava dentro do grupo — uma tarefa
  Baixa para hoje ficava acima de um chamado Crítico para depois de amanhã.
  Somado a isso, tarefa e chamado apareciam como linhas separadas com títulos
  quase iguais, e o tipo era "TK" ou "TA". O dono abriu um item "Futuro"
  achando que era chamado da TI, não achou o chamado em fila nenhuma, e antes
  disso já tinha concluído a tarefa errada no modo foco. **Corrigido em
  2026-09-13**: grupos por prioridade, prazo como coluna, módulo do chamado
  visível, tipo por extenso, e tarefa de fluxo aparecendo junto do chamado dela.
- ~~**Tarefa de fluxo: cada disparo abria um chamado.**~~ O fluxo real do dono
  ("Cadastro concluído → cobrar") dispara em "resolvido" **e** em "fechado", então
  quem resolvia e depois fechava o mesmo chamado abria duas cobranças, cada uma
  com número, relógio de prazo e peso nos indicadores. **Corrigido em
  2026-09-13** (migration `20260924010000`): o passo reaproveita o chamado que já
  está aberto daquele fluxo, daquele passo, para aquele registro de origem. Passo
  diferente do mesmo fluxo continua abrindo o seu (um na TI, outro no
  Financeiro). Gatilho sem registro de origem (agenda, webhook) fica de fora,
  porque repetir é a natureza dele. Isso também fechou o caminho de reexecutar
  uma execução sem passo falho, que recomeçava do início e criava um par a mais.
  ~~E `automation_validate_flow` não conferia se o módulo escrito no passo
  existe~~ — agora confere, e módulo inventado é recusado ao salvar em vez de
  quebrar na hora de rodar.
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

### Notificações (todos os módulos) — leva L0 da Fase 3

O **sistema** de notificação (tabela `notifications`, realtime, sino) é um só
e não distingue módulo. O que variava era quem produz aviso:

- ~~O robô `check-alerts` estava morto para todos os módulos~~ — **corrigido em
  2026-09-08**. Três causas: embed ambíguo `user_roles!inner` (PGRST201 —
  `user_roles` tem duas FKs para `profiles`; a função engolia o erro e pulava
  o tenant inteiro), filtro por cargos que não existem mais (`supervisor`,
  `diretor`) e três tipos fora do enum `notification_type` (`reminder`,
  `deadline_expired`, `ticket_created`). Prova: 4 licenças vencidas com
  `auto_create_ticket` e zero chamados abertos, 16 execuções "sucesso" com
  todos os contadores em zero. O mesmo embed quebrava a lista de técnicos
  (`useTechnicians.ts`).
- ~~Prazo estourado de RH/Qualidade/Financeiro sem responsável ia para a equipe
  de TI~~ — **corrigido**: mapa módulo→departamento completo em `check-alerts`.
- ~~Quem pedia férias/atestado não era avisado da decisão; quem pedia compra
  também não; resposta de cliente no SAC não chegava ao staff~~ —
  **corrigido**: tipos `request_decided`, `purchase_decided`,
  `sac_customer_reply` (migration `20260908010000`); os dois primeiros por
  insert no front, o terceiro por trigger em `sac_ticket_comments`.
- ~~Minha tranca `sac_tickets_guard_cliente` (06/09) barrava o trigger
  `sac_auto_status_on_reply`: **toda resposta de cliente no portal falhava**
  desde então~~ — **corrigido em 2026-09-08** (`20260908010100`,
  `pg_trigger_depth() > 1` passa). O pgTAP da época testou o UPDATE direto,
  não a corrente comentário → trigger → status; o novo testa a corrente.
- ~~O chamado só avisava UM lado: solicitante que respondia não avisava
  ninguém; chamado novo não avisava a equipe; avaliação e reabertura sem
  responsável morriam; transferência não avisava o solicitante; SAC aberto e
  SAC avaliado não chegavam à Qualidade; pedido de compra não chegava a quem
  aprova; holerite e documento no cofre não chegavam ao colaborador; conta a
  pagar vencendo e post publicado/falho não avisavam ninguém~~ — **corrigido
  em 2026-09-08** (migration `20260908020000`, matriz de 26 eventos feita
  pelo auditor). A regra de "quem é avisado" saiu do front e virou trigger:
  `notify_on_ticket_created`, `notify_on_ticket_comment` (o outro lado, ou a
  equipe do módulo via `notification_team()`), `notify_on_purchase_requested`,
  `notify_on_sac_ticket_created`, `notify_on_sac_customer_rated`,
  `notify_on_rh_document`. O front deixou de inserir onde o trigger cobre
  (`useTicketComments`, `reopenTicket`, os três `ticket_created` do
  `check-alerts`). `check-alerts` ganhou `bill_due` (3 dias, sem ajuste por
  tenant) e passou a incluir o responsável no `sla_warning`; `mkt-publish-due`
  avisa quem agendou. Provas: pgTAP `chamado_avisa_dos_dois_lados` (12) e
  robô ao vivo (`billsDue: 1` para os 4 supervisores, sem equipe Financeiro).
- Ainda **só sino, nunca e-mail**: `email_sent` existe e nada a escreve; o
  toggle "E-mail" de `SLAPoliciesTab.tsx:211` grava
  `alerts.emailNotifications` e nada o lê → leva L1. O cliente do SAC não
  tem sino (`notifications` é de staff): resposta e resolução chegam a ele só
  pelo badge "N novas respostas" de `MyTickets.tsx` até o e-mail existir.
- Cosmético: `deadline_expired` e `bill_due` repetem a cada 24h para cada
  supervisor enquanto o item estiver atrasado — é o desenho, não defeito.
- **O dedupe do chamado de renovação é por `ilike` no título**: `VENCIDO -
  bymfpro.com` casa com `VENCIDO - bymfpro.com.br`, então a segunda licença
  não ganha chamado (visto na prova de 2026-09-08: 4 licenças vencidas, 3
  chamados). O certo é deduplicar por `reference_id` da licença — fica para a
  leva "edge functions sob as cinco regras".
- As janelas "vence em N dias" vivem na função (30 dias licença/contrato;
  manutenção **herda** a da licença e só com `auto_create_ticket`; SLA 75%).

### TI

- ~~O painel lateral do chamado era de TI para todos os módulos~~ (visto ao provar
  a L3a): "Abrir" levava sempre a `/ti/chamados/:id` e a chave inglesa
  "Agendar manutenção" aparecia em chamado de qualquer módulo — **corrigido em
  2026-09-09**: `ticketDetailPath(module, id)` (`src/lib/ticket-route.ts`) e o
  botão só com `module = 'tickets'`. `Ticket.module` passou a existir no tipo.
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
- ~~Links de tutorial sem `tenantPath()`: `Portal.tsx:265,349,402,449`,
  `CategorySection.tsx:66`, `TutorialViewer.tsx:188,285`. Funciona pelo
  `LegacyTenantRedirect`, ao custo de uma consulta e um spinner.~~ — **sem
  objeto desde a ADR-010** (correção da auditoria da Frente 3, 2026-09-23):
  `useTenantPath()` virou identidade (`src/hooks/useTenantPath.ts`), então
  chamar ou não chamar devolve o mesmo caminho — não há mais "sem
  tenantPath()" para custar consulta e spinner. `LegacyTenantRedirect`
  também não existe mais com esse nome: é `TenantSlugRedirect`
  (`src/App.tsx`), que só tira o prefixo `/t/:slug` de endereço antigo.
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
  tenant novo. (O mesmo valia para os **perfis de acesso** de todos os módulos —
  ~~tenant novo nascia sem nenhum~~ — corrigido em 2026-09-09 pelo trigger
  `trg_seed_categories_novos_modulos`, migration `20260909020000`.)
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
  **Agora existe um jeito de fechar isto sem trocar um corte silencioso por
  outro:** `buscarComTeto` (`src/lib/listas.ts`) pede um a mais que o teto e
  devolve `cortou: true` quando havia mais — a tela mostra `<ListaCortada />`
  em vez de apresentar o pedaço como se fosse o todo. Aplicado em
  `useCRMContacts` (contatos do CRM, o mais exposto: tem importação de
  planilha) e nas três listas de `useHelpdesk.ts` (`useMyTickets`,
  `useTicketQueue`, `useTicketHistory` — a de resolvidos cresce para sempre).
  `useFinanceiro.ts:19`, que é o caso descrito acima, continua sem o ajudante:
  fora do escopo desta correção. Continuam sem teto, de propósito —
  `useProjetos.ts` (19 consultas), `useTreinamentos.ts` e `useExpedicao.ts`: o
  volume de cada um é limitado por uma empresa de cinco pessoas, e o ajudante
  está pronto para quando não for.
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
  própria (§6.6). Conciliação bancária não existe. **Continua verdade — para
  este módulo.** A partir da leva L6a existe uma regra de leitura do
  Forteplus de verdade, mas é de **outro relatório** (Mercadorias Vendidas,
  não o financeiro) e de **outro módulo** (Comercial, `src/lib/comercial-
  import.ts`, nunca `finance-import.ts`): não confundir uma com a outra, nem
  tentar reaproveitar o leitor novo aqui — o cabeçalho impresso do relatório
  de vendas aponta para colunas erradas (§3.3 do plano do Painel Comercial),
  e o do financeiro é outro formato, outro problema.

#### Compras (L8) — o que ficou em aberto de propósito

A L8 fechou quatro lacunas (marcação `is_purchase` em vez do nome da categoria;
três orçamentos exigidos no banco; compra concluída virando conta a pagar;
permissões de teto e de produtos finalmente lidas). Estas quatro ficaram
**registradas e não feitas**, para o dono decidir depois:

- **Duas listas de fornecedor na mesma empresa.** `fin_suppliers` (novo, do
  Financeiro) e `mkt_suppliers` (do Marketing, com categoria de agência/gráfica
  e nota de 0 a 5) não se falam. Quem cadastrar a mesma gráfica nos dois lugares
  vai ter dois cadastros. Juntar as duas é decisão do dono — muda a tela do
  Marketing, que hoje pontua fornecedor, e o Financeiro não pontua.
- **`fin_suppliers` ainda não tem tela.** A tabela existe, a RLS está no lugar e
  o orçamento já sabe apontar para ela, mas **ninguém consegue cadastrar
  fornecedor pela interface** — nem escolher um no formulário de compra. Na
  prática o fornecedor continua sendo o texto livre de sempre, e a conta a pagar
  nasce com esse texto. Consequência para quem lê o pgTAP: a asserção "e o
  fornecedor vem do cadastro" exercita um caminho que hoje **nenhum usuário
  percorre**, porque `supplier_id` é sempre nulo em produção.
- **O controle de `purchases:manage_products` é só de tela.** A RLS de
  `fin_purchase_products` libera INSERT e UPDATE a qualquer pessoa do tenant, e
  o cadastro rápido de produto dentro do formulário de compra depende disso. A
  tela de catálogo fica cinza para quem não tem a permissão; a porta do
  PostgREST continua aberta. Fechar de verdade é decidir antes o que acontece
  com o cadastro rápido — hoje é ele que faz o fluxo de compra funcionar.
- **`purchases:manage_budget` continua sem ser lido.** O teto de gasto é de
  gestor para cima, e é isso que a tela e a RLS dizem. O escopo só passa a
  valer alguma coisa junto com uma RLS que o conheça — sozinho no front ele
  seria adorno, porque `can()` já devolve `true` para gestor antes de olhar o
  perfil de acesso.
- **O vencimento da conta a pagar nasce como hoje.** Ao concluir a compra não há
  onde informar o prazo real ("30 dias", "15/10"), então o trigger usa a data do
  dia. Quem comprou sabe o prazo e corrige a conta no Financeiro. A saída é um
  campo de vencimento no laudo de compra (marcado com `ponytail:` no trigger).
- **O setor da compra continua vindo do cadastro da pessoa**
  (`user_metadata.department`), sem o solicitante escolher — e é esse setor que
  vira o centro de custo da conta. Metadado vazio deixa a conta a pagar **sem
  centro de custo** (coluna nula, não a palavra "Sem setor"), e ela fica de fora
  do teto de gasto por setor sem nada acusar. Inventar um setor seria pior.
  Estava no plano da L8 e ficou de fora: mexer nisso é mexer na abertura do
  chamado, que é o caminho mais usado do sistema.

**A auditoria da própria leva reprovou a primeira versão** e os achados viraram
a migration `20261009020000`. Vale registrar o que eles ensinam, porque é
padrão e não acidente:

- A chave composta `(coluna, tenant_id)` tem que ir em **todas** as colunas que
  apontam para outra tabela, não nas que a gente lembra. `approved_quote_id`
  ficou de fora, e por ela a conta a pagar de uma empresa nascia com o valor e o
  nome do fornecedor de outra — reproduzido no banco de teste antes de corrigir.
- Guard em `before update of status` deixa a porta do INSERT aberta — e fechar
  a porta **para um status só** deixa a do lado aberta: barrar `approved` no
  INSERT não barrava nascer já `completed`, que pula a aprovação inteira.
- Migration que corrige dado tem de poder rodar duas vezes **aqui**, porque 22
  arquivos deste repositório foram aplicados no teste por `apply_migration` do
  MCP, que carimba a data do momento em vez do prefixo do arquivo. Para essas,
  um `db push` é reaplicação. O conserto de raiz é `migration repair`, comando
  do dono, e não tornar cada arquivo idempotente um a um.
- Campo que justifica uma decisão precisa ser apagado quando a decisão é
  desfeita, senão a regra vale uma vez e depois é de graça.
- **Corrigir abre buraco novo.** A reauditoria reprovou a primeira correção:
  cancelar só a conta `pending` deixava viva a em atraso; `on conflict … do
  update … where cancelled` fazia a reconclusão com a conta **paga** virar um
  no-op silencioso (pedido R$ 1.200, Financeiro R$ 850 pagos); e o aviso novo
  mandava lançar a despesa à mão justamente quando ela já existia, porque a
  consulta filtrava `pending` e quem executa a compra pode nem ter o
  Financeiro para enxergar a conta. Os três estão corrigidos e cobertos por
  asserção; o que fica é o padrão: **lista vazia por RLS é indistinguível de
  lista vazia por não existir**, e nenhuma frase da tela pode depender disso.

### Diretoria

- ~~**A Conciliação afirma uma causa que os números negam**~~ — **CORRIGIDO
  em 2026-09-25**, no mesmo dia. O dono confirmou a regra que faltava: a
  SÉRIE da nota separa o que o CFOP sozinho não separa. Série 1 é com nota
  fiscal; série 75 é sem nota **e é cobrada do mesmo jeito** (cliente que
  prefere comprar assim). No mesmo par de CFOP de remessa gratuita
  (5910/6910), a série 1 é **publicidade** e a série 75 é **bonificação**
  (com o cashback dentro). A conciliação passou a mostrar as quatro caixas e
  duas diferenças — migration `20261026020000`, 8 asserções pgTAP.
  **Nenhuma reimportação foi necessária:** `serie` está gravada crua desde a
  primeira migration. O texto abaixo fica como registro do que se descobriu.

- **A Conciliação afirmava uma causa que os números negam (achado 2026-09-25).**
  A tela diz, com todas as letras: *"a planilha de metas conta a bonificação
  como faturamento; o painel não. Por isso os dois números diferem de
  propósito"* — e soma `venda líquida + bonificação` antes de comparar com o
  `metas_ano.total_realizado` informado pelo diretor.

  **Os sete meses informados de 2026 dizem o contrário.** O informado
  acompanha a VENDA SOZINHA, oscilando para os dois lados, e é MENOR que ela
  em quatro dos sete meses. Se a planilha somasse bonificação, o informado
  teria de ser ~R$ 300 mil maior todo mês:

  | Mês | Informado | Venda | Informado − venda |
  |---|---|---|---|
  | Jan | 311.254,03 | 381.202,89 | −69.948,86 |
  | Fev | 351.923,88 | 250.278,06 | +101.645,82 |
  | Mar | 501.150,49 | 264.552,29 | +236.598,20 |
  | Abr | 496.037,52 | 402.876,59 | +93.160,93 |
  | Mai | 384.930,57 | 456.904,41 | −71.973,84 |
  | **Jun** | 504.409,20 | **1.165.947,33** | **−661.538,13** |
  | Jul | 428.059,15 | 471.956,15 | −43.897,00 |

  É a soma da bonificação que FABRICA a diferença de R$ 3,1 milhões que a tela
  exibe. Sem ela, a diferença cai para algo entre R$ 44 mil e R$ 237 mil por
  mês — uma conversa possível — com **junho** como o único desencontro grande
  (R$ 661 mil). Junho não é importação duplicada: 237 notas distintas, 166 na
  INBRAS e 71 na MF, conferido no banco.

  **Não corrigido de propósito:** mudar o que a conciliação compara é regra de
  negócio, e regra de negócio é do humano (CLAUDE.md). Está com o dono desde
  2026-09-25. Enquanto ele não decide, a tela continua somando bonificação —
  e continua dizendo uma frase que os dados não sustentam. O texto explicativo
  sai junto com a fórmula, na mesma leva, para não ficar meia verdade na tela.

- **Nunca houve uma devolução em quatro anos — e isso é FATO, não lacuna
  (confirmado pelo dono em 2026-09-25).** Zero linhas com
  `classe = 'devolucao'` em 2023, 2024, 2025 e 2026, nas duas filiais.

  Levantei como suspeita de export incompleto — para uma indústria de
  cosméticos com R$ 3,4 milhões/ano, "nenhuma devolução" parecia improvável —
  e perguntei ao dono. Resposta: *"A terceira está correta, realmente nunca
  tivemos devolução nesses 4 anos."* Fica registrado para ninguém
  "consertar" isto depois achando que é buraco de importação.

  O classificador **sabe** reconhecer devolução (testado:
  `com_classe_do_cfop('1202')` e `('1411')` devolvem `devolucao`), e
  `valor_curva` já traz devolução com sinal negativo — no dia em que houver
  uma, a subtração acontece sozinha, sem tocar em nada.

  Consequência já aplicada: o rótulo **"venda líquida"** saiu da Conciliação
  (virou "venda com nota"/"total faturado"). Não há o que subtrair, e o nome
  fazia crer que havia.

- **A bonificação da INBRAS dobrou em 2026 e ninguém sabe por quê (achado
  2026-09-25).** Três anos estáveis — 38% (2023), 35% (2024), 36% (2025) da
  venda — e **77% em 2026**. Depois da separação por série ficou mais preciso:
  o salto é **bonificação série 75**, que foi de R$ 413.660 (2025) para
  R$ 2.261.087 (2026), 5,5×, enquanto a publicidade (série 1) ficou na faixa
  dela. Por filial: MF em 30%, INBRAS em 89%. Do total da série 75 em 2026,
  R$ 170.560 é cashback apurado pelo sistema — os outros R$ 2.090.527 são
  bonificação pura. Separando por filial: a MF continua em ~35%; a
  INBRAS está entre 70% e 120%, e em junho deu mais do que vendeu.

  Não é erro de classificação: são os CFOPs 5910/6910, "remessa em
  bonificação, doação ou brinde", que é o código correto — o Forteplus emitiu
  assim. Está espalhado por clientes reais, vários recebendo muito mais do que
  compram (AMIL COSMETICOS: R$ 248.555 de bonificação contra R$ 25.928 de
  venda; ITALO MEDICE: R$ 90.320 contra R$ 19.549).

  As duas leituras possíveis — política comercial nova, ou nota saindo com
  CFOP errado — **são indistinguíveis pelo dado**. Pergunta aberta com o dono
  desde 2026-09-25. Consequência prática: qualquer farol de bonificação
  construído antes da resposta pode estar destacando um número que não
  significa o que parece.

- **A leva foi entregue sem o insumo que a fundamentaria.** O plano da Fase 3
  lista "o painel diretor feito em outra conversa" como insumo 3, e ele nunca
  chegou. O que existe hoje é o **mínimo que os dados permitem**: objetivos da
  empresa e chamados por setor. Quando o painel de referência aparecer, é
  provável que metade disto mude de forma — e isso é esperado, não retrabalho
  por engano.
- **Não há nada de venda na tela.** O CRM tem `useSalesMetrics` (faturamento,
  conversão por etapa), e juntar venda e chamado numa visão só é decisão do
  dono, não minha: são duas leituras de negócio diferentes na mesma página.
- **O período é fixo em 7 / 30 / 90 dias.** Sem intervalo personalizado e sem
  comparação com o período anterior — "melhorou ou piorou?" é a pergunta que um
  diretor faz primeiro, e a tela ainda não responde.
- **A satisfação do chamado não entra.** `tickets.satisfaction_rating` existe e
  é lida por `useHelpdeskMetrics`; no painel da Diretoria ficou de fora porque,
  sem uso real, a média de duas avaliações diria mais sobre o acaso do que
  sobre o atendimento.
- **Sem pgTAP, de propósito**: a leva não criou regra de banco nenhuma — a tela
  só lê. A migration mexe em `plan_config`, que é configuração. Já os dois
  filtros de módulo corrigidos (`useTechnicianPerformance`, `useTopRequesters`)
  **ficaram sem prova automatizada**: são lógica de consulta ao Supabase, que o
  Vitest deste repositório não alcança, e não há regra de banco para o pgTAP
  segurar. Provado à mão contra o `test-helpoint`.
- **O número de "atrasados" conta só o que tem prazo.** Chamado sem política de
  SLA configurada nunca aparece como atrasado, por mais antigo que seja. Isso é
  deliberado, e significa que o indicador mede a política tanto quanto o
  atendimento. ~~E conta só o que foi **criado dentro da janela**~~ — esse
  segundo recorte era defeito, não decisão, e foi corrigido na auditoria: em
  "últimos 7 dias" o painel chegava a dizer "nenhum chamado no período" com sete
  vencidos em aberto na empresa. Hoje **abertos e atrasados são do agora** e
  resolvidos/prazo/tempo são do período, e a tela diz isso.
- **Sem `limit` na consulta.** O PostgREST corta em 1000 linhas e todas as
  colunas encolhem **sem erro** — é a armadilha já catalogada no Financeiro
  ("número errado, não página lenta"). Com ~11 chamados por dia, a janela de 90
  dias encosta nisso. Marcado com `ponytail:` no código, com a saída: quando o
  volume chegar perto, a conta vira função SQL que agrega no banco.
- **`goals` só é filtrada por `cancelled` aqui.** Objetivo `done` continua no
  painel, e objetivo com `end_date` no passado também — a tela de Metas tem o
  mesmo comportamento, e decidir o que "encerrado" esconde é do dono.
- **Quem vê o painel:** concessão do módulo **mais** cargo de gestor
  (`RequireDiretoria`). Não é o padrão dos outros módulos, que só escondem o
  item do menu — aqui a URL precisava de tranca porque a RLS de `tickets` mostra
  a cada papel um conjunto diferente: um `viewer` somaria os próprios chamados e
  a tela os rotularia como sendo da empresa inteira.

### Transversal (achado na auditoria da L5)

- **Três mapas de módulo, e o que a tela renderiza não era o público.**
  `ALL_MODULES`/`MODULE_LABELS` em `@/types/database` é a lista oficial — e
  `UserModulesEditor`, que é o **único** lugar do sistema que grava
  `user_module_access`, tinha a própria cópia local. Módulo novo entrava na
  lista oficial, entrava em `plan_config.available_modules` por migration, e
  **não aparecia para conceder**. Foi o que aconteceu com a Diretoria: a
  migration existia, o botão não. Corrigido em 2026-09-17 — o editor importa o
  mapa oficial, e a terceira cópia (em `InviteUserDialog`, que era código morto)
  saiu. Se alguém criar uma quarta, o defeito volta.
- **`useUserModules` engole erro do banco** (`console.error` e `return []`, três
  hooks). É a regra 1 das cinco no lugar mais caro possível: falha de RLS vira
  "este usuário não tem módulo nenhum", indistinguível do caso legítimo — foi
  assim que o RH ficou meses quebrado. E `queryKey: ['my-modules', user?.id]`
  não leva `tenantId` (regra 3). **Aberto.**
- **`src/pages/Metas.tsx` não filtra `goals.status`**: objetivo cancelado
  continua na tela como se estivesse valendo. **Aberto** — no painel da
  Diretoria o cancelado já é escondido.

### Marketing

- ~~`tenant_id` sem trigger em 6 tabelas (§5.6)~~ — **fechado em 2026-09-17**.
  Conferido no banco do teste em 2026-09-04 e aberto por treze dias:
  `mkt_suppliers`, `mkt_quotations`, `mkt_social_accounts`,
  `mkt_ai_generations`, `mkt_assets` e `mkt_social_account_secrets` tinham
  `tenant_id NOT NULL` sem `DEFAULT` e sem `inject_tenant_*`, e nenhum hook de
  criação envia o campo — então *criar fornecedor* e *criar item de inventário
  MKT*, dois fluxos com tela viva, **falhavam no INSERT desde sempre**.
  `mkt_social_accounts` foi fechada na CRM-4c (migration `20261005020000`),
  quando o Lead Ads tropeçou nela; as quatro com tela ganharam o trigger na
  `20261007010000`, provado em `dividas_das_auditorias.test.sql`.
  `mkt_social_account_secrets` fica de fora de propósito: só a chave de serviço
  escreve nela, e sempre com o `tenant_id` explícito.
- ~~**Conectar uma página do Facebook nunca funcionou**~~ — **consertado em
  2026-09-15**, mesma migration. `mkt-meta-oauth` gravava com a credencial de
  quem estava logado, e as duas escritas eram impossíveis assim: a conta caía no
  `tenant_id NOT NULL` acima (23502) e o cofre `mkt_social_account_secrets` tem
  RLS ligada **sem policy nenhuma** (42501). As duas tabelas estavam com zero
  linhas no teste. Ou seja: publicar post, ler métrica e receber lead de anúncio
  nunca saíram do lugar, porque nenhuma conta chegou a existir. Agora a função
  grava com a chave de serviço, e o que a RLS garantia passou a ser conferido no
  código: o cargo (`is_supervisor_or_higher`) e a dona da página. **O que ainda
  não foi exercitado contra a Meta de verdade continua sem prova** — só o
  caminho de banco está provado.
- ~~Qualquer gestor reivindicava qualquer página do Facebook~~ — **fechado em
  2026-09-15**, mesma migration. As policies de `mkt_social_accounts` só
  conferiam tenant e cargo, e `page_id` é texto livre: como é o `page_id` que
  diz de quem é um lead de anúncio (CRM-4c), quem inserisse a linha primeiro
  ficava com os leads da página alheia. Agora `page_id` só é escrito pela chave
  de serviço, depois de a Meta confirmar no OAuth quem administra a página.
  Provado em `lead_ads_do_facebook.test.sql`.

### Comercial

- **Portão por etapa × apagar etapa e importar planilha** (CRM-1b, 2026-09-10).
  `crm_delete_stage` move os negócios para a etapa de destino como escrita do
  usuário, então se o destino exige campo que algum negócio não tem, o gerente
  vê "para entrar em X falta preencher: …" ao apagar a etapa — a mensagem não
  diz qual negócio. Na importação (`crm_import_rows`), planilha mapeada para
  etapa com portão gera um erro por linha, em português, sem derrubar o lote —
  mas `ComercialImportar` não avisa disso antes de importar. Nenhum dos dois
  está errado; falta dizer qual negócio e avisar antes.
- **`crm_setup` responde com erro cru do Postgres** para entrada malformada
  que a tela não produz (elemento sem `percent` numérico, por exemplo). Só
  vale para quem chamar a RPC à mão.
- **Status `expired` do pedido nunca é gravado** (CRM-1c, 2026-09-11): o CHECK
  o aceita e o rótulo "Link vencido" existe, mas nada o escreve — o link do
  Stripe vence sozinho e a proposta mostra "vencida" pela data, sem mudar o
  status. Entra quando houver quem precise filtrar por ele.
- **Modelos de fluxo (CRM-1d, 2026-09-12), ressalvas do auditor:** (a) `refresh` num
  passo lê o registro de novo, mas registro **apagado** entre a espera e o
  refresh mantém a cópia do disparo — a condição passa e a tarefa de follow-up
  nasce para um negócio que não existe; (b) "Usar um modelo" cria os dois
  fluxos do cadastro em duas escritas — se a segunda falhar, o primeiro fica
  ativo sozinho (hoje os dois são válidos por construção, Vitest prova);
  ~~(c) a frase do fluxo na aba do Comercial mostra a categoria do chamado da TI
  como uuid (a lista de categorias da aba é a do módulo aberto)~~ — **resolvido
  em 2026-09-12** (ADR-009): o passo "abrir chamado" carrega as categorias do
  módulo escolhido nele, não as do módulo do fluxo; (d) a conta a
  receber nasce com `created_by` = quem criou o fluxo, não o vendedor.
- **Webhook do Stripe × pedido cancelado**: desde a CRM-1c o banco recusa
  `cancelled → paid`; um link antigo ainda válido no Stripe, pago depois do
  cancelamento, faz o webhook falhar (o Stripe tenta de novo e desiste). O
  dinheiro entra, o pedido fica cancelado, e ninguém é avisado — cancelar um
  pedido deveria expirar a sessão no Stripe. Ficou de fora também da CRM-2a: o
  mesmo vale para a Yampi (cancelar o pedido não desativa o link nem o cupom lá).
- **CRM-2a (2026-09-12), ressalvas conhecidas:** (a) a Yampi não aceita preço por
  item no link — o preço da tabela vira cupom de valor fixo; se o preço nosso
  for **maior** que o da loja, o link sai pelo preço da loja e a tela só avisa;
  (b) produto do pedido sem `sku` igual ao da Yampi não entra no link (a função
  recusa e diz quais); (c) o webhook da Yampi sem cupom no aviso casa o pedido
  pelo e-mail/CPF do cliente com o último pedido aberto — dois pedidos abertos
  do mesmo cliente podem trocar; (d) **gerar o link na Yampi** ainda não foi
  exercitado com uma loja real (as chaves são do dono) — só o contrato da API
  documentada; o **webhook** foi provado ao vivo com um aviso simulado e
  assinado (`scripts/yampi-webhook-simular.mjs`: assinatura errada → 400,
  certa → pedido #1 pago, repetido → `duplicate`, empresa sem chave → 503) e
  a aba Pagamento com "Remover" pelo dono; a dúvida que só a loja real tira:
  se o `GET` de um SKU ou de um pedido na Yampi vier **sem** o envelope
  `data`, o segundo link do mesmo produto falha — o código aceita os dois
  formatos onde a documentação mostra, e no resto assume `data`;
  (e) o Stripe ainda não tem "Conectar com Stripe" (Connect) — a empresa cola a
  chave e registra o webhook à mão no painel dele.
- **Expedição (EXP-1, 2026-09-12), ressalvas conhecidas:** (a) **um depósito
  só** — o saldo é por empresa e por lote, sem prateleira nem filial;
  ~~(b) a etiqueta é digitada~~ — **os três conectores entraram na ENC-1**
  (2026-09-12); continua digitado só o rastreio de quem não usa conector nenhum;
  (c) a entrada de estoque é à mão — não nasce de uma compra nem de produção;
  (d) **separação não reserva estoque**: dois pedidos do mesmo produto podem
  ser separados ao mesmo tempo, e o segundo descobre a falta na hora de bipar,
  com a frase dizendo quanto o lote tem (o saldo **não** fica negativo: a
  bipagem confere o saldo com a linha do lote travada); (e) quem lança um
  **ajuste** para baixo pode deixar o saldo negativo de propósito, para a
  contagem refletir a prateleira, e nada avisa; (f) quem tem o módulo pode
  lançar entrada e ajuste sem limite — inflar estoque é confiança no time, não
  há aprovação; (g) desfazer uma separação devolve tudo ao estoque, mas
  **pedido já despachado não se desfaz** pela Expedição.
- **Nota fiscal pela Focus NFe (ENC-3, 2026-09-13), ressalvas conhecidas:**
  (a) **não foi exercitada com conta real** — o formato do corpo e os caminhos
  vieram da documentação da Focus; o teste com certificado de verdade fica para
  o fim, junto com os outros; ~~(b) o Helpoint não recebe o aviso de quando a
  SEFAZ autoriza~~ — **entrou em 2026-09-13** (ENC-3b): o gatilho é cadastrado
  na Focus ao ligar o conector, e a nota se resolve sozinha; o botão "Atualizar
  situação" fica como saída manual se o aviso não chegar;
  (c) **cancelar a nota não existe** na
  tela, e cancelar o pedido no Helpoint não cancela a nota; (d) a nota leva os
  itens, o frete e o desconto do pedido, e **um CFOP só** (o do produto, ou o
  padrão da empresa) — venda para fora do estado precisa de CFOP diferente e
  hoje isso é escolha manual no produto; (e) o CST do ICMS assume `102`
  (Simples Nacional sem crédito) quando o produto não tem o seu — empresa fora
  do Simples precisa preencher produto a produto; (f) substituição tributária,
  IPI, PIS e COFINS destacados não são preenchidos; (g) a série e a numeração
  são da Focus: o Helpoint não controla a sequência.

  Corrigido na auditoria do mesmo dia, antes do merge: a renomeação de
  `bling_error` para `nfe_error` tinha deixado **o caminho do Bling quebrado**
  (o conector escrevia numa coluna que não existia mais, e o passo de fluxo
  nunca concluía); a data de emissão ia em UTC, e das 21h à meia-noite a SEFAZ
  recusaria por emissão adiantada; nota **recusada** não podia ser emitida de
  novo, que é justamente quando se corrige o cadastro e tenta outra vez; a
  reserva antes do envio não reservava nada, então o vendedor clicando e o fluxo
  rodando ao mesmo tempo podiam mandar duas; e a escolha do conector era
  respeitada só pela tela, não pelo servidor.
- **Lead Ads do Facebook (CRM-4c, 2026-09-13), ressalvas conhecidas:** (a)
  **nada foi exercitado com a Meta de verdade** — o formato do webhook
  (`leadgen`), o da leitura do lead (`/{leadgen_id}?fields=field_data`) e o da
  lista de formulários (`/{page_id}/leadgen_forms`) vieram da documentação da
  Graph API v21; (a2) **o webhook `leadgen` é por aplicativo, não por empresa**:
  o Helpoint tem um aplicativo da Meta só (o mesmo do OAuth do Marketing), e é
  o `META_APP_SECRET` do ambiente que assina o corpo. A chave por empresa
  continua valendo para quem trouxer o próprio aplicativo, mas esse caminho
  ainda não foi percorrido por ninguém — o webhook aceita a assinatura de
  qualquer uma das duas chaves, porque exigir só a da empresa fazia o lead de
  quem colou uma chave própria ser recusado em silêncio; (b) **a página tem de
  ser reconectada em Marketing** depois desta leva, por dois motivos: o escopo
  `leads_retrieval` só passou a ser pedido agora, e é a reconexão que faz a
  página **instalar** o aplicativo (`POST /{page-id}/subscribed_apps`) — sem
  isso ela está conectada e não manda lead nenhum, sem erro em lugar nenhum. A
  aba Lead Ads avisa, por página, qual delas está nesse estado; (b2) **desligar
  o Lead Ads descarta o lead que chegar**,
  e o Facebook não reenvia depois — a tela avisa, mas não há fila de espera;
  (c) **o formulário não se cria pelo Helpoint** — ele nasce no Gerenciador de
  Anúncios; aqui se diz para onde o lead cai; (d) **não há destino padrão, de
  propósito** (decisão do dono): formulário sem funil escolhido retém o lead em
  vez de inventar lugar, e a tela mostra os retidos; (e) a lista de retidos
  mostra **200 por vez**, o que numa base grande esconde os mais antigos; (f)
  **não há aviso quando um lead fica retido** — ninguém é notificado: quem não
  abrir Configurações do CRM → Lead Ads não descobre que há lead esperando; (g)
  **o conteúdo do lead não volta a ser buscado sozinho** quando a Graph API
  falha: o "Tentar de novo" reaplica o que já está guardado, mas não repete a
  chamada à Meta — um lead que chegou vazio continua vazio, e o sistema se
  recusa a transformá-lo em contato (senão cada clique criaria um "Lead do
  anúncio" sem e-mail nem telefone); (h) **a página do Instagram não entra** —
  só formulários de página do Facebook.
- **Mensagem-modelo e reengajamento (CRM-4b, 2026-09-13), ressalvas
  conhecidas:** (a) **nada foi exercitado com a Meta de verdade** — o formato
  do catálogo (`/{waba_id}/message_templates`) e o do envio por template vieram
  da documentação da Graph API v21; (b) **os modelos não se escrevem pelo
  Helpoint** — foi decisão do dono: escrever é no painel da Meta, aqui só se
  lista e usa; (c) **a sincronização é manual**, por botão: ninguém busca da
  Meta sozinho, então um modelo recém-aprovado só aparece depois que alguém
  clica; (d) **só o corpo do modelo é tratado** — cabeçalho, rodapé e botões
  vêm da Meta e são guardados, mas o envio preenche apenas as lacunas do corpo,
  e modelo com variável no cabeçalho ou botão falhará; (e) **não há teto de
  gasto nem aviso de custo** — cada envio é cobrado pela Meta e nada no sistema
  soma isso nem trava ao passar de um valor; (f) o gatilho do lead frio varre
  **200 negócios por tique** por fluxo, o que é de propósito (não afogar a
  Meta), mas numa base grande a primeira varredura leva vários minutos para
  alcançar todo mundo; (g) **não há como cancelar um disparo** já enfileirado;
  (h) o reengajamento pega negócio em **etapa aberta** — quem está em "Ganho"
  ou "Perdido" fica de fora, que é o certo, mas não há como reengajar um
  perdido de propósito; (i) ~~o dedupe é por fluxo, não por cliente~~ —
  **resolvido em 2026-09-13** a pedido do dono: `crm_modelo_bloqueado_ate()`
  garante **uma mensagem-modelo por cliente a cada 7 dias**, venha do fluxo que
  vier. Vale para o automático; o vendedor mandando à mão é **avisado e passa**,
  porque quem está com o cliente na mão sabe o que a regra não sabe. O que a
  trava não cobre: **um mesmo fluxo disparando modelos diferentes** para o mesmo
  cliente em sequência dentro de uma execução — não acontece com os passos de
  hoje, mas nada impede.

  Corrigido na auditoria, antes do merge (migration `20261002030000`): **a
  metade automática da leva não rodava.** O passo `whatsapp_template` tinha sido
  costurado em `automation_validate_flow` — que aceita o desenho — e **não** em
  `automation_run_step`, que executa: o fluxo salvava, aparecia no editor, e
  morria no primeiro tique com "tipo de passo desconhecido"; como o run nunca
  chegava a `waiting`, o `case` novo do worker era **código inalcançável**. E as
  lacunas **não eram preenchidas**: `automation_render_config` só trocava
  `{{campo}}` em strings de primeiro nível, e as lacunas são um array — o
  cliente receberia `{{trigger.contact.name}}` literal numa mensagem cobrada,
  justamente o campo que a tela sugere digitar. Faltava ainda o contato no
  contexto do gatilho (esse campo daria vazio mesmo com o array renderizado).
  Também: `dias` fora do formato **derrubava o tique de todas as empresas** a
  cada minuto (a exceção subia e abortava schedule, prazo, retomada e limpeza);
  duas execuções simultâneas colidiam em `automation_fired` e perdiam o tique
  inteiro; a sincronização com lista vazia **apagava o catálogo todo**; e a
  varredura avaliava duas subconsultas para cada negócio aberto da empresa, a
  cada minuto, sem pré-filtro indexável.

  **As 17 asserções ficaram verdes com tudo isso presente** porque provavam que
  o validador *aceita* o passo e disparavam o fluxo com `add_note`. É o "um
  comando verde prova que o comando passou" do `CLAUDE.md` em estado puro. O
  teste agora **roda** o passo: exige que o run chegue a `waiting` com
  `pending_kind`, e que as lacunas cheguem ao worker já trocadas pelos valores.
- **WhatsApp (CRM-4a, 2026-09-13), ressalvas conhecidas:** (a) **nada disso foi
  exercitado com a Meta de verdade** — não há conta Business verificada nem
  número registrado; os endereços, o formato do corpo do webhook e os nomes dos
  campos vieram da documentação da Graph API v21, e o teste com conta real fica
  para o fim, junto com os outros; (b) **não dá para iniciar conversa**: fora da
  janela de 24 h a Meta exige mensagem-modelo aprovada, que é a CRM-4b — a tela
  diz isso em português, mas quem precisa retomar um cliente hoje usa o celular;
  (c) **o anexo não é baixado** — a Meta manda um identificador de mídia e o
  sistema guarda só ele, então foto e documento aparecem como "[image]" e não se
  abrem; (d) **não há aviso no sino** quando chega mensagem: ela entra no
  negócio e espera alguém abrir; (e) **não há lista de conversas** — para achar
  uma, passa-se pelo negócio; (f) o texto que sai **não é registrado na linha do
  tempo** do negócio (`crm_deal_activities`), só na conversa: quem lê só a
  história não vê que houve troca de mensagens; (g) **um número por empresa** —
  quem tem dois números de atendimento ainda não é atendido; (h) a mensagem de
  desconhecido vira lead sozinha, e isso vale para **engano e spam** também.

  Corrigido na auditoria, antes do merge (migration `20261001020000`): **a
  função de ligar o WhatsApp não compilava** — um `??` misturado com `||` sem
  parênteses, que é erro de sintaxe e não de tipo; o módulo inteiro não subiria,
  e a tela desenhava "sem número ligado" do mesmo jeito, porque falha de boot e
  "não conectado" eram a mesma tela. **A conversa de um estranho caía no
  cadastro de um cliente**: o casamento por telefone comparava os dez últimos
  dígitos, e dez cortam o país *e o primeiro algarismo do DDD* — o fixo `(19)
  8888-7777` e o celular de BH `5531988887777` viravam a mesma chave, e a
  resposta do vendedor passaria a ir para o número do estranho. **Duas entregas
  simultâneas abriam dois negócios** (o `on conflict` dedupava a mensagem, não o
  negócio) — agora há trinco por empresa e número. A função **deixou de receber
  a empresa pronta** e passa a resolvê-la pelo número de destino, para nenhum
  chamador poder errar. `authenticated` ainda tinha INSERT/UPDATE/DELETE em
  `crm_messages` (só a ausência de policy segurava). O webhook distinguia
  "número desconhecido" de "assinatura inválida" nas respostas, o que permitia
  descobrir por tentativa quais números estão ligados ao Helpoint. E a janela de
  24 h era contada por negócio na tela e por contato no servidor — cliente que
  fechava uma venda e voltava a escrever ficava com a caixa trancada.

  **A causa de tudo isso passar:** `supabase/functions/` não passava por portão
  nenhum — o `tsconfig` inclui só `src`, e o eslint também. Agora passa:
  `scripts/edge-sintaxe.mjs` roda no CI junto com lint, testes e build, e faz o
  parse de todos os 54 arquivos sem resolver import nenhum (sem rede, sem Deno).
  Foi conferido que ele pega **exatamente** o erro que escapou, reintroduzindo-o
  de propósito. **O que continua sem portão são os tipos** das edge functions: o
  `deno check` cobriria isso, mas falha ao resolver tipos transitivos de
  `esm.sh` que apontam para um `node_modules` que não existe no CI — ruído de
  infraestrutura, não defeito nosso. Fica como dívida conhecida.
- **Projetos (OKR-2, 2026-09-13), ressalvas conhecidas:** (a) **o objetivo das
  Metas não mostra os projetos que servem a ele** — a ligação existe e aparece
  no projeto, mas a tela de Metas ainda não lista o caminho de volta; com
  projeto fechado, essa lista mostraria só o que a pessoa participa, e isso
  precisa ser pensado antes de existir; (b) **gestor comum não vê projeto
  nenhum** de que não participe — é o pedido do dono (projeto fechado), e é uma
  linha de policy para virar se ele mudar de ideia; (c) **não há subprojeto nem
  dependência entre tarefas** (`parent_task_id` não existe); (d) **não há aviso
  de projeto atrasado** — a tela pinta o prazo vencido em vermelho, mas nada
  chega ao sino nem por e-mail; (e) **arrastar só muda de coluna**, não reordena
  dentro dela: a coluna `position` existe e é numérica para isso, e a tela
  ainda só empurra o cartão para o fim; (f) **não há cronograma nem marcos** —
  projeto tem começo e prazo, e nada entre os dois; (g) o painel diário mostra
  "Projeto" como tipo de demanda desde antes desta leva, mas `useAISecretary`
  ainda devolve lista vazia: **o quadro não alimenta o painel da Lyra**.

  Corrigido na auditoria, antes do merge (migration `20260930030000`): **um
  funcionário comum não conseguia criar projeto nenhum** — `.insert().select()`
  vira `INSERT ... RETURNING`, e com RETURNING o PostgreSQL aplica a policy de
  SELECT já no insert, antes do trigger que tornava o projeto visível; deu 42501
  para todos que não são dono ou administrador (virou a regra 11 do pgTAP no
  `CLAUDE.md`). Também: o dono da empresa via o quadro e **não podia arrastar
  nada** nele (a exceção de administrador tinha ficado pela metade); as quatro
  policies de `tasks` perderam o `to authenticated` na reescrita, e `tasks`
  nunca tivera `revoke … from anon`; `project_visivel` respondia sem olhar a
  empresa; passar o projeto adiante deixava o novo dono de fora dele; editar um
  cartão **rebaixava para média** a prioridade de uma tarefa urgente vinda de
  chamado; concluir pelo diálogo não marcava a hora, e a tarefa não contava em
  relatório nenhum; `tasks.user_id` aceitava gente de outra empresa; e o cartão
  mostrava "sem dono" para quem tem dono que saiu do projeto.
- **Metas (OKR-1, 2026-09-13), ressalvas conhecidas:** (a) **o número é
  digitado, sempre** — a conta automática a partir do que o sistema já sabe
  (chamados no prazo, vendas do mês, conversão do funil) foi decidida com o dono
  e ainda **não existe**; as colunas `goals.source_kind` e `source_config` já
  estão no banco e **ninguém as lê**; (b) **ninguém lembra a pessoa de lançar o
  número** — não há aviso no sino nem por e-mail quando o mês vira e o indicador
  ficou sem medição; (c) as faixas do farol são fixas no código da tela (bateu =
  verde, 80% ou mais = amarelo, abaixo = vermelho) e **não se configuram por
  empresa**; (d) o histórico aparece como **lista, não como gráfico** — dá para
  ver os números, não a curva; (e) **não há projeto/iniciativa ligado ao
  objetivo** (é o passo seguinte da leva); (f) **não há mapa estratégico nem as
  perspectivas do BSC** (financeira, clientes, processos, pessoas) — o Scopi tem,
  o Helpoint ainda não; (g) são **dois níveis e só dois**: objetivo e o que se
  mede embaixo dele, sem objetivo dentro de objetivo; (h) **não há fechamento de
  ciclo** — nada arquiva o trimestre e abre o próximo copiando o que ficou de pé.

  Corrigido na navegação real, minutos depois da primeira tela: o indicador
  recém-criado nascia com valor **zero**, e como zero é um número como outro
  qualquer, "chamados no prazo, de 80% para 90%" aparecia como **-800%** e farol
  vermelho antes de qualquer medição. "Ainda não medi" não é "medi e deu zero" —
  o valor agora começa nulo (migration `20260929020000`), e apagar a última
  medição devolve o indicador para "não medido" em vez de para zero.

  Corrigido na auditoria, antes do merge (migration `20260929030000`): **a troca
  entre OKR e indicadores não funcionava para ninguém** — faltou o invólucro
  `metas_set_config`, e como `tenant_set_config` está revogada do navegador
  desde que nasceu, o dono clicava e levava "fale com um gestor"; **mover uma
  medição de um indicador para outro** deixava a origem exibindo o número velho
  sem medição por trás; o valor da meta **podia ser digitado direto na linha**,
  sem número lançado; o botão de lançar aparecia para quem a política recusa; e
  o `anon` ainda tinha `select` em `goals`, herdado de antes da armadilha das
  default privileges ser conhecida.
- **Reunião pelo negócio (CRM-3b, 2026-09-13), ressalvas conhecidas:** (a) o
  **convite por e-mail não sai nesta instalação** — o envio de e-mail ainda não
  está configurado (`docs/ambientes.md`), então a tela avisa e a reunião fica
  marcada do mesmo jeito; (b) a reunião **não vira convite de agenda de
  verdade** (arquivo `.ics` ou convite do Google): é um e-mail com data e hora,
  e o cliente marca na agenda dele à mão; (c) **remarcar e cancelar** só pela
  Agenda, e isso **não** volta para a linha do tempo do negócio, que continua
  mostrando o horário de quando foi marcada; (d) não há aviso de choque de
  horário — marcar duas reuniões na mesma hora é possível; (e) a reunião é do
  vendedor que marcou: participante a mais não existe.
- **Cobrança pelo Asaas (ENC-2, 2026-09-13), ressalvas conhecidas:** (a) **não
  foi exercitada com conta real** — os endpoints e o formato dos corpos vieram
  da documentação do Asaas; o teste com conta de verdade fica para o fim, junto
  com os outros; (b) **estorno e chargeback não desfazem a venda** — o aviso
  chega e fica registrado em `crm_payment_events`, mas o pedido continua "pago"
  e a Expedição já pode ter despachado; desfazer é decisão de negócio e ainda
  não foi tomada; (c) o valor cobrado é o total do pedido e não se confere
  contra o valor que voltou no aviso — pagamento parcial ou cobrança editada no
  painel do Asaas marca "pago" do mesmo jeito; (d) a cobrança é uma por pedido:
  parcelamento, assinatura, desconto por antecipação e multa por atraso são do
  Asaas e o Helpoint não pede nada disso; (e) cancelar o pedido no Helpoint
  **não** cancela a cobrança no Asaas; (f) o cliente precisa ter CPF ou CNPJ —
  o Asaas exige, e sem isso a tela recusa antes de chamar; (g) trocar a forma de
  pagamento ou o vencimento depois de a cobrança existir não muda nada: o mesmo
  link volta, e a tela avisa que a escolha nova foi ignorada.

  Corrigido na auditoria do mesmo dia, antes do merge: dois cliques simultâneos
  criavam **duas cobranças** para o mesmo pedido (a linha agora é reservada
  antes de falar com o Asaas, como na etiqueta), e a resposta perdida no meio
  criava outra na tentativa seguinte (agora a cobrança é procurada pelo número
  do pedido antes de qualquer nova). A tela também prometia um token de aviso
  que o servidor não sorteava de novo — hoje **o Helpoint registra o aviso no
  Asaas sozinho** (`POST /v3/webhooks`, como já fazia na Yampi), o token nunca
  passa pela tela, e remover o provedor remove o aviso lá.
- **Etiqueta (ENC-1, 2026-09-12), ressalvas conhecidas:** (a) **nenhum dos três
  conectores foi exercitado com conta real** — Bling e Yampi seguem a
  documentação (o endpoint de etiqueta do Bling e o recurso de etiquetas do
  pedido na Yampi), e o caminho dos Correios segue o manual do CWS; o teste com
  contrato de verdade fica para o fim, junto com os outros; (b) o rótulo dos
  Correios é assíncrono e o Helpoint espera até doze segundos por ele — se
  demorar mais, a tela pede para tentar de novo, e **tentar de novo reimprime o
  mesmo objeto** (o código do objeto é gravado antes de o PDF ser baixado, e a
  linha da separação fica reservada enquanto a pré-postagem está sendo criada);
  (c) resta **uma** janela em que duas postagens nascem: se a chamada aos
  Correios criar a pré-postagem e a resposta se perder antes de o Helpoint ler o
  código do objeto, a próxima tentativa cria outra. A API deles não tem chave de
  idempotência, então isso não se fecha pelo código — quem vir dois objetos para
  o mesmo pedido cancela um no portal dos Correios; (d) peso é por produto, em
  grama; produto sem peso faz a etiqueta sair com o mínimo **e a tela avisa**;
  (e) o pedido não tem endereço próprio: a etiqueta usa o endereço do
  **contato**, então cliente que recebe em mais de um lugar precisa de um
  contato por endereço — endereço por pedido entra quando alguém pedir.

  Corrigido na auditoria do mesmo dia, antes do merge (migration
  `20260921020000`): a pré-postagem duplicava a cada clique (não havia guarda no
  caminho dos Correios, porque a guarda olhava só o link, que ali nunca existe);
  o endereço de entrega não existia no cadastro de contato e a etiqueta saía sem
  CEP; e "Testar conexão" gravava antes de testar, então um código de acesso
  errado derrubava o contrato que já funcionava.
- **CRM-2b (2026-09-12), ressalvas conhecidas:** (a) o caminho Bling **não foi
  exercitado com uma conta real** — o app Helpoint ainda não está registrado no
  portal do Bling (`BLING_CLIENT_ID/SECRET`), então "Conectar com Bling" responde
  `bling_not_configured`; o que está provado é o contrato do OpenAPI público
  (endpoints e campos) e o motor (pedido pago → run esperando o worker no passo
  `bling_order`, ao vivo no teste); (b) as formas das respostas seguem o OpenAPI
  público (`gerar-nfe` → `{ idNotaFiscal }` sem envelope; contato/pedido → `{
  data: { id } }`; `GET /nfe/{id}` → `data.chaveAcesso`/`linkDanfe`) — a
  auditoria pegou o código lendo `data.id` da nota, o que geraria uma nota nova
  a cada tentativa; agora o id da nota é gravado antes de transmitir e o pedido
  já lançado é reencontrado pelo `numeroLoja` (HP-nº); se o Bling real divergir,
  o passo grava `nfe_status = 'error'` com a mensagem e o fluxo tenta de novo
  (`retry: 2` no modelo); (b2) o worker (a cada minuto) e a tela podem renovar o
  mesmo refresh token na mesma janela de 5 min — o segundo recebe `invalid_grant`
  e o retry salva (teto conhecido); (b3) as migrations desta leva (e da 2a) foram
  aplicadas ao `test-helpoint` pelo MCP com versão própria, não pelo nome do
  arquivo — `supabase db push` tentaria reaplicar (`docs/deploy.md` explica o
  `migration repair`); (c) a forma de pagamento do
  pedido no Bling é uma só, escolhida na aba Nota fiscal — pedido pago por Pix e
  por cartão entram com a mesma; (d) o Bling exige `numeroDocumento` válido para
  gerar NF-e — contato sem CPF/CNPJ no Helpoint lança o pedido e a nota falha
  no Bling com a mensagem dele; (e) o token vence em 30 dias sem uso e a tela
  só avisa pela data — não há aviso no sino.
- **O painel do dono, gerado por fora até a leva L6a, tem um defeito de
  acento — e é o que justifica o teste de codificação do importador novo.**
  A tabela de preço `SALÃO REF` aparece como `"SAL O REF"` dentro do
  `D.tabelas` do HTML que o dono usava (o CSV de clientes do Forteplus é
  Windows-1252 sem BOM, e quem gerava o painel lia como UTF-8). Não é erro do
  Helpoint — é do processo anterior — mas o Painel Comercial (`src/lib/
  comercial-import.ts`, `lerCadastroClientes`) tem que ler certo onde o
  processo antigo errava: tenta UTF-8 estrito primeiro, cai para
  Windows-1252 quando ele lança. Provado com um nome acentuado de verdade em
  `comercial-import.test.ts`.
- **O seletor de série cobre `1` e `75`; uma série nova aparece na tabela, não
  no filtro.** `com_vendas_itens.serie` é texto livre vindo do arquivo, sem
  `check` no banco — uma série `2` futura seria gravada normalmente e
  rotulada "Série 2" na tabela mensal (correção da auditoria de 2026-09-21,
  item 9: antes disso, qualquer valor diferente de `'75'` virava "Série 1" na
  tela, mentindo), mas o Select de filtro (`ComercialPainel.tsx`) continua
  fixo em "Série 1" / "Série 75" / "As duas séries" — não há como filtrar só
  pela série nova. Corrigir isso exige derivar as séries existentes do banco,
  do mesmo jeito que o item do seletor de ano (`com_anos_com_venda`) fez para
  ano; ninguém pediu ainda porque os arquivos do dono só têm `1` e `75`.
- ~~**A fixture de `comercial-import.test.ts` não cobre o rodapé "Totais:" do
  Forteplus**~~ — achado da auditoria de 2026-09-21 (item 8), **fechado no
  mesmo dia**. A auditoria mutou o catch-all do leitor
  (`comercial-import.ts`, o `descartes.rodape++` por eliminação) trocando por
  `continue` — sumir sem contar — e os 10 testes daquele momento seguiram
  verdes: no arquivo real do dono caem ali a linha de totais
  (`10135.75 | 295646.17 | 0.39`) e o rótulo `Totais:`, e nenhum dos dois
  estava na fixture. A fixture foi regenerada com
  `scripts/extrair-fixture-vendas.js` (faixa `[3046, 3048]`) a partir do xlsx
  real; a mesma mutação agora derruba **dois** testes. A conferência externa
  que o achado pedia — soma dos `valor_nota` lidos × o `Totais:` que o próprio
  Forteplus imprime — vive em `scripts/conferir-vendas-reais.ts`, e não na
  fixture, porque a fixture é um recorte do arquivo e o total impresso é do
  arquivo inteiro. Medido em 2026-09-21 nos dois relatórios: MF
  R$ 295.646,17 × R$ 295.646,17 e INBRAS R$ 236.795,88 × R$ 236.795,88 —
  conferem ao centavo.
- ~~**Três seções do §14 do Painel Diretor ficam fora da L6e, de propósito.**
  Os itens 4, 5 e 6 do `docs/instrucoes-painel-comercial.md` — faturamento
  por cliente (todos, sem filtro de faixa, com histórico mensal, SKUs, meses
  ativos e bonificação), evolução por faixa de todos os clientes (barra
  empilhada A/B/C por mês, com alternância entre barras e números) e
  produto × cliente (matriz completa, com intensidade de cor e alternância
  entre quantidade e faturamento) — não foram construídos: são três telas de
  tabela grande, cada uma com problema próprio (a matriz, por exemplo, tem
  que limpar o CPF/CNPJ colado no fim do nome do cliente e manter o nome
  inteiro no `title`).~~ — **fechado na Frente 3 (correção da auditoria,
  2026-09-23).** Os itens 4 e 5 são `DiretoriaClientes.tsx` (faturamento por
  cliente e evolução por faixa, texto puro — cor/intensidade e a barra
  empilhada continuam na Frente 4) e o item 6 é a matriz produto × cliente
  em `DiretoriaProdutos.tsx` (`com_matriz_produto_cliente`). A tendência
  produto a produto (item 2), o detalhe do produto (item 3) e o simulador
  de metas do §15 já estavam construídos; ver `com_tendencia_produtos`,
  `com_detalhe_produto` e `src/pages/diretoria/SimuladorMetas.tsx`.
- ~~**O seletor de período do §14 só responde em três das seis visões do
  Insights do Comercial** (correção D2 da auditoria da L6e). O documento
  pede o seletor "no topo" respondendo em tudo, mas a alavanca
  (`FiltrosComerciais` + `usePeriodoComercial`, em
  `src/hooks/useComercialPainel.ts`) só entra onde a RPC já aceita
  `p_de`/`p_ate`: **Curva ABC**, **Produtos** e **Bonificação**. Continuam
  só por ano, sem o seletor — melhor não ter do que ter e não responder —
  **Vendas** (`com_painel_totais`, `com_faturamento_mensal`, só `p_ano`),
  **Clientes** (`com_clientes_a_trabalhar`, só `p_ano`) e **Cashback**
  (`com_cashback_mensal`/`com_cashback_resumo`/`com_cashback_indicadores`,
  só `p_ano`). Trocar a assinatura destas quatro funções para `p_de`/`p_ate`
  é leva própria — o plano da correção foi explícito em não fazer isso aqui.~~
  — **desatualizado desde a Frente 3** (correção da auditoria, 2026-09-23):
  Curva ABC fundiu com Vendas numa página só, e Produtos foi para a
  Diretoria — hoje o Insights do Comercial tem **cinco** visões, não seis
  (`src/config/comercial-insights.ts`): Vendas, Clientes, Bonificação,
  Cashback e Atendimento (novo). O seletor responde em **duas**: **Vendas**
  (`com_painel_totais` e `com_faturamento_mensal` já aceitam `p_de`/`p_ate`
  — o KPI do topo filtra pelo período; o gráfico mensal continua o ano
  inteiro, com o período apenas destacado nele, por decisão do §11) e
  **Bonificação**. Continuam só por ano: **Clientes** (`com_clientes_a_
  trabalhar`), **Cashback** e **Atendimento**. A Diretoria (módulo
  separado) tem seu próprio seletor nas visões Clientes e Produtos —
  `DiretoriaClientes.tsx` e `DiretoriaProdutos.tsx`, RPCs próprias, já
  nascidas com `p_de`/`p_ate`.
- **As abas de meta não têm filtro por empresa, e isso é a decisão do dono, não
  uma lacuna.** Perguntado em 2026-09-22 se a meta dele é por empresa ou
  consolidada, ele respondeu: **"A meta é consolidada."** Então `com_metas`
  continua sem coluna de filial, e as abas Metas, Meta × realizado e
  Comparativo (renomeadas na Frente 3, correção da auditoria de
  2026-09-23: hoje são **Resumo**, **Metas** e **Carteiras** —
  `src/config/diretoria-insights.ts` — o "meta × realizado" mora dentro de
  Resumo, e o "comparativo" dentro de Carteiras; mesmo dado, mesma decisão)
  respondem sempre pelas duas filiais juntas. O §14 pede o filtro
  em todas as seções, mas aqui ele **não pode existir**: filtrar o realizado
  por INBRAS ou MF contra uma meta que vale pelas duas faria a cobertura
  mentir — 40% de cobertura numa filial não significa nada quando a meta é do
  conjunto. A tela diz isso em uma linha, para ninguém "consertar" depois
  acrescentando o seletor. A Conciliação perdeu o próprio seletor de filial na
  Frente 5b, pela mesma razão: `metas_ano` (de onde o valor informado agora
  vem) também não tem filial — comparar o total da empresa toda contra a
  venda de uma filial só produziria a mesma mentira.
- **Quem recebe o aviso da meta pelo sino não tem onde ver a própria meta.**
  O sino avisa a pessoa da carteira quando a meta dela é definida ou editada
  (`notify_on_meta_definida`), e o clique leva para `/diretoria` — mas
  `/diretoria` é a visão do diretor (`RequireDiretoria`), e quem só responde
  por uma carteira normalmente não tem o módulo Diretoria nem é gestor. O
  pedido do dono ("notifica") está cumprido; o degrau seguinte — uma tela
  onde o vendedor vê a própria meta — não existe (correção da auditoria da
  leva metas-e-carteiras, item 8).
- **A defasagem entre a venda importada e as metas é permanente, não um
  estado transitório.** A venda vai até a competência mais recente importada;
  as metas existem só para os meses que o diretor preencheu. **A L6d não
  importou o `HISTORICO_METAS.json`** — o dono pediu metas "do zero", e é ele
  quem as preenche na tela. Ninguém deve "consertar" o painel fazendo os dois
  pararem no mesmo mês: a diferença é esperada e vem de fontes diferentes,
  não de um bug. Mês sem meta devolve meta **nula**, nunca zero.
- **`com_metas.definida_por` é escrita e nunca lida, de propósito.** É trilha
  de auditoria: quem definiu aquela meta, guardado pelo banco no momento da
  escrita. Apagar a coluna perderia a informação e mostrá-la na tela não foi
  pedido por ninguém — quando o diretor quiser saber quem mexeu, o dado está
  lá. Não é peso morto a limpar; é o mesmo papel de um `created_at`.
- **A grade de cashback (L6c) não é versionada no tempo.** `com_cashback_
  mensal` usa a grade de `com_faixas_cashback` **de hoje** para apurar
  qualquer mês, inclusive meses passados — uma grade nova mudando um degrau
  ou percentual recalcula a apuração de competências já fechadas, sem
  aviso. É limitação conhecida, não um bug: o `.scratch/plano-l6c-cliente-e-
  cashback.md` §5 decidiu não construir histórico de grade porque ninguém
  pediu. Se a apuração de um mês fechado precisar ficar imune a edições
  futuras da grade, isso é histórico por competência (do mesmo tipo que
  `com_clientes_tabela_historico` faz para tabela de preço) — leva própria,
  com o dono confirmando a necessidade antes.
- **`ComercialPainel.tsx:102` corta nome de produto em 18 caracteres no
  gráfico de Pareto.** Não é nome de cliente — `limparNomeCliente` não
  resolve isto — e não é o pedido do §14 item 9, mas é o mesmo padrão de
  corte que o dono rejeitou para nome de cliente. Achado da correção da
  auditoria da Frente 4 (2026-09-23, `.scratch/plano-frente4-correcoes.md`
  item 10); fora do escopo daquela leva, só anotado.
- **`FichaCliente.tsx` recebe título com o código do cliente, nunca o
  nome.** Os dois chamadores de `FichaClienteSecao`
  (`DiretoriaClientes.tsx`, `ComercialClientes.tsx`) montam `titulo` com
  `cliente_codigo`. Se um dia passar a mostrar o nome, esse nome tem de
  passar por `limparNomeCliente` primeiro. Mesmo achado acima.
- ~~**A ficha não vê competência faltando no meio do importado — e em DUAS
  funções, não uma.**~~ As duas decidiam "este mês foi importado?"
  comparando o mês com o COMEÇO e o FIM do que existe na filial, nunca
  perguntando se aquele mês existe de fato:
  - `com_ficha_evolucao_produtos` (`anterior_completo`): importe janeiro e
    março, pule fevereiro, e o anterior de abril-junho era dado como
    completo. Movia um **aviso**;
  - `com_ficha_indicadores`: um mês nunca importado, no meio do intervalo,
    era contado como **zero real** do cliente e entrava na média dos 3
    anteriores. Movia um **número** — a média caía e a variação inflava,
    sem nada na tela dizendo que aquele mês é desconhecido, não vazio.

  **RESOLVIDO em 2026-09-24** (decisão do dono), migration
  `20261025030000`: `com_mes_importado(mes, filial)` responde pela
  EXISTÊNCIA de venda na competência, e as duas funções a chamam — o
  critério tem uma definição só. `anterior_completo` passou a exigir que
  TODO mês da janela tenha sido importado, e `anterior_existe`, que ao
  menos um tenha. Provado com agosto vazio no meio de junho–dezembro: a
  média sai 150 (só os meses conhecidos) em vez de 100, a variação fica
  nula em vez de 5, e a janela julho–setembro é acusada como incompleta.

  Descartado no caminho, e por quê: `com_vendas_competencias` é a fonte
  autoritativa, mas lê-la exigiria alargar a policy dela para o diretor
  (ou a ficha inteira viraria "—" para ele, em silêncio) e faria sumir do
  cálculo qualquer venda existente sem competência correspondente. O que
  nenhuma das duas fontes distingue: mês importado em que a **empresa
  inteira** não vendeu nada. O comentário da migration dizia que isso "não
  acontece na Minasflor" (há nota todo mês) — **é falso, achado da Frente 7
  (2026-09-24, C2):** maio/2026 na filial MF não teve venda nenhuma,
  confirmado pelo dono. O comportamento da função já está certo para esse
  caso (o mês vira "desconhecido" em vez de "zero", que é errar para o lado
  de não inventar número); o que estava errado era só a explicação de
  quando ele se aplicaria. O texto da migration `20261025030000` continua
  com o comentário antigo — corrige-se com `comment on function` na
  próxima migration que tocar esta área, não com uma migration só para
  isto.
- **`ComercialClientes.tsx` não marca o cliente de tabela CONDIÇÃO na
  lista.** O §11 linha 325 pede a marca, e `DiretoriaClientes.tsx` a
  mostra — a mesma lista no Comercial, não. Quem abre a ficha vê
  "(condição)" no título; quem só passa os olhos na lista, não. Mesmo
  achado acima.
- **`com_metas` com `carteira = null` (o "total da empresa" digitado)
  continua no banco, mas deixou de ser escrito e deixou de vencer.**
  Frente 7c (.scratch/plano-frente7c-total-e-bercario.md §1, 2026-09-24): o
  dono testou a tela e reclamou que meta por carteira e total da empresa
  eram dois números para a mesma coisa, "buga os valores". A meta da
  empresa passou a ser a SOMA das metas por carteira
  (`metaOficialPorMes`), calculada — nunca mais um total digitado à parte.
  As linhas históricas com `carteira` nula (de quando o total era campo
  próprio) não se apagam — são histórico — mas nenhuma tela grava outra, e
  `metaOficialPorMes` não olha mais para elas: quem só tem essas linhas e
  nenhuma meta por carteira cai para `metas_ano.meta` (a importada), nunca
  para o total antigo digitado. Se um dia alguém precisar reconciliar isso
  de outro jeito, é leva própria, com o dono confirmando.

---

## Padrões que escondem defeito

Não são bugs isolados: são formas de escrever que transformam falha em
silêncio. Cada uma explica vários itens acima.

### O `QueryClient` sem `onError` — a raiz de "a tela não avisou"

`src/App.tsx` monta `new QueryClient()` sem `QueryCache({ onError })`. Isso
significa que **todo `unwrap` que lança dentro de um `useQuery` morre em
silêncio**: o hook cumpre a regra 1 das cinco, lança de verdade, e a tela
simplesmente não recebe dado nenhum. Quem escreveu o componente decide, um a
um, se trata `isError` — e quando esquece, a falha de RLS vira "nenhum
registro", que é exatamente o que a regra 1 existe para impedir, uma camada
acima.

Já corrigido componente a componente em três lugares (a tela de Importações,
a ficha do cliente e a linha de conciliação), sempre depois de uma auditoria
apontar. **A correção de raiz é uma linha** — `new QueryClient({ queryCache:
new QueryCache({ onError }) })` com um `toast` — e resolve a classe inteira em
vez de cada tela nova reabrir o buraco. Não foi feita ainda porque muda
comportamento global (toda consulta do sistema passa a avisar) e merece leva
própria, com o dono vendo como o aviso aparece.

Enquanto isso não acontece: **componente que mostra lista ou número vindo do
banco lê `isError`**, e o texto de vazio diz "não consegui ler", nunca "não
há". As duas frases são fatos diferentes sobre o mundo.

Registrado em 2026-09-25, na auditoria da etapa 4.

### Um seletor por bloco, em vez de um por tela

A aba "Carteiras" da Diretoria tinha o seu seletor de ano; o
`DiretoriaComparativo` embutido nela tinha outro, com `useState` próprio.
Nada quebrava, nenhuma conta errava — e dava para deixar um em 2026 e outro em
2025 e ler as duas tabelas como se falassem do mesmo período. Mentir sem
errar.

O mesmo desenho apareceu na tela de Importações e na ficha do cliente. A
regra que ficou: **o filtro mora na página que monta os blocos**, e os blocos
recebem o valor por prop. Bloco com estado próprio de filtro é bloco que vai
divergir do vizinho.

Corrigido na etapa 4 (2026-09-25); `useMetaXRealizadoAno` recebe
`{ ano, setAno }` como objeto único justamente para não deixar passar meio
controle — com dois parâmetros opcionais, dava para passar o ano sem o
`setAno` e o seletor escreveria num estado órfão, sem nada acusar.

### Recorte que herda a janela de anos errada

`DiretoriaMetas` monta o seletor de ano com `anosDisponiveis(true)` — uma
janela FIXA que inclui o ano seguinte, porque ali o caso normal é definir meta
de um ano que ainda não teve venda. Desde a etapa 4 essa lista manda também no
comparativo e na conciliação, que antes montavam a sua a partir do que existe
no banco (`metas_anos_disponiveis`).

Hoje não há diferença: o dado mais antigo é 2022 e a janela cobre. **Passa a
haver** se uma carga histórica trouxer um ano anterior ao que a janela alcança
— ele existirá no banco e não aparecerá no seletor. Se isso acontecer, a
correção é a lista vir da união das duas fontes, não escolher uma.

### "Sem dado" virando zero — o padrão que mais reincidiu

Apareceu **quatro vezes em 2026-09**, em quatro lugares sem relação entre
si, e nenhuma delas foi pega por teste — três foram vistas por olho humano
na tela:

1. **"Fechamento de 2025: R$ 0,00"** — o importador lia `0.0`/`null` do JSON
   do diretor como zero. Causa da Frente 2 existir;
2. **A ficha dizia "não há período anterior" no cabeçalho e "Anterior:
   R$ 0,00"** na linha de baixo — `formatBRL` faz `value || 0`, e o tipo
   declarava `number` onde o banco manda nulo;
3. **Mês pulado na carga virava "o cliente comprou zero"** — o critério
   olhava as pontas do intervalo importado, não a existência do mês. Movia
   a média dos 3 meses anteriores e inflava a variação;
4. **Carteira nunca tocada ganhava meta de R$ 0,00** — o simulador usava o
   mesmo array para CALCULAR (onde vazio é zero, e está certo: mês sem meta
   não tem como "bater") e para GRAVAR (onde vazio tem de continuar vazio).

**O que as quatro têm em comum, e por onde procurar a próxima:** um valor
ausente atravessa uma fronteira — importação, formatação, tipo, ou um array
com dois usos — e do outro lado vira zero, que é um número plausível. Não
há erro, não há aviso: há uma conta a mais que ninguém pediu.

**Como caçar:** onde houver `?? 0`, `|| 0`, `coalesce(..., 0)` ou
`Array(n).fill(0)`, perguntar *"zero aqui é uma medida ou é a falta dela?"*.
E onde um mesmo dado servir a dois propósitos, perguntar se os dois querem
a mesma coisa do vazio — foi o que produziu a quarta.

**Desde 2026-09-07 viraram regra** — "Cinco regras de escrita" no `CLAUDE.md`.
As de número 1, 3 e 4 são acusadas pelo lint (`no-restricted-syntax`) e
barradas pela catraca; a 5 pelo teste `src/routes/rotas-existem.test.ts`; a 2
por revisão. O código existente foi convertido na Fase 1 (hooks, páginas e
componentes); o que nascer daqui em diante já nasce dentro delas.

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
6. **Tabela "só do servidor" sem REVOKE.** Neste banco toda tabela nova nasce
   com ALL para `anon` e `authenticated` (default privileges do schema
   `public`). "RLS ligado sem policy" segura a linha, mas o `SELECT` direto
   devolve **zero linhas sem erro** — um teste que espera 42501 passa em falso,
   e a primeira policy de SELECT que alguém criar abre a tabela. Tabela de
   segredo leva `revoke all ... from public, anon, authenticated` explícito
   (auditoria da CRM-2a, 2026-09-12; `tenant_payment_credentials` e
   `tenant_ai_credentials` já levam).
7. **`--primary` e `--accent` têm o mesmo valor** (`src/index.css:26,30`, os
   dois `212 87% 46%`). Duas séries de dados pintadas com esse par ficam
   **idênticas na tela, sem erro nenhum aparecer** — foi o que o dono viu
   nas faixas A e B da evolução por cliente (§14 item 5, achado da Frente 4,
   2026-09-23). Quem for desenhar gráfico ou barra empilhada usa os tokens
   `--chart-*` ou os pares de badge (`badge-success`/`badge-warning`/
   `badge-neutral`/`badge-danger`), que já são distintos entre si — nunca
   `primary`/`accent` para duas séries lado a lado. Corrigir o token em si
   (deixar `--accent` diferente de `--primary`) é redesenho do sistema
   inteiro (`:407` e todo o shadcn usam `--accent` para foco/destaque), não
   esta leva.

---

## Existe, mas não é alcançável ou não faz nada

### Três baldes de arquivo que o código usa e o banco não tem (achado 2026-09-18)

`storage.buckets` no `test-helpoint` tem **sete**: `facility-maps-backgrounds`,
`mkt-media`, `pop-media`, `rh-documents`, `sac-attachments`,
`ticket-attachments`, `voice-recordings`. O código grava e lê de **três que não
estão na lista**, e cada um é um caminho que falha na cara do usuário:

| Balde que falta | Quem usa | O que quebra |
|---|---|---|
| `avatars` | `ProfileDialog.tsx` (4×), `AppSidebar.tsx:407`, `AcceptInvite.tsx:124-126` | **Trocar a foto de perfil**, em qualquer pessoa |
| `tenant-branding` | `BrandingSettings.tsx:167-169` | **Subir o logotipo da empresa** — e desde a ADR-010 é ele que aparece na tela de login |
| `fin-purchases` | `usePurchases.ts:16,21,27` (constante `BUCKET`) | **Anexar orçamento** na solicitação de compra e **anexar a nota fiscal** ao concluir |

O terceiro é o mais constrangedor: a leva L8 (Compras) foi entregue em
2026-09-18 com as quatro regras de banco provadas por 34 asserções pgTAP — e o
anexo, que a mesma leva descreve no fluxo, nunca teve onde cair. **Provar a
regra do banco não prova o caminho do usuário**, e nenhum dos meus testes toca
em `storage`.

Não corrigir na mão sem diagnóstico: criar o balde não basta. Balde privado sem
policy em `storage.objects` recusa tudo, e balde público entrega arquivo de
folha de pagamento e de nota fiscal para quem tiver o link. O molde certo é o
das policies dos baldes que já funcionam (`rh-documents`, `sac-attachments`), e
o caminho de upload com link assinado já existe pronto em
`usePurchases.ts:18-30`. Vira tarefa própria, com `diagnosing-bugs` antes.

### Chat: duas esperas que a tela não avisa (achado da auditoria, 2026-09-18)

Nenhuma das duas é bug de dado — são espera sem aviso, e ficam registradas para
não virar chamado de "não funciona" nem tentativa de conserto avulso.

| O quê | Por quê | Decisão |
|---|---|---|
| Canal novo e convite para canal fechado só aparecem no próximo carregamento da lista, não na hora | `chat_channels` e `chat_channel_members` não estão na publicação `supabase_realtime` — só `chat_messages` está (é a que precisa, para a promessa de "mensagem aparece na hora"). `useCanais()` não tem assinatura de tempo real | Adiado de propósito: a lista de canais muda pouco (decisão 12, "com 5 pessoas, portaria para criar canal é teatro" — o mesmo vale para a lista recarregar sozinha). Vira uma assinatura a mais em `useCanais()` no dia em que alguém sentir falta |
| `ConversaCanal.tsx` pisca o painel "você não participa" por um instante ao abrir um canal fechado, antes da lista de participantes carregar | O aviso depende de `useParticipantesDoCanal`, que começa vazio (`isLoading`) — no primeiro render, `participo` calcula como `false` para todo mundo, até a consulta responder | Cosmético, e raro: só aparece para dono/administrador abrindo canal fechado de que não participam (decisão 11) — o caso comum (canal aberto, ou canal fechado de que já se participa) nunca passa por ali. Vira um `isLoading` a mais no `if (!participo)` se incomodar alguém |

### Chat: três frestas registradas na segunda auditoria da L11b (2026-09-18)

Nenhuma é vazamento — os dois vazamentos que a auditoria achou foram corrigidos
na migration `20261013020000` e cada um ganhou asserção que reprova se voltar.
Estas ficam de fora por escolha:

| O quê | Cenário | Por que fica |
|---|---|---|
| `extraiMencoes` casa `@Ana` dentro de `@Ana Maria` | Existindo as duas pessoas na empresa, escrever `@Ana Maria` avisa as duas. O lookahead cobre `@AnaMaria` (sem espaço), não com espaço | Com cinco pessoas o caso é hipotético, e o `Set` por id impede duplicata. Resolver de verdade é casar o nome mais longo primeiro — uma linha, no dia em que a lista de gente crescer |
| `useRotuloDoCanal` é uma consulta **por linha** de conversa direta na lista | Abrir o chat com N conversas diretas dispara N consultas de participantes | Documentado no próprio hook. Some junto com o `ItemDaLista` no dia em que o rótulo vier na consulta de `useCanais` — o que também apaga o componente |
| O `exception when unique_violation` de `chat_abrir_conversa` envolve **os dois** inserts | Se o insert de membros levantasse `unique_violation`, o bloco inteiro seria desfeito e a função devolveria o que a reconsulta achasse | Não achei caminho alcançável (o canal é novo e `v_eu <> p_outro` está guardado). Fica registrado como "mais largo do que precisa", não como defeito |

### O script que monta o pgTAP sem Docker estava quebrado (2026-09-18)

`scripts/pgtap-um-teste.mjs` é **o caminho documentado no `CLAUDE.md`** para
provar regra de banco sem Docker. Ele trocava o `\ir _helpers.psql` pelo
conteúdo do helper usando `String.replace` com uma **string** de substituição —
e, em JavaScript, `$$` numa string de substituição é escape para um `$`
literal. Como o helper declara as seis funções com `as $$ … $$`, a saída vinha
com `as $ … $` e o Postgres recusava com `42601`.

Efeito prático: **quem seguisse a receita à risca não conseguia rodar o teste
antes de commitar**, e contornava colando o SQL à mão. Eu mesmo vi o sintoma no
começo de 2026-09-18 e o classifiquei como problema de exibição do terminal —
era o defeito. Corrigido (passa uma função no lugar da string); fica registrado
porque explica por que provas não rodaram nessa janela.

### Chat: o que ficou de fora por decisão, não por falta de tempo (ADR-011)

Nada disto é bug. "Consertar" qualquer um destes é abrir uma porta que a
decisão fechou de propósito — o custo de virar cada uma está em
`docs/decisoes.md` ADR-011.

| Ficou de fora | Por quê |
|---|---|
| Presença ("está online") | Custaria `presence`, a única tecnologia de tempo real que a casa nunca usou, para responder a uma pergunta que ninguém faz com o tamanho de equipe de hoje — as pessoas se veem no corredor |
| Anexo | Exige balde de arquivo novo, policy de `storage.objects`, link assinado e uma história de retenção — o chamado, onde arquivo de trabalho importa, já aceita anexo |
| Editar mensagem | Editar sem histórico de versão é pior que não editar — ninguém saberia o que foi dito de verdade; só se apaga |
| Busca | `Ctrl+F` do navegador resolve num canal de poucas pessoas |
| Threads, reações, convite por link, "visto por" pessoa a pessoa, arrastar arquivo, fixar mensagem, canal arquivado, apelido, emoji picker | Cortados no plano (`.scratch/plano-chat.md` §3) por não se justificarem com o tamanho de equipe de hoje |
| Aviso no celular com o app fechado | Exigiria PWA, service worker e chaves de push — leva própria, independente do resto |
| Expurgo automático de mensagem por prazo | Pergunta em aberto para o dono (peso de LGPD) — hoje guarda para sempre, com faxina manual de dono/administrador |

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
| ~~`useUndoRedo` e `@xyflow/react`~~ | Apagados em 2026-09-09 (leva L2). O diagrama visual (L10) reinstala a biblioteca quando chegar |
| `useDashboardTemplates` | Zero importadores (a tabela existe, a tela não) |
| `useTenantSlug` (`useTenantPath.ts:22`) | Exportado, nunca usado |
| `usePurchaseRequests`, `parseFinanceFile` | Sem nenhum chamador |
| `CustomerKnowledgeDetail` | Rota registrada em 2026-09-04; o card do portal voltou a funcionar |
| `/kanban` | ~~Rota não existe~~ — **resolvido em 2026-09-13 (OKR-2)**: a rota existe como atalho para `/projetos`, que tem o quadro de verdade (tabelas `projects`, `project_members` e `tasks.project_id`). Saiu da lista `PLANEJADAS` de `rotas-existem.test.ts`, que ficou vazia. **O que continua valendo**: `KanbanCardItem` e `useAISecretary` ainda devolvem lista sempre vazia, então o quadro **não alimenta** o painel da Lyra nem `usePersonalPerformance` — os chamadores agora vão a uma página real, mas nada os leva até um cartão específico |
| Conciliação bancária no Financeiro | **Não existe** (§6.6) |

---

## Dívidas de base

- **O histórico de migrations do `test-helpoint` não bate com os nomes dos
  arquivos** (achado da auditoria da CRM-4c, 2026-09-15). As migrations são
  aplicadas pelo MCP do Supabase, que grava a versão com o **carimbo de hora da
  aplicação** — `20261004060000_lead_ads_correcoes_da_auditoria.sql` está no
  banco como `20260914120046`, e o padrão se repete pela lista inteira. O efeito:
  `npx supabase db push` (que `docs/deploy.md` manda usar) considera todo arquivo
  como ainda não aplicado e tenta rodar de novo. Quem não for idempotente aborta
  o push — e o push aborta **antes** de tudo o que vem depois. Duas defesas, e as
  duas valem: toda migration se escreve para poder rodar duas vezes
  (`drop ... if exists`, `create or replace`, `if not exists`), e o CI contra
  banco do zero continua sendo a única prova de que os arquivos formam um todo
  aplicável. O remédio para o desencontro é `supabase migration repair`
  (`docs/deploy.md`), e ele é do humano.
- ~~**`mkt-meta-refresh-token` não existe**~~ — **fechado em 2026-09-17**. O
  botão "atualizar token" invocava uma edge function que não está em
  `supabase/functions/` e respondia com erro de função inexistente; o ramo
  `refresh_token` de `mkt-meta-oauth`, que faz esse trabalho, estava escrito e
  sem chamador. Agora o botão aponta para ele — e o ramo, que **também nunca
  funcionou**, foi consertado junto: ele lia o cofre com a credencial de quem
  está logado (`42501` sempre) e engolia o erro, devolvendo "Account not
  connected". Apontar o botão sem isso teria trocado um erro por outro, com o
  item marcado como fechado — achado da reauditoria. **Não foi exercitado contra
  a Meta**, como todo o resto do Marketing.
- ~~`mkt-meta-publish` engolia o erro do banco~~ — **fechado em 2026-09-17**
  (regra 1 das cinco). Ele lia o cofre `mkt_social_account_secrets` com a
  credencial de quem está logado, e essa tabela é fechada: o `42501` virava
  "Account not connected. Please reconnect.", e a pessoa reconectava a conta de
  novo e de novo tratando um problema de privilégio como credencial vencida.
  Agora lê pela chave de serviço, com o erro tratado, e prefere a credencial da
  página (CRM-4c) à de quem conectou.

- ~~Sem CI~~ — **`.github/workflows/ci.yml` desde 2026-09-06**: lint como
  catraca (`scripts/lint-baseline.mjs` + `lint-baseline.json`, só pode descer),
  Vitest, build, e o pgTAP contra um banco do zero com todas as migrations.
- **`npx tsc --noEmit` na raiz não checa arquivo nenhum.** `tsconfig.json` tem
  `"files": []` e só `references` (para `tsconfig.app.json` e
  `tsconfig.node.json`); o `tsc` não constrói referências sem `--build`, e
  `--listFiles` confirma: zero linhas. É portão que sempre passa, mesmo com
  erro de tipo no projeto inteiro. O typecheck de verdade é `npx tsc --noEmit
  -p tsconfig.app.json`, e ele acusa **4 erros pré-existentes**:
  `useLicenseRenewals.ts:69`, `useRH.ts:396` e `:397`, `useTicketActions.ts:16`
  (achado da auditoria de 2026-09-18). Registrados aqui, não corrigidos.
- **`is_supervisor_or_higher` e `is_manager_or_higher` têm corpo idêntico**
  (`owner`, `admin`, `manager`) — conferido no `pg_proc` durante a leva L6a
  (Painel Comercial, 2026-09-21). Não existe papel `supervisor` em
  `public.app_role`; `has_crm_access` e `has_fin_access` chamam a primeira
  função para perguntar a mesma coisa que a segunda perguntaria. Duas funções
  com nomes diferentes para a mesma pergunta, e um nome que descreve um cargo
  que não existe neste banco. **Consequência prática:** quando alguém diz
  "Supervisores", está nomeando um **perfil de acesso** que precisa ser
  criado e atribuído — não um cargo do sistema. Não se corrige nesta leva:
  mexer numa função que várias policies chamam é leva própria.
- ~~Atribuir carteira por estado ou cidade não existe~~ (achado da L6d —
  Metas e carteiras, 2026-09-21). **Removido por inteiro na Frente 2
  (2026-09-22), não corrigido.** A L6d entregava dois caminhos que não
  cruzavam `com_clientes` com a ficha do dono (tabela de preço e seleção
  manual, em `com_atribuir_carteira`) — mas a fonte da verdade virou outra
  no meio do caminho (`docs/metas-e-carteiras-fonte-da-verdade.md`):
  carteira **nunca vem do ERP**. Ela vive só em `metas_carteira`/
  `metas_ano`, alimentadas pelo `HISTORICO_METAS.json` do diretor — o
  realizado por carteira é o que ele já MEDIU e informou, nunca uma soma de
  venda de clientes que "pertencem" a ela. `com_atribuir_carteira`, a
  tabela de domínio `com_carteiras` e `com_clientes.carteira_id` saíram do
  banco por inteiro. **Não existe mais, em lugar nenhum do sistema, um
  vínculo cliente→carteira** — nem por tabela de preço, nem manual, nem por
  estado/cidade. Quem ler isto daqui a seis meses e achar que falta uma
  tela: não falta, foi decisão — não se reconstrói sem primeiro reler o
  anexo e confirmar com o dono que o processo mudou de novo.
- ~~A Conciliação (`DiretoriaConciliacao.tsx`) ainda pede o valor da
  apresentação digitado~~ (achado da auditoria da correção de 2026-09-22).
  **Corrigido na Frente 5b** (`.scratch/plano-frente5-ficha-e-conciliacao.md`,
  migration `20261024010000`): `com_conciliacao(p_ano)` passou a ler
  `total_realizado` de `metas_ano` — o campo digitado saiu da tela. A
  comparação também passou a cobrir só os meses com `total_realizado`
  informado (nunca o ano inteiro) e o seletor de filial saiu, já que
  `metas_ano` é da empresa inteira.
- Cobertura de teste: 60 testes no front (Vitest) — SLA em `src/types/helpdesk.test.ts`, módulos
  em `src/types/modulos.test.ts` (ADR-010), rotas em `rotas-existem.test.ts`, motor de fluxos, importação e campos personalizados em `src/lib/*.test.ts`. No banco, `supabase/tests/database/` tem 7
  asserções sobre isolamento entre tenants em `tickets`, 10 sobre as policies
  da revisão, 7 sobre o guard do cliente do SAC, 7 sobre o enum e a resposta
  de cliente no SAC, 12 sobre o chamado avisar os dois lados, 30 sobre o
  motor de fluxos de automação, 15 sobre o worker externo/webhook/manual, 12 sobre os modelos de fluxo (CRM-1d), 11 sobre ramificação e
  reexecução, 9 sobre a receita de módulo (Comercial/Educacional),
  14 sobre a base do CRM, 16 sobre funis editáveis, 25 sobre segmentos, tabelas de preço e portões, 17 sobre pedido e proposta, 8 sobre chaves de pagamento por empresa (CRM-2a), 9 sobre a conexão com o Bling e o passo `bling_order` (CRM-2b), 3 sobre a entrega (CRM-2c), 8 sobre o CRM como módulo próprio (ADR-009), 17 sobre a Expedição com estoque por lote (EXP-1), 13 sobre o encaixe da etiqueta (ENC-1), 11 sobre a cobranca pelo Asaas (ENC-2), 15 sobre a tarefa de fluxo que nasce com chamado, 15 sobre a nota fiscal pela Focus NFe (ENC-3), 18 sobre o formulario do site (CRM-3a), 16 sobre a reuniao pelo negocio (CRM-3b), 27 sobre as metas (OKR-1), 24 sobre projetos e o quadro (OKR-2), 26 sobre a conversa do WhatsApp (CRM-4a), 25 sobre a mensagem-modelo e o reengajamento (CRM-4b), 36 sobre o Lead Ads do Facebook (CRM-4c), 38 sobre os treinamentos do Educacional (L3b), 24 sobre as dívidas das auditorias, 34 sobre as lacunas de Compras (L8), 13 sobre campos
  personalizados, 13 sobre importação de planilha, 9 sobre indicadores de
  venda e 5 sobre a empresa única (`uma_empresa_so.test.sql`, ADR-010) —
  **599**. `scripts/pgtap-plano.mjs` confere que todo `plan(N)` bate
  com o número de asserções: plano errado reprova o arquivo inteiro no
  pg_prove, e foi assim que a auditoria de 2026-09-12 achou um teste que nunca
  tinha rodado. O CI os roda contra um banco do zero a cada push ao
  `main` (e localmente, sem Docker, por
  `scripts/pgtap-local/run.sh`). É pouco para o tamanho do RLS (~309
  policies), e para produto (ADR-005) isso é bloqueio antes do primeiro
  cliente de fora.
- `npm run lint`: 504 erros (458 `no-explicit-any`) e 464 avisos — 425 deles são
  cor de paleta fixa (`bg-emerald-100`, `#RRGGBB`) que não muda com o tema,
  contados pela regra `helpoint/cor-fixa` desde 2026-09-07 (L0b, freio do
  modo escuro). Nenhum dos dois pode subir (`scripts/lint-baseline.mjs`); a
  lista de cores zera no tema completo (L12).
- `tailwind.config.ts` tem `darkMode: ["class"]` desde 2026-09-07: os 45 `dark:`
  espalhados não disparam mais pelo Windows escuro. Nada aplica a classe
  `.dark` — modo escuro de verdade é L12.
- Chunk principal de 3,4 MB sem code splitting.
- Backend de Marketing sem tela: tabelas e hooks existem, UI não (§5.6).
- ~~A mesma linha de `tenants` é buscada por 6 componentes~~ — **parcialmente
  fechado em 2026-09-18** (ADR-010, Leva 4): `StaffRoute` e
  `StaffAwayFromSAC` deixaram de consultar — sem slug na URL, não há mais
  nada para conferir contra o tenant do usuário; `TenantSlugGuard` e
  `LegacyTenantRedirect` foram apagados junto com o prefixo. Seguem
  consultando `AppLayout` e `AppSidebar`; resolver no `AuthContext` uma vez
  continua de pé para essas duas.
- **Tabelas com `tenant_id NOT NULL` sem trigger de injeção fora do MKT**:
  `pop_versions`, `pop_attachments`, `calendar_events`, `notifications`,
  `software_license_keys`. Hoje não quebram porque os hooks passam o campo na
  mão; o primeiro chamador que esquecer falha no INSERT.
- `useTicketComments.ts:44-56` faz uma consulta de anexos por comentário (N+1).
- **As edge functions não estão sob as cinco regras de escrita.** O lint só as
  aplica em `src/`. Em `supabase/functions/` há 79 ocorrências da regra 1
  (`const { data } = await` sem `error`) — 25 só em `check-alerts`. Elas rodam
  em Deno, sem `@/lib/supabase-result`; a leva precisa de um helper em
  `_shared/` e de plano próprio, porque erro engolido num worker de cron é
  silêncio total.
- **`tenants.plan_config` e `tenants.plan` ficaram no banco sem ninguém ler**
  (ADR-010, 2026-09-18). Comentadas no próprio banco. Apagar é irreversível e
  não muda a tela — fica assim.
- **A trava contra empresa nova (ADR-010) fecha empresa, não conta.**
  `supabase.auth.signUp` continua atendendo chamada do navegador se o
  cadastro por e-mail estiver ligado no painel do Supabase — a conta
  nasceria sem `profiles` e sem `tenant_id`, caindo em `/conta-sem-empresa`,
  sem enxergar dado nenhum. Não é vazamento de dado; é porta meio aberta.
  Desligar o cadastro por e-mail é ajuste no painel do Supabase, ação do
  dono — já avisado.
- **Apagar o fonte de uma edge function não a tira do ar.** A `staff-signup`
  saiu do repositório na Leva 1 (ADR-010) e continuou **ACTIVE** no
  `test-helpoint`, versão 3, criando conta com `service_role` — só percebido
  na auditoria, e só removida com `supabase functions delete` à parte
  (`docs/ambientes.md`). Lição: toda leva que remove edge function precisa de
  um `functions delete` depois de apagar o diretório, e conferir a lista de
  funções do projeto — não só o `git rm`.
- ~~**`modulos_comercial_educacional.test.sql` reprova no `test-helpoint`**~~ —
  **diagnosticado e corrigido em 2026-09-23.** Durante cinco auditorias esta
  suíte foi anotada como "defeito pré-existente e alheio" e **ninguém foi ver
  o que era**. Era desvio do banco de teste em relação ao repositório: a
  `seed_default_categories_novos_modulos` do `test-helpoint` só semeava
  categorias (270 caracteres), enquanto a do arquivo
  (`20260909020000_modulos_comercial_educacional.sql:272-287`) semeia
  categorias **e os perfis de acesso dos sete departamentos**. Por isso a
  asserção 3 ("tenant novo nasce com os perfis padrão") reprovava no teste e
  o CI passava — ele monta do zero, a partir do arquivo.

  **O que estava em jogo, além do teste:** no go-live a Minasflor é criada
  como empresa nova. Com o desvio, ela nasceria **sem perfil de acesso
  nenhum** — e as permissões destas levas (`vendas.importar`,
  `metas.definir`, `cashback.configurar`, `carteiras.gerir`) não teriam onde
  morar. Depois da correção, empresa nova nasce com **21 perfis em 7
  departamentos** e as 5 categorias do Comercial (medido no banco).

  **Lição:** "defeito pré-existente e alheio" é hipótese, não diagnóstico.
  Suíte vermelha que ninguém diagnostica vira paisagem — e a próxima pessoa
  a ver aquele vermelho vai assumir que é o mesmo de sempre.
- **O histórico de migrations do `test-helpoint` para em `20260918024921`.**
  As **75** migrations depois dela (correção da auditoria da Frente 3 — o
  registro anterior aqui dizia 46 e só contava a série `202610*`; o corte
  real é por data, não por prefixo, e começa em `20260919`) existem no banco
  mas **não estão** em `supabase_migrations.schema_migrations`: foram
  aplicadas por `execute_sql`, não por `db push`. Um `db push` futuro tentaria
  reaplicá-las. **Não registrei à mão de propósito:** marcar como aplicada uma
  migration que eu não conferi linha a linha é exatamente o que escondeu o
  desvio acima por cinco auditorias. O caminho certo é `supabase migration
  repair`, com o dono, conferindo — `docs/deploy.md` já o prevê. A produção
  (`helpoint-producao`), cujo livro está íntegro, é o único lugar onde a
  sequência inteira de migrations vai rodar de verdade além do CI.
- **Um diretor puro alcança as visões do Insights do Comercial pela URL —
  decisão da correção da auditoria da Frente 3, 2026-09-23.** A leva que deu
  ao painel do diretor sua própria visão "Clientes"/"Produtos" também abriu
  a SELECT de `com_vendas_itens`, `com_clientes` e `com_produtos` para
  `has_diretoria_access`, e as RPCs do Comercial (`com_faturamento_mensal`,
  `com_painel_totais`, `com_curva_abc` etc.) são `security invoker`, sem
  porta própria — quem só tem o módulo Diretoria (sem Comercial) digita
  `/comercial/insights?visao=cashback` (ou qualquer outra visão) e o banco
  responde. O menu esconde a opção; a RLS não. **É aceitável, por decisão do
  dono:** o dado é o mesmo que o painel dele já mostra (faturamento por
  cliente, curva, ficha) — não é exposição nova, é acesso redundante a
  tela. Sob a ADR-010 (uma empresa só), não há terceiro a proteger.
- **`anon` tem `EXECUTE` nas RPCs do Comercial** (`com_faturamento_mensal`,
  `com_painel_totais` e as demais) — padrão do Supabase, que concede
  `EXECUTE` a `anon`/`authenticated` em toda função nova por default. A RLS
  segura porque `get_user_tenant_id()` é nulo para quem não está autenticado
  — sem tenant, as três tabelas de trás (`com_vendas_itens`, `com_clientes`,
  `com_produtos`) não devolvem linha nenhuma. Porta a menos (revogar o
  `EXECUTE` de `anon` seria mais correto), mas pré-existente a esta leva e
  fora do escopo da correção da Frente 3.
