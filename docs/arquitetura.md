# Helpoint — Documento de Arquitetura

> **Versão 2.0 · 2026-08-29 · Documento de referência principal do projeto.**
> Substitui `helpoint-main-old/docs/ARQUITETURA_MIGRACAO.md` (que assumia saída do Supabase para VPS) e
> estende `ARQUITETURA_HELPOINT_V3.md` (que detalhava apenas o núcleo de 13 tabelas).
> Este documento cobre **o domínio completo** — todos os módulos existentes reconstruídos + os módulos novos.

---

## Como usar este documento

Este arquivo é a fonte de verdade da arquitetura do Helpoint. Ele foi escrito para ser lido por **pessoas** e
consumido por **Claude Code** durante a implementação. Regras de uso:

1. **Nada é implementado contrariando este documento.** Se a implementação precisar divergir, a divergência
   entra aqui primeiro (com justificativa em §11 ADRs) e só depois no código.
2. **A ordem de construção está em §10 (Roadmap).** Não pule fases: o núcleo (§5.3–§5.9) é pré-requisito de
   todos os módulos.
3. **O DDL deste documento é normativo.** Cada bloco `sql` de §5 vira um arquivo em `supabase/migrations/`.
   Nomes de coluna, tipos, constraints e índices não são sugestões.
4. **O que este documento não define, o Claude Code decide seguindo as convenções de §5.1 e §6.**
5. **Toda tarefa passa pelo protocolo padrão do `CLAUDE.md`**: `grilling` antes de construir o que
   ramifica, `ponytail` enquanto constrói, `lean-ctx` para não gastar contexto à toa. Não é opcional nem
   depende de o usuário pedir.

### Índice

| § | Seção | O que resolve |
|---|---|---|
| 0 | [Resumo executivo](#0-resumo-executivo) | As decisões em uma tabela |
| 1 | [OVERVIEW](#1-overview) | O que é o produto, o que já existe, o que muda |
| 2 | [STACK TECNOLÓGICA](#2-stack-tecnológica) | Fase 1 (Supabase + Vercel) e Fase 2 (alta escala) |
| 3 | [MULTI-TENANCY](#3-multi-tenancy) | Isolamento, RLS, subdomínio, escala |
| 4 | [Convenções de modelagem](#4-convenções-de-modelagem-e-nomenclatura) | Nomenclatura, tipos, padrões |
| 5 | [SCHEMA DO BANCO](#5-schema-do-banco) | Todas as tabelas, enums, índices, integridade |
| 6 | [ESTRUTURA DE PASTAS](#6-estrutura-de-pastas) | Organização do código |
| 7 | [PLANO DE SEGURANÇA](#7-plano-de-segurança) | Auth, RBAC, rate limit, validação, segredos |
| 8 | [PLANO DE DEPLOY](#8-plano-de-deploy) | Ambientes, CI/CD, Docker, Nginx, SSL, DR |
| 9 | [OBSERVABILIDADE E QUALIDADE](#9-observabilidade-e-qualidade) | Logs, métricas, testes, DoD |
| 10 | [ROADMAP DE IMPLEMENTAÇÃO](#10-roadmap-de-implementação) | Ordem de construção |
| 11 | [ADRs](#11-adrs--registro-de-decisões-arquiteturais) | Por que cada decisão foi tomada |

---

## 0. Resumo executivo

| Dimensão | Fase 1 — início (agora) | Fase 2 — alta escala (§2.4) |
|---|---|---|
| Framework | **Next.js 16 (App Router)** + TypeScript `strict` | idem |
| Hospedagem | **Vercel** | VPS (Hetzner/Hostinger) + Docker + Nginx |
| Banco | **Supabase Postgres 17** (sa-east-1) | PostgreSQL 17 self-hosted + réplicas de leitura |
| Acesso a dados | `@supabase/supabase-js` + `@supabase/ssr` (RLS na sessão do usuário) | Prisma/pg + `SET LOCAL` (mesmo RLS) |
| Migrations | **SQL versionado** via Supabase CLI — portável para qualquer Postgres | idem, sem mudança |
| Auth | **Supabase Auth** (GoTrue) — senha, magic link, OTP | NextAuth.js (Prisma Adapter) |
| Isolamento | `organization_id` + **RLS nativo** + FK composta + trigger de imutabilidade | idêntico |
| Backend lógico | Server Actions + Route Handlers + Edge Functions (Deno) | + workers BullMQ persistentes |
| Filas / cron | Tabela-fila (`SKIP LOCKED`) + `pg_cron` + `pg_net` + Vercel Cron | Redis + BullMQ |
| Cache / rate limit | Upstash Redis (`@upstash/ratelimit`) | Redis local |
| Storage | Supabase Storage (buckets privados, path por org) | Cloudflare R2 (egress grátis) |
| Realtime | Supabase Realtime (Broadcast from Database) | Realtime self-hosted ou SSE próprio |
| E-mail | Resend + React Email | idem |
| IA | **API Anthropic** primária, abstração multi-provedor **BYOK por organização** | idem |
| Pagamentos | **Stripe** (Checkout + Billing Portal + Webhooks) | idem |
| Busca semântica | `pgvector` no próprio Postgres | idem (ou índice dedicado se > 10M vetores) |
| UI | Tailwind + shadcn/ui + Radix + ReactFlow + TanStack Table/Query | idem |
| Observabilidade | Sentry + Vercel Analytics + Supabase Logs + `get_advisors` no CI | + Grafana/Loki/Prometheus |
| Testes | Vitest + Testing Library + Playwright + **pgTAP (RLS)** | idem |

**Regra que atravessa todo o documento:**

> O `organization_id` **nunca** vem do cliente. Ele é derivado do host pelo proxy (§3.3) e validado contra a
> `membership` ativa do usuário. O RLS é a **rede de segurança final**, não a primeira checagem.

**Escopo desta versão:** domínio completo — os 9 módulos hoje em produção reconstruídos do zero, mais 5
capacidades novas: **Work Management**, **Comercial/CRM/Distribuidores**, **Workflows/Automação**,
**Billing/Stripe** e **Observabilidade**. Base de dados nova e vazia: **não há migração de dados** do sistema
atual (§1.6).

---

## 1. OVERVIEW

### 1.1 O que é o Helpoint

O Helpoint é um **SaaS multi-tenant de gestão corporativa unificada** — um "sistema operacional da empresa".
Cada empresa cliente (uma **organização**) recebe um ambiente isolado, com subdomínio próprio
(`{slug}.helpoint.com.br`), identidade visual própria, módulos habilitados conforme o plano contratado e
usuários com permissões granulares por departamento.

A tese do produto: uma empresa de médio porte hoje opera com 6 a 12 ferramentas desconexas (helpdesk, planilha
de inventário, planilha de folha, ERP financeiro parcial, CRM, WhatsApp para SAC, Drive para procedimentos).
O Helpoint substitui esse conjunto por **um sistema com um único modelo de identidade, permissão, auditoria,
notificação e IA**, onde um chamado de TI, uma requisição de compra, uma reclamação de consumidor e uma
oportunidade de venda compartilham o mesmo motor.

**Dois princípios de produto**, declarados desde a origem e mantidos:

- **Zero Planilhas** — nenhum fluxo do sistema pode terminar em um Excel externo. Se um usuário precisa
  exportar para trabalhar, o módulo está incompleto.
- **Auditoria Total** — toda ação relevante registra **quem**, **quando**, **o quê** e **o valor anterior**.

**Diretriz visual.** A fonte de verdade é o arquivo `helpoint-main-old/src/index.css`, cujo próprio
cabeçalho declara: *"Monday-inspired light design system"*. São 517 linhas de tokens, com anotações de
contraste (`>= 4.5:1`) nos badges — alguém cuidou de acessibilidade ali, e isso se preserva.

| Elemento | Valor |
|---|---|
| Canvas | claro, `#f6f7fb` |
| Superfícies | branco puro, com borda de 1px `#e6e9ef` |
| Cor de marca | azul `#0F6FDE` (AA sobre texto branco) |
| Cantos | `8px` / `6px` / `4px` |
| Tipografia | **Figtree** na interface, **JetBrains Mono** em IDs e valores técnicos |
| Densidade | alta, estilo painel de controle — sem abrir mão do respiro do Monday |
| Paletas | status semânticos, badges (fundo suave + texto escuro), prioridade de chamado, KPI |

> ⚠️ **Não confundir com o `README.md` do sistema antigo.** Ele descreve uma estética industrial com
> `border-radius: 0` e dark mode por padrão. Aquilo é o **briefing original** do projeto, de quando ele
> nasceu; o produto evoluiu para o design acima e o README nunca foi atualizado. Quando os dois
> divergirem, **vale o CSS** — é o que está em produção e o que os usuários já conhecem.

**Tema escuro é novo.** O sistema atual não tem (não há bloco `.dark` no `index.css`). A variante escura
foi derivada da paleta clara mantendo o azul da marca como âncora — clareado, porque o `#0F6FDE`
original não atinge AA sobre fundo escuro.

### 1.2 Portas de entrada e personas

O sistema tem **três superfícies distintas**, com autenticação, permissões e layout separados. Confundi-las é
o erro arquitetural mais caro deste domínio.

| Superfície | Quem usa | Como entra | Escopo de dados |
|---|---|---|---|
| **Painel interno** (`{org}.helpoint.com.br`) | Colaboradores da empresa cliente (staff) | E-mail + senha ou magic link, sessão Supabase Auth | Tudo da organização, filtrado por RBAC |
| **Portal SAC** (`{org}.helpoint.com.br/sac`) | Consumidor final / cliente da empresa cliente | OTP por e-mail (sem senha) | **Apenas os próprios chamados e a base de conhecimento pública** |
| **Site institucional** (`helpoint.com.br`) | Visitantes, prospects | Público | Nenhum |

Personas do painel interno:

| Persona | Papel típico | Necessidade central |
|---|---|---|
| **Owner / Diretor** | Dono da conta | Visão consolidada, indicadores, controle de custos e de plano |
| **Admin / Gestor de TI** | Administra o sistema | Usuários, permissões, integrações, configuração de módulos |
| **Técnico / Analista** | TI, RH, Financeiro, Qualidade | Fila de trabalho priorizada, SLA, ferramentas do módulo |
| **Colaborador** | Qualquer funcionário | Abrir solicitação, consultar procedimento, ver seu RH |
| **Vendedor / Representante** | Comercial | Carteira, funil, pedidos, metas, roteiro de visitas |
| **Distribuidor** | Parceiro externo com acesso limitado | Sua carteira, seus pedidos, seu território, suas metas |

> O perfil **Distribuidor** é novo e é o primeiro caso de *acesso externo com escopo parcial ao painel* —
> diferente do SAC (que só vê os próprios chamados) e diferente do staff (que vê a organização). Isso é
> tratado por `memberships.scope` + perfis de acesso com restrições de linha (§5.3.4, §7.3).

### 1.3 O que já temos hoje (sistema em produção no Lovable)

O sistema atual (`helpoint-main-old/`) está em produção real. Números levantados por leitura direta do código:

| Métrica | Valor |
|---|---|
| Migrations SQL aplicadas | 125 (jan → ago/2026) |
| Tabelas no schema `public` | ~110 |
| Enums nativos do Postgres | 32 |
| Funções PL/pgSQL | 60+ |
| Edge Functions (Deno) | 27 |
| Arquivos em `src/` | 352 |
| Hooks customizados | 60+ |
| Componentes `ui/` (shadcn) | 52 |
| Buckets de storage | 7 |

Inventário honesto de capacidades, por módulo:

| Módulo | O que faz hoje | Maturidade | Destino no rebuild |
|---|---|---|---|
| **TI / Helpdesk** | Chamados com SLA calculado por prioridade, atribuição, conversação pública/interna, avaliação de satisfação (1–5), formulários dinâmicos por categoria, checklists que bloqueiam fechamento, transferência entre técnicos, vínculo com ativos, detecção de padrões por IA | **Alta** — módulo mais maduro, 22 componentes | Reconstruído 1:1, é o motor de atendimento reusado por RH/Financeiro/Marketing/Qualidade |
| **Inventário / CMDB** | Ativos (hardware, software, rede, periférico, mobile), especificações em JSONB, status, responsável, vínculo com chamados e manutenções | Média | Reconstruído |
| **Licenças** | Licenças de software, chaves, renovações, atribuição a usuário/ativo, alerta de expiração | Média | Reconstruído |
| **Contratos** | Contratos de fornecedores de TI, vigência, alerta de vencimento | Baixa | Reconstruído |
| **Manutenções** | Preventiva/corretiva/upgrade/limpeza, agendamento, custo, provedor externo | Média | Reconstruído |
| **POPs / Conhecimento** | Editor em blocos (markdown, mídia, vídeo→GIF), versionamento com histórico, anexos, feedback, busca semântica por IA, templates, visibilidade configurável | **Alta** — 18 componentes | Reconstruído + embeddings nativos com `pgvector` |
| **RH** | Colaboradores, férias, atestados, faltas, holerites, folha (com cálculo de INSS/IRRF **dentro do banco**), benefícios (VT/VR/combustível), documentos, reembolsos, "Meu RH" self-service | **Alta** — 18 tabelas, 10 páginas | Reconstruído, com cálculo movido para TypeScript (§2.5) |
| **Financeiro** | Contas a pagar/receber, fluxo de caixa, importação de extrato, requisições de compra com cotações, orçamento por departamento, indicadores | Média-alta | Reconstruído |
| **Marketing** | Influenciadores e artistas, contratos e entregáveis, eventos e participantes, calendário social com publicação via **Meta OAuth**, fornecedores e cotações, UGC, geração criativa por IA | Média | Reconstruído |
| **Qualidade** | Dashboard, chamados de qualidade, **laudos técnicos** com produtos e lotes | Média | Reconstruído, integrado ao catálogo único de produtos |
| **SAC (portal público)** | Login por OTP de e-mail, cadastro de consumidor, formulário público de reclamação com anexos e nota fiscal, acompanhamento, base de conhecimento do cliente, avaliação | **Alta** — 7 páginas | Reconstruído, com **cliente unificado ao CRM** (§5.19) |
| **IA "Lyra"** | Assistente com *function-calling* (abre chamado, sugere resposta, analisa padrões, busca semântica, transcreve áudio, gera relatório de insight, curadoria diária, modo foco), **BYOK por tenant** (Anthropic/OpenAI/Google), bloqueio progressivo contra prompt injection | **Alta** | Reconstruído e expandido (prospecção de leads, §5.19) |
| **RBAC / Perfis de acesso** | Perfis granulares por departamento (ver/criar/editar/excluir/aprovar) | Média — **três modelos coexistindo** | **Unificado em um só** (§5.4) |
| **Notificações** | In-app + eventos, tipos por domínio | Média | Reconstruído + canais (e-mail, push) |
| **E-mail transacional** | Fila via `pgmq`, envio via Resend, supressão e unsubscribe, verificação diária | Média | Reconstruído com tabela-fila auditável |
| **Domínios customizados** | White-label: domínio próprio do tenant com verificação DNS (CNAME/A + TXT) | Média | Reconstruído |
| **Auditoria** | Trigger genérico gravando INSERT/UPDATE/DELETE com `old_data`/`new_data` | Média | Reconstruído como `activity_log` (§5.6) |
| **Agenda / Eventos** | Calendário com recorrência | Baixa | Reconstruído |
| **Metas (`goals`)** | Metas genéricas | Baixa | Absorvido pelo CRM (`crm_targets`) e por indicadores |
| **Kanban** | **Tabelas já removidas do banco** — módulo órfão, UI nunca existiu | Inexistente | **Substituído** pelo módulo Work Management (§5.10) |

### 1.4 Dívida técnica herdada — o que **não** se repete

Estes problemas foram encontrados por leitura do código real. Cada um tem uma contramedida explícita nesta
arquitetura. Esta lista existe para que o rebuild não recrie os mesmos defeitos.

| # | Problema no sistema atual | Contramedida nesta arquitetura |
|---|---|---|
| 1 | **Três modelos de RBAC coexistindo**: `ti_access_profiles`/`ti_user_profiles` (legado, só TI), `access_profiles`/`user_access_profiles` (multi-departamento), `qualidade_access_profiles`/`qualidade_user_profiles` (paralelo). Além disso `user_module_access` e `employee_access_grants` fazem controle sobreposto | **Um único** `access_profiles` genérico por departamento + `membership_access_profiles`, com `permissions` JSONB de formato fixo e validado por CHECK (§5.4). Nenhum módulo cria tabela de permissão própria |
| 2 | **Enum vs. `TEXT + CHECK` inconsistente**: módulos antigos (TI, Marketing) usam enum nativo; módulos novos (RH, SAC, `access_profiles.department`) usam `text` com CHECK | Enum nativo do Postgres para **todo** domínio fechado. `text + CHECK` só para domínio que muda com frequência de release (§4.2) |
| 3 | **Drift entre tipos TypeScript e enums SQL**: `AssetStatus` no TS tem `in_use`/`in_stock` que a UI usa mas o enum SQL divergiu; `TicketStatus` no TS tem `rejected` fora do enum | Tipos **gerados** por `supabase gen types typescript` no CI, com o build quebrando se o arquivo gerado divergir do commitado (§9.4). Nenhum tipo de banco escrito à mão |
| 4 | **Validação de tenant duplicada em 3 componentes** de frontend (`StaffRoute`, `TenantSlugGuard`, `LegacyTenantRedirect`), cada um refazendo a mesma query | Resolução **única** no `proxy.ts`, resultado propagado por header e lido por um helper (§3.3). Nenhum componente resolve tenant |
| 5 | **Regra de negócio dentro do banco**: `rh_calc_inss`, `rh_calc_irpf`, `rh_generate_payroll` em PL/pgSQL — impossível de testar unitariamente, impossível de versionar junto com a UI | Regra de negócio em TypeScript, testada com Vitest. No banco ficam apenas: helpers de RLS, triggers de integridade e funções `SECURITY DEFINER` de operação atômica (§2.5) |
| 6 | **Troca de enum já quebrou produção uma vez**: `app_role` foi renomeado de `colaborador/tecnico/supervisor/diretor` para `owner/admin/manager/member/viewer` via `DROP ... CASCADE` + recriação manual de todas as policies | Enums desenhados com folga desde o início; alteração de enum sempre por `ALTER TYPE ... ADD VALUE` (nunca DROP). Policies escritas em arquivo próprio e recriáveis por script idempotente (§5.2) |
| 7 | **Tabelas órfãs** (11 tabelas Kanban sem UI, depois removidas) | Nenhuma tabela entra em migration sem a fatia de UI correspondente na mesma fase do roadmap (§10) |
| 8 | **Chave de IA (BYOK) em texto puro** no Postgres, protegida apenas por ausência de policy | Chave em **Supabase Vault** (ou envelope encryption com chave em variável de ambiente), nunca em coluna legível, nunca retornada ao cliente (§7.6) |
| 9 | **Config permissiva de TypeScript** — origem de boa parte do drift | `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, sem `any` implícito, ESLint com `@typescript-eslint/no-explicit-any` como erro |
| 10 | **Ausência de testes** — não há teste de RLS, e RLS é o que separa os dados de duas empresas | Teste de isolamento **obrigatório** por tabela com pgTAP; PR que adiciona tabela sem teste de RLS não passa no CI (§7.9, §9.5) |
| 11 | **Duas entidades de cliente**: `profiles` (staff) e `customer_profiles` (consumidor SAC), com `AuthContext` fazendo duas queries e um `isCustomer` implícito | Modelo explícito: `users` (identidade) + `memberships` com `scope` (`staff` \| `portal` \| `partner`). Uma query, um contrato (§5.3.4) |

### 1.5 O que é novo neste rebuild

Cinco capacidades que **não existem** no sistema atual:

1. **Work Management** (§5.10) — projetos, tarefas, comentários e log de atividade genéricos. É a espinha
   dorsal de trabalho em equipe que faltava (o Kanban antigo nunca teve UI). Toda entidade de outros módulos
   pode gerar tarefa e receber comentário pelo mesmo mecanismo.
2. **Comercial / CRM / Distribuidores** (§5.19) — funil de vendas, rede de distribuidores com territórios,
   pedidos, metas e comissões, visitas com check-in geolocalizado e pesquisa de ponto de venda. Integrado:
   cliente unificado com o SAC, faturamento gerando lançamentos no Financeiro, catálogo único de produtos.
3. **Prospecção de leads por IA** (§5.19.8) — agente que busca leads por cidade/estado/região e segmento
   usando a credencial de IA da própria organização (BYOK), com fila de aprovação humana antes de virar conta.
4. **Workflows / Automação** (§5.21) — builder visual (ReactFlow) e motor de execução: "quando X acontecer,
   faça Y". Substitui a dezena de triggers PL/pgSQL específicos que o sistema atual acumulou.
5. **Billing / Stripe** (§5.22) — planos, assinaturas, seats, faturas e webhooks, com enforcement real de
   limites. Hoje existe apenas um `plan_config` JSON preenchido à mão.

Mais duas capacidades de engenharia, não de produto: **observabilidade** (§9) e **suíte de testes** (§9.5).

### 1.6 Estratégia de dados: começar limpo

**Decisão confirmada: base de dados nova e vazia. Não há ETL, não há convivência com o legado, não há cutover.**

Consequências práticas, que valem para todo o documento:

- O sistema atual permanece **rodando e intocado** enquanto o novo é construído. Ele é fonte de consulta
  (regra de negócio, layout, textos), não fonte de dados.
- Não existe compatibilidade retroativa a preservar: UUIDs, nomes de coluna, enums e formatos podem ser
  escolhidos pelo que é **correto**, não pelo que é **compatível**.
- A entrada em produção de cada organização é feita por **onboarding novo** (§7.1.4) com dados semeados
  (categorias, SLAs, perfis de acesso padrão) — não por importação.
- Se, no futuro, alguma organização precisar trazer histórico, isso é um **projeto de importação de dados
  por módulo** (CSV/planilha via a tela de importação do próprio módulo), não uma migração de banco.

### 1.7 Escala-alvo e premissas de dimensionamento

O dimensionamento orienta índices, particionamento e o gatilho de saída do Supabase (§2.4). Premissas para
os primeiros 24 meses:

| Dimensão | Ano 1 (conservador) | Ano 2 (meta) | Implicação arquitetural |
|---|---|---|---|
| Organizações ativas | 20–50 | 200–500 | Banco único com RLS é suficiente; sem sharding |
| Usuários staff por org | 10–80 | 10–300 | `memberships` com índice por org; nada exótico |
| Chamados/mês (total) | 20k | 300k | `tickets` cresce ~4M/ano no ano 2 → índices compostos por org+status; particionamento só em §3.7 |
| Linhas em `activity_log` | ~2M | ~40M | **Particionamento por mês desde o início** (§5.6) |
| Execuções de workflow/mês | — | 500k | `workflow_executions` particionada e com expurgo (§5.21) |
| Documentos/anexos | 50 GB | 500 GB | Storage privado por org; egress vira custo relevante → gatilho de R2 (§2.4) |
| Chamadas de IA/mês | 50k | 1M | BYOK: custo é do tenant; o nosso custo é latência e rate limit (§7.4) |

---
## 2. STACK TECNOLÓGICA

### 2.1 Princípio de escolha

A stack foi escolhida com **três critérios**, nesta ordem:

1. **Velocidade de saída para produção agora.** O produto já existe e tem usuários; o rebuild não pode levar
   um ano. Plataforma gerenciada vence infraestrutura própria nesta fase.
2. **Portabilidade.** Nenhuma decisão da Fase 1 pode tornar a Fase 2 (alta escala, infra própria) cara.
   Concretamente: o schema é SQL puro, as policies não dependem de função exclusiva do Supabase, e o Next.js
   já é buildado em modo `standalone`.
3. **Adequação a desenvolvimento assistido por IA.** O código será majoritariamente escrito com Claude Code.
   Isso favorece stacks com convenções fortes, tipagem ponta-a-ponta e um único jeito de fazer cada coisa.

### 2.2 Stack da Fase 1 — Supabase + Vercel

| Camada | Escolha | Racional |
|---|---|---|
| **Framework** | **Next.js 16 (App Router)** | React Server Components reduzem JS enviado ao browser (o painel atual é pesado); `proxy.ts` nativo resolve o tenant por subdomínio em um único lugar; Server Actions eliminam metade da camada de API; SSR real para landing e portal SAC (SEO). Substitui o SPA Vite + React Router |

**O que muda por ser Next 16 e não 15** — a versão instalada avisa, no próprio `AGENTS.md` que gera,
que convenções mudaram e que os guias em `node_modules/next/dist/docs/` devem ser lidos antes de
escrever código. O que afeta esta arquitetura:

| Mudança | Efeito aqui |
|---|---|
| `middleware.ts` → **`proxy.ts`** | §3.3, §6.2. Mesmo comportamento, nome novo |
| **Turbopack por padrão** em `dev` e `build` | Sem flag `--turbopack`. Config de Turbopack sai de `experimental` |
| `next lint` removido | Lint pela CLI do ESLint; a chave `eslint` some do `next.config.ts` (§8.4) |
| APIs de request 100% assíncronas | `cookies()`, `headers()`, `params`, `searchParams` — sempre `await` |
| React 19.2 | View Transitions, `useEffectEvent`, `Activity` disponíveis |
| Node 20.9+ e TypeScript 5.1+ | Mínimos da plataforma |
| **Linguagem** | **TypeScript 5.x, `strict: true`** | `strictNullChecks` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. A config permissiva atual é a origem direta da dívida §1.4.3 |
| **Runtime de dados** | **`@supabase/supabase-js` + `@supabase/ssr`** | Três clientes com responsabilidades distintas: `browser` (componentes client), `server` (RSC/Server Actions, lê cookies) e `admin` (`service_role`, **só** em Route Handlers e Edge Functions, nunca em código que roda por requisição de usuário). Como a sessão do usuário viaja no JWT, **o RLS é aplicado automaticamente** — é isso que torna o isolamento barato |
| **Banco** | **Supabase Postgres 17**, região `sa-east-1` | Latência para o Brasil; RLS nativo; PITR no plano pago; `pgvector`, `pg_cron`, `pg_net` e Vault disponíveis sem instalar nada |
| **Migrations** | **SQL versionado** em `supabase/migrations/*.sql` via Supabase CLI | Fonte única de verdade do schema, revisável em PR, **portável para qualquer Postgres**. Regra absoluta: **nenhuma alteração de schema pelo dashboard** |
| **Tipos do banco** | `supabase gen types typescript` executado no CI | Elimina o drift do §1.4.3. O arquivo gerado é commitado e o CI falha se estiver desatualizado |
| **Auth** | **Supabase Auth (GoTrue)** — senha, magic link, OTP por e-mail | `auth.uid()` funciona nativamente dentro do RLS. Construir auth próprio nesta fase seria gastar semanas para reimplementar recuperação de senha, verificação de e-mail e rotação de refresh token |
| **Autorização** | RLS + `memberships.role` + `access_profiles.permissions` (JSONB), checado em `lib/auth/rbac.ts` | §7.3 |
| **Backend lógico** | **Server Actions** (mutações originadas na UI) · **Route Handlers** (webhooks, streaming SSE, API pública) · **Edge Functions Deno** (jobs disparados pelo banco ou por terceiros) | Regra: Server Action para o que nasce da UI; Edge Function para o que nasce do banco (`pg_cron`) ou de fora (webhook de provedor) |
| **Filas / agendamento** | Tabela-fila com `FOR UPDATE SKIP LOCKED` + **`pg_cron`** + **`pg_net`** + **Vercel Cron** | Substitui o `pgmq` atual por um padrão **auditável e testável**: a fila é uma tabela normal, com RLS, histórico e retry visível na UI de suporte |
| **Cache / rate limit** | **Upstash Redis** + `@upstash/ratelimit` + `unstable_cache` do Next | Redis serverless com billing por request; resolução de tenant e rate limiting precisam de um store compartilhado entre lambdas |
| **Realtime** | **Supabase Realtime** — *Broadcast from Database* em canais privados | Preferir broadcast a `postgres_changes`: escala melhor, não replica a linha inteira para todos e respeita autorização via `realtime.messages` |
| **Storage** | **Supabase Storage**, buckets **privados**, path `org/{organization_id}/{entidade}/{id}/{arquivo}` | A policy de storage reusa o mesmo `is_org_member()` das tabelas — um único conceito de pertencimento (§7.7) |
| **Busca textual** | `pg_trgm` + `tsvector` com dicionário `portuguese` | Busca global e busca dentro de módulo sem serviço externo |
| **Busca semântica** | **`pgvector`** (embeddings de POPs, chamados e produtos) | Já é requisito (busca semântica de POPs existe hoje via IA); manter no Postgres evita um segundo sistema de verdade |
| **UI** | **Tailwind + shadcn/ui + Radix** | O design system atual (52 componentes) porta praticamente 1:1. Mantém a diretriz visual do §1.1: paleta Monday clara, Figtree + JetBrains Mono, cantos de 8/6/4px, alta densidade |
| **Canvas de automação** | **ReactFlow (`@xyflow/react` v12)** | Já validado em produção no módulo de diagramas de rede — risco de adoção próximo de zero. Serve workflows, diagramas de rede e mapas de instalação |
| **Formulários** | **React Hook Form + Zod** | O mesmo schema Zod valida no client e na Server Action — uma definição, duas fronteiras |
| **Estado de servidor** | **TanStack Query v5** onde há interatividade pesada (fila de chamados, kanban, canvas); RSC no resto | Não usar Query para o que o RSC já resolve — é a principal fonte de complexidade acidental em apps Next |
| **Tabelas / gráficos** | **TanStack Table** + **Recharts** | Recharts já em uso; TanStack Table resolve as tabelas densas de alta contagem de colunas do produto |
| **PDF / planilha** | `@react-pdf/renderer` (server) + `exceljs` | Geração no servidor, não no browser (o `jspdf` atual gera no client e não é auditável). Exportação é registrada em `activity_log` |
| **IA** | **`@anthropic-ai/sdk`** como provedor primário, atrás de uma abstração multi-provedor **BYOK** | Preserva o padrão `callTenantAI`/`streamTenantAI` já validado. Modelo padrão: `claude-sonnet-5`; tarefas simples e de alto volume em `claude-haiku-4-5` |
| **E-mail** | **Resend** + **React Email** | Provedor mantido (já validado); templates viram componentes React versionados |
| **Pagamentos** | **Stripe** — Checkout, Billing Portal, Webhooks | §5.22 |
| **Erros / observabilidade** | **Sentry** + Vercel Analytics + Supabase Logs + `get_advisors` no CI | §9 |
| **Testes** | **Vitest** + Testing Library + **Playwright** (E2E) + **pgTAP** (RLS) | Testar RLS é obrigatório, não opcional (§9.5) |
| **Lint / format** | ESLint 9 (flat config) + Prettier + `supabase db lint` | |
| **Monorepo** | Não. **Um repositório, um app Next.js.** | Monorepo com Turborepo só se/quando existir um segundo deployable (app mobile ou serviço de workers) |

**O que explicitamente NÃO entra na Fase 1:** Prisma, Drizzle, NextAuth, Redis self-hosted, Docker, Nginx,
Kubernetes, microserviços, GraphQL, message broker dedicado. Tudo isso é Fase 2 ou nunca.

### 2.3 Alternativas consideradas e por que foram rejeitadas

| Decisão | Alternativa | Por que foi rejeitada |
|---|---|---|
| **Next.js 16** | Manter Vite SPA + React Router | Não resolve nenhum problema atual: sem SSR para o portal público, sem middleware para tenant, exige backend separado para tudo. Manter significaria repetir a arquitetura que estamos abandonando |
| | Remix / React Router 7 | Excelente, mas menor massa de conhecimento e de exemplos — relevante num projeto tocado por IA, onde a qualidade da geração acompanha a densidade do ecossistema |
| **Supabase** | Postgres gerenciado puro (Neon/RDS) + auth próprio | Perderíamos Auth, Storage, Realtime e o `auth.uid()` no RLS. Custaria 6–8 semanas de trabalho para reconstruir o que já funciona |
| | Firebase / Firestore | Modelo de dados não relacional é incompatível com um domínio com ~110 entidades relacionadas, folha de pagamento e conciliação financeira |
| **`supabase-js` + RLS** | **Prisma** | O engine do Prisma é pesado em serverless (cold start) e, mais grave: conectando com usuário privilegiado, **o RLS não se aplica** — seria preciso `SET LOCAL` em toda transação e disciplina perfeita. Isso troca uma garantia do banco por uma convenção de código. Prisma volta na Fase 2, quando houver worker persistente e conexão dedicada |
| | **Drizzle** | Tipagem excelente e SQL-first, mas tem o mesmo problema de RLS acima e adicionaria uma segunda definição de schema paralela ao SQL das migrations. **Fica como opção da Fase 2** |
| | `supabase-js` sem ORM em consultas analíticas complexas | Aceito: consultas de indicadores usam **views e RPC em SQL puro** (§5.23), não o query builder |
| **SQL migrations pela CLI** | Migrations geradas por ORM | Amarra o schema ao ORM. SQL puro é portável e revisável linha a linha — importante quando quem escreve é uma IA e quem revisa é humano |
| **Vercel** | VPS + Docker desde o dia 1 | Custo de operação (SSL, deploy, rollback, monitoramento, backup) alto demais para a fase atual, com ganho zero de produto. É a Fase 2, com gatilho objetivo (§2.4) |
| | Cloudflare Workers | Runtime limitado para dependências Node pesadas (PDF, planilha, SDKs) |
| **Upstash Redis** | Redis self-hosted | Não há infra própria na Fase 1. `@upstash/ratelimit` tem adapter `ioredis`, então a Fase 2 é troca de driver |
| **pgvector** | Pinecone / Qdrant | Volume projetado (centenas de milhares de vetores) cabe folgadamente no Postgres. Um segundo sistema de verdade só se paga acima de ~10M vetores |
| **Stripe** | Pagar.me / Asaas (PIX e boleto nativos) | Stripe entra primeiro pela qualidade de API e Billing Portal. **Ponto aberto**: o mercado brasileiro exige boleto e PIX — a camada de pagamento é isolada em `lib/billing/` para permitir um segundo provedor sem tocar no domínio (§11, ADR-012) |
| **Sem monorepo** | Turborepo com `apps/` e `packages/` | Complexidade sem benefício com um único deployable. Reavaliar quando surgir app mobile |

### 2.4 Stack da Fase 2 — alta escala

A stack self-hosted **não é abandonada — é adiada**, e passa a ter gatilhos objetivos em vez de intuição.

#### 2.4.1 Gatilhos de migração (qualquer um, sustentado por ~30 dias)

| Sinal | Limiar | Por que força a mudança |
|---|---|---|
| CPU do Postgres gerenciado | > 70% sustentado no maior compute viável | Sem tuning fino (shared_buffers, workers, vacuum) no gerenciado |
| Conexões | Pooler saturado com pico > 60% das conexões mesmo com PgBouncer em `transaction` | Precisa de controle do pooler |
| Custo mensal Vercel + Supabase + Upstash | > (custo de VPS + 1 dia/mês de ops valorado) | Ponto de equilíbrio econômico puro |
| Duração de job | Execuções > 300 s (folha de pagamento, importação grande, workflow longo) | Function serverless não sustenta; precisa de worker persistente |
| Egress de Storage | Egress vira item dominante da fatura | Cloudflare R2 tem egress gratuito |
| Volume de escrita | > ~5–10k writes/s, ou `activity_log`/`workflow_executions` exigindo vacuum agressivo | Precisa de controle de partição, réplica e autovacuum |
| Compliance | Contrato exigindo VPC dedicada, residência específica ou on-premise | Gerenciado não atende |

#### 2.4.2 Stack alvo e caminho de migração

| Camada | Fase 2 | Como se migra a partir da Fase 1 |
|---|---|---|
| Hospedagem | VPS (Hetzner/Hostinger) — Docker Compose + Nginx, atrás de Cloudflare | `next.config.ts` já usa `output: 'standalone'` → muda o alvo do deploy, não o código |
| Banco | PostgreSQL 17 self-hosted + 1–2 réplicas de leitura | `pg_dump`/replicação lógica. **As migrations SQL rodam inalteradas** |
| Identidade no RLS | `SET LOCAL app.current_user_id` + `current_setting()` | **Ponto crítico:** nenhuma policy chama `auth.uid()` diretamente — todas passam por `public.current_user_id()` (§3.4). Na Fase 2 troca-se **uma função**, não 300 policies |
| Auth | NextAuth.js (ou Better Auth) | Hashes do GoTrue não são portáveis → redefinição de senha obrigatória no primeiro login. Custo aceito e planejado |
| Acesso a dados | Prisma ou Drizzle sobre o schema existente (`prisma db pull`) | `supabase-js` sai módulo a módulo; a interface `lib/data/` isola a troca |
| Filas | Redis + BullMQ, workers em container próprio | A tabela-fila da Fase 1 vira o produtor; o consumidor muda |
| Cache / rate limit | Redis local | `@upstash/ratelimit` tem adapter `ioredis` |
| Storage | Cloudflare R2 (S3-compatible) | Cópia bucket a bucket. Todo acesso já passa por `lib/storage/` — troca de driver |
| Realtime | SSE próprio ou Realtime self-hosted | Uso de Realtime é isolado em `lib/realtime/` |
| DNS/SSL/CDN | Cloudflare (wildcard + Origin Certificate) | §8.7 |
| CI/CD | GitHub Actions → imagem Docker → deploy por SSH (ou Coolify/Dokploy) | §8.6 |

#### 2.4.3 Decisões tomadas **hoje** para baratear a Fase 2

Estas cinco regras valem desde a primeira linha de código. Elas custam quase nada agora e economizam meses depois:

1. **Nenhuma policy chama `auth.uid()` diretamente.** Todas passam por `public.current_user_id()` (§3.4).
2. **`auth.users` é referenciada por exatamente uma tabela** — `public.users`. Todo o resto referencia
   `public.users(id)`. Trocar de provedor de auth toca uma tabela.
3. **Regra de negócio em TypeScript, não em PL/pgSQL.** Exceções permitidas e limitadas: helpers de RLS,
   triggers de integridade, e funções `SECURITY DEFINER` para operações que precisam ser atômicas
   (criar organização, aceitar convite, gerar número sequencial).
4. **Toda dependência de plataforma passa por uma interface própria**: `lib/storage/`, `lib/realtime/`,
   `lib/queue/`, `lib/mail/`, `lib/cache/`. Nenhum `supabase.storage.from(...)` espalhado por componentes.
5. **`output: 'standalone'` no `next.config.ts` desde o dia 1** — a imagem Docker já funciona, e é testada
   no CI mesmo sem ser usada em produção.

### 2.5 Onde mora a regra de negócio

Decisão explícita, porque o sistema atual errou aqui (§1.4.5):

| Camada | O que pode conter | O que não pode |
|---|---|---|
| **Banco (SQL/PL-pgSQL)** | Constraints, FKs, índices, RLS, triggers de integridade (imutabilidade de `organization_id`, `updated_at`, numeração sequencial), funções `SECURITY DEFINER` atômicas, views de leitura/indicadores | Cálculo fiscal, regra de precificação, política de SLA, orquestração, envio de e-mail |
| **Server Action / Route Handler** | Validação Zod, autorização (`can()`), orquestração de casos de uso, transação | Consulta SQL crua espalhada (usar `lib/data/`), regra de domínio pura |
| **`modules/*/domain/`** | **Regra de negócio pura e testável**: cálculo de INSS/IRRF, apuração de comissão, cálculo de SLA, ranking, elegibilidade de benefício | Acesso a banco, I/O, `fetch` |
| **Componentes React** | Apresentação, estado de UI, validação de formulário (mesmo schema Zod) | Regra de negócio, decisão de permissão |

> Teste de fumaça da regra: *se uma função precisa de banco para ser testada, ela não é regra de domínio.*

---
## 3. MULTI-TENANCY

### 3.1 Estratégia: banco único, `organization_id`, RLS nativo

Um banco, um schema `public`, **toda tabela de negócio carrega `organization_id uuid NOT NULL`**, e todo
acesso passa por Row Level Security.

Alternativas rejeitadas:

| Estratégia | Por que não |
|---|---|
| **Schema por tenant** | Com ~110 tabelas, cada migration precisaria rodar N vezes; `search_path` vira estado global perigoso; conexões e catálogo do Postgres degradam a partir de algumas centenas de schemas |
| **Banco por tenant** | Custo e operação inviáveis nesta fase (backup, migration, monitoramento × N). Reservado para um eventual tier "enterprise dedicado", que é uma decisão comercial, não arquitetural |
| **Isolamento só na aplicação** (WHERE manual) | Um `WHERE organization_id` esquecido é um vazamento entre empresas. Inaceitável |

Nomenclatura: `tenant_id` do sistema atual passa a ser **`organization_id`** em toda a stack — colunas,
headers HTTP, claims do JWT, variáveis de sessão, nomes de função. `tenants` passa a ser `organizations`.

### 3.2 Camadas de isolamento (defesa em profundidade)

```
1. Middleware        → resolve a organization pelo host, injeta x-organization-id
2. Sessão            → valida que o usuário tem membership ATIVA nessa organization
3. RBAC (aplicação)  → can(actor, resource, action) antes de qualquer mutação
4. RLS (banco)       → rede de segurança: mesmo com bug na app, o Postgres nega
5. FK composta       → torna referência cross-tenant estruturalmente impossível
6. Trigger           → organization_id é imutável após o INSERT
```

Nenhuma camada sozinha é suficiente:

- As camadas 1–3 são as que dão **boas mensagens de erro** e evitam trabalho inútil.
- A camada 4 é a única que continua valendo **se 1–3 tiverem bug**.
- A camada 5 é a única que impede um `task.project_id` apontar para um projeto de outra organização —
  situação que o RLS **não** detecta, porque o RLS avalia a linha sendo lida/escrita, não a coerência da FK.
- A camada 6 impede o ataque "criar na minha org, depois mover para a org da vítima".

### 3.3 Resolução de tenant por subdomínio

Padrão primário: **`{slug}.helpoint.com.br`**.
Mantido: **domínio customizado** (white-label, já em uso hoje) via `organization_domains`.
Descontinuado: o padrão atual de path `/t/:slug/...` e toda a camada de redirecionamento legado.

> **Next.js 16:** o arquivo `middleware.ts` passou a se chamar **`proxy.ts`** e a função exportada,
> `proxy`. Comportamento idêntico. A documentação do Next é explícita em que proxy **não** é lugar de
> autorização nem de busca lenta de dados — o que combina com o desenho aqui: a checagem é otimista, e
> quem decide é o `getOrgContext()` (§3.5) com o RLS por trás.

> ⚠️ **A ORDEM DAS OPERAÇÕES É PARTE DA SEGURANÇA.**
> `NextResponse.next({ request: { headers } })` **congela** os headers da requisição no momento da
> construção. Escrever em `res.headers` depois altera a resposta ao **browser**, não o que a aplicação
> recebe. Uma primeira implementação fez exatamente isso e produziu dois defeitos ao mesmo tempo:
> `getOrgContext()` nunca encontrava o header (quebrando o app inteiro no Edge) **e** o `organization_id`
> vazava para o cliente. Por isso a organização é resolvida **antes** de construir a resposta.

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolveOrganizationByHost } from '@/lib/tenant/resolve';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|woff2)$).*)'],
};

export async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();

  // 1. Resolver a organização ANTES de montar a resposta (cache 60 s — §3.6)
  const org = await resolveOrganizationByHost(host);

  // 2. Headers da REQUISIÇÃO: descarta o que veio do cliente, injeta o real
  const forwarded = new Headers(req.headers);
  forwarded.delete('x-organization-id');
  forwarded.delete('x-organization-slug');
  if (org) {
    forwarded.set('x-organization-id', org.id);
    forwarded.set('x-organization-slug', org.slug);
  }

  const res = NextResponse.next({ request: { headers: forwarded } });

  // 3. Refresh do cookie de sessão — obrigatório no proxy com @supabase/ssr
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();

  // 4. Host sem organização = site institucional / login genérico
  if (!org) return res;

  // 5. Organização suspensa (inadimplência, §5.22)
  if (org.status !== 'active' && org.status !== 'trialing' && !isBillingPath(req.nextUrl.pathname)) {
    return withSessionCookies(
      NextResponse.rewrite(new URL('/organizacao-suspensa', req.url), { request: { headers: forwarded } }),
      res,
    );
  }

  // 6. Guarda otimista de sessão
  if (!user && requiresAuth(req.nextUrl.pathname)) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', req.nextUrl.pathname);
    return withSessionCookies(NextResponse.redirect(login), res);
  }

  return res;
}
```

Em `redirect` e `rewrite`, copiar `res.headers` inteiro levaria os headers internos do Next
(`x-middleware-next`, `x-middleware-override-headers`) para uma resposta terminal. Só os cookies de
sessão renovados interessam — daí o `withSessionCookies`.

**Regra de segurança:** os headers `x-organization-*` são **sempre sobrescritos** pelo proxy. Um cliente
que os envie tem o valor descartado. O helper de leitura (§3.5) nunca aceita `organization_id` de body,
query string ou header vindo do browser.

#### 3.3.1 Subdomínios reservados

```ts
// src/lib/tenant/reserved.ts
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'login', 'signup', 'account', 'billing',
  'docs', 'status', 'static', 'assets', 'cdn', 'img', 'files', 'mail', 'smtp',
  'blog', 'help', 'suporte', 'support', 'sac', 'dev', 'staging', 'test',
  'preview', 'demo', 'helpoint', 'internal', 'root', 'system', 'security',
]);
```

A mesma lista é replicada como `CHECK` na coluna `organizations.slug` (§5.3.1) — validar só na aplicação
permitiria criar um slug proibido por um caminho que esqueça a checagem.

#### 3.3.2 Domínio customizado

Fluxo (portado do sistema atual, que já o tem em uso real):

1. Admin cadastra `suporte.acme.com.br` em Configurações → Domínios.
2. Sistema gera `verification_token` e instrui: `CNAME suporte → cname.helpoint.com.br` e
   `TXT _helpoint-verify.suporte → {token}`.
3. Job de verificação (`dns/promises` em Route Handler, ou `Deno.resolveDns` em Edge Function) confere
   ambos os registros; ao passar, grava `verified_at` e provisiona o certificado (Vercel Domains API na
   Fase 1; Cloudflare + Let's Encrypt na Fase 2).
4. `resolveOrganizationByHost` passa a resolver aquele host.
5. Reverificação diária; após 7 dias falhando, o domínio é marcado `broken` e a organização é notificada —
   nunca desativado silenciosamente.

### 3.4 RLS: identidade portável

Este é o detalhe que decide se a Fase 2 custa uma semana ou seis meses.

**Nenhuma policy chama `auth.uid()` diretamente.** Todas passam por `public.current_user_id()`:

```sql
-- Fase 1 (Supabase Auth): a identidade vem do JWT do GoTrue.
create or replace function public.current_user_id()
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,  -- Fase 2 / jobs / testes
    auth.uid()                                                       -- Fase 1
  );
$$;
```

Na Fase 2 (sem Supabase Auth), a **única** alteração é remover a segunda linha do `coalesce`. As ~300
policies continuam válidas sem edição. A ordem do `coalesce` também torna testável: pgTAP e workers definem
`SET LOCAL app.current_user_id` e exercitam as policies sem GoTrue.

Sobre a organização corrente, o mesmo princípio:

```sql
-- Organização "ativa" do usuário: derivada da membership, nunca informada pelo cliente.
create or replace function public.current_organization_id()
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.current_organization_id', true), '')::uuid,
    (select m.organization_id
       from public.memberships m
      where m.user_id = public.current_user_id()
        and m.status  = 'active'
        and m.deleted_at is null
      order by m.last_used_at desc nulls last, m.created_at asc
      limit 1)
  );
$$;
```

> **Por que não confiar em um claim `organization_id` no JWT?** Porque o JWT do Supabase é emitido no login e
> um usuário pode pertencer a mais de uma organização (consultor, grupo econômico, parceiro). Derivar da
> `membership` mantém a verdade em uma tabela auditável e revogável na hora — remover a membership derruba o
> acesso imediatamente, sem esperar o refresh do token.

Funções de pertencimento e papel, usadas por todas as policies:

```sql
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = p_org
       and m.user_id = public.current_user_id()
       and m.status = 'active'
       and m.deleted_at is null
  );
$$;

create or replace function public.org_role(p_org uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
   where m.organization_id = p_org
     and m.user_id = public.current_user_id()
     and m.status = 'active'
     and m.deleted_at is null
   limit 1;
$$;

create or replace function public.has_min_role(p_org uuid, p_min public.member_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    public.role_rank(public.org_role(p_org)) <= public.role_rank(p_min),
    false);
$$;

-- rank menor = mais poder (owner = 1)
create or replace function public.role_rank(r public.member_role)
returns int language sql immutable as $$
  select case r
    when 'owner'   then 1
    when 'admin'   then 2
    when 'manager' then 3
    when 'member'  then 4
    when 'viewer'  then 5
    when 'partner' then 6
    when 'portal'  then 7
  end;
$$;

-- Escopo da membership: staff (painel), partner (distribuidor), portal (SAC)
create or replace function public.is_staff(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = p_org
       and m.user_id = public.current_user_id()
       and m.status = 'active' and m.scope = 'staff' and m.deleted_at is null
  );
$$;
```

> `security definer` + `set search_path = ''` em **todas** as funções de segurança. Sem isso, um schema
> malicioso no `search_path` pode sequestrar a resolução de nomes — é a falha clássica de `SECURITY DEFINER`.

### 3.5 Contexto de tenant na aplicação

```ts
// src/lib/tenant/context.ts
import { headers } from 'next/headers';
import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';

export type OrgContext = {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  membershipId: string;
  role: MemberRole;
  scope: MembershipScope;
  permissions: PermissionMap;
};

/** Fonte ÚNICA da organização + identidade no servidor. `cache()` = uma query por request. */
export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const h = await headers();
  const organizationId = h.get('x-organization-id');
  if (!organizationId) throw new TenantNotResolvedError();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new UnauthenticatedError();

  // A membership é a prova de que este usuário pertence a ESTA organização.
  const { data: membership } = await supabase
    .from('memberships')
    .select('id, role, scope, organization_id, organizations(slug), access:membership_permissions_view(permissions)')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle();

  if (!membership) throw new NotAMemberError(organizationId);
  return { organizationId, userId: user.id, membershipId: membership.id, /* ... */ } as OrgContext;
});
```

Regras de uso, verificadas por lint (§6.5):

- Toda Server Action e todo Route Handler autenticado **começa** por `getOrgContext()`.
- Nenhuma função de dados aceita `organizationId` como parâmetro vindo de fora da camada de contexto.
- Toda inserção grava `organization_id: ctx.organizationId` — nunca um valor do formulário.

### 3.6 Cache de resolução de tenant

A resolução host → organização acontece em **toda requisição**. Sem cache, é uma query por request.

```ts
// src/lib/tenant/resolve.ts
const TTL_SECONDS = 60;

export async function resolveOrganizationByHost(host: string): Promise<ResolvedOrg | null> {
  const sub = extractSubdomain(host); // acme.helpoint.com.br -> "acme"
  if (sub && RESERVED_SUBDOMAINS.has(sub)) return null;

  const key = `org:host:${host}`;
  const cached = await redis.get<ResolvedOrg | 'MISS'>(key);
  if (cached) return cached === 'MISS' ? null : cached;

  const org = sub
    ? await lookupBySlug(sub)
    : await lookupByCustomDomain(host);

  // Cachear a AUSÊNCIA também — senão um scanner de subdomínios vira DoS no banco.
  await redis.set(key, org ?? 'MISS', { ex: org ? TTL_SECONDS : 30 });
  return org;
}
```

Invalidação explícita ao renomear slug, verificar domínio ou suspender organização:
`await redis.del(...)` na mesma Server Action que faz a alteração. O TTL de 60 s é o teto do prejuízo caso a
invalidação falhe.

### 3.7 Multi-tenancy e escala

O isolamento por RLS tem custo. Estas são as decisões que o tornam sustentável:

| Prática | Regra |
|---|---|
| **Índice líder por organização** | Todo índice de tabela de negócio começa por `organization_id`. `create index t_org_status_idx on tickets (organization_id, status, created_at desc)` — nunca `(status)` sozinho |
| **Policies simples** | Uma policy que faz subquery pesada é executada por linha. Todas usam `is_org_member()`/`has_min_role()`, que são `stable` e resolvidas uma vez por consulta |
| **`stable`, não `volatile`** | Funções de segurança marcadas `stable` permitem que o planejador cacheie o resultado dentro da consulta. Marcar errado multiplica o custo por linha |
| **`force row level security`** | Aplica RLS inclusive ao dono da tabela. Sem isso, uma conexão com o role errado ignora tudo |
| **Nunca `service_role` por conveniência** | O cliente admin existe para 5 casos nomeados (§7.2). Cada uso é revisado |
| **Paginação obrigatória** | Nenhuma consulta de listagem sem `limit`. Cursor (keyset) em listas grandes, não `offset` |
| **Particionamento por tempo** | `activity_log`, `workflow_executions`, `notifications` e `ai_messages` particionadas por mês desde o dia 1 (§5.9) — reparticionar tabela grande depois é doloroso |
| **Expurgo com política** | Cada tabela de alto volume tem retenção declarada e um job de expurgo (§5.24) |

Caminho de escala, em ordem, com gatilho:

1. **Índices compostos + keyset pagination** — desde o dia 1.
2. **Réplica de leitura** para relatórios e dashboards — quando leitura analítica atrapalhar transação.
3. **Particionamento** das tabelas de log/evento — desde o dia 1 nas quatro citadas; estendido a `tickets`
   e `crm_visits` quando passarem de ~50M linhas.
4. **Tabelas de agregação materializada** (`mv_ticket_daily_metrics`, `mv_crm_funnel_daily`) atualizadas por
   `pg_cron` — quando o dashboard passar de ~1 s.
5. **Sharding por organização** (organizações grandes em cluster dedicado) — **último recurso**, só com
   compliance ou um tenant desproporcional exigindo.

### 3.8 Testes de isolamento — obrigatórios

Um vazamento entre organizações é o pior defeito possível neste produto. Portanto:

> **Toda tabela com `organization_id` tem, no mesmo PR, um teste pgTAP provando que a organização A não lê,
> não escreve, não atualiza e não apaga linha da organização B.** CI bloqueia o merge sem isso.

```sql
-- supabase/tests/rls/tickets.test.sql
begin;
select plan(6);

select tests.create_org('org-a'); select tests.create_org('org-b');
select tests.create_user('ana@a.com', 'org-a', 'admin');
select tests.create_user('bob@b.com', 'org-b', 'admin');

select tests.authenticate_as('ana@a.com');
select lives_ok($$ insert into tickets (organization_id, title, description, requester_id)
                   values (tests.org_id('org-a'), 'T1', 'x', tests.user_id('ana@a.com')) $$,
                'membro insere na própria org');

select throws_ok($$ insert into tickets (organization_id, title, description, requester_id)
                    values (tests.org_id('org-b'), 'T2', 'x', tests.user_id('ana@a.com')) $$,
                 '42501', null, 'membro NÃO insere em org alheia');

select tests.authenticate_as('bob@b.com');
select is_empty($$ select id from tickets where organization_id = tests.org_id('org-a') $$,
                'org B não enxerga ticket da org A');
select is((select count(*) from tickets)::int, 0, 'contagem total respeita RLS');

select results_eq($$ update tickets set title = 'hack'
                      where organization_id = tests.org_id('org-a') returning 1 $$,
                  $$ select 1 where false $$, 'update cross-tenant não afeta linhas');
select results_eq($$ delete from tickets
                      where organization_id = tests.org_id('org-a') returning 1 $$,
                  $$ select 1 where false $$, 'delete cross-tenant não afeta linhas');

select * from finish();
rollback;
```

Um gerador (`scripts/gen-rls-test.ts`) cria o esqueleto para cada tabela nova, e um teste-meta varre o
catálogo do Postgres e falha se existir tabela em `public` com `organization_id` **sem** RLS habilitado,
sem `force`, ou sem arquivo de teste correspondente:

```sql
-- supabase/tests/rls/_meta.test.sql — a rede que pega o que o humano esqueceu
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnum > 0)
     and (c.relrowsecurity = false or c.relforcerowsecurity = false)
$$, 'toda tabela com organization_id tem RLS enable + force');
```

---
## 4. Convenções de modelagem e nomenclatura

Estas convenções são **normativas**. Toda tabela de §5 as segue, e toda tabela nova criada depois também.

### 4.1 Idioma: identificadores em inglês, interface em português

**Decisão:** schema, código e identificadores em **inglês**; toda a interface em **português do Brasil**.

Motivo: o sistema atual mistura os dois (`mkt_suppliers.category` com valores `'grafica'`, `'audiovisual'`;
`ti_categories` ao lado de `created_at`), e essa mistura é a principal fonte de inconsistência de nomes.
Um schema com um único idioma é significativamente mais previsível para geração assistida por IA.

**Exceção deliberada:** termos jurídicos/fiscais brasileiros sem tradução fiel permanecem no original —
`cnpj`, `cpf`, `inss`, `irrf`, `fgts`, `nfe`, `sac`, `pix`, `boleto`. Traduzi-los criaria ambiguidade pior
que a mistura de idiomas.

Textos de interface ficam em `src/i18n/pt-BR/` (dicionários por módulo), não hard-coded em componentes —
o que também prepara um eventual segundo idioma sem refatoração.

### 4.2 Convenções de tabela

| Convenção | Regra |
|---|---|
| **Nome** | `snake_case`, plural, prefixado pelo módulo: `it_`, `hr_`, `fin_`, `mkt_`, `crm_`, `sac_`, `qa_`, `wf_`, `ai_`. Tabelas do núcleo (organizations, users, memberships, projects, tasks, comments, activity_log, notifications) **não** têm prefixo |
| **PK** | `id uuid primary key default gen_random_uuid()` — exceto tabelas particionadas, cuja PK é composta com a coluna de partição |
| **Tenant** | `organization_id uuid not null references public.organizations(id) on delete cascade` em toda tabela de negócio |
| **Timestamps** | `created_at timestamptz not null default now()` · `updated_at timestamptz not null default now()` (por trigger) · `deleted_at timestamptz` quando houver soft delete |
| **Autoria** | `created_by uuid references public.users(id) on delete set null` · `updated_by` quando relevante para auditoria |
| **Texto** | `citext` para e-mail e slug (case-insensitive); `text` com `CHECK (char_length(...) between x and y)` no resto. **Nunca `varchar(n)`** — mudar o limite exige rewrite da tabela |
| **Dinheiro** | `numeric(14,2)`. **Nunca `float`/`real`/`double`.** Moeda em coluna própria `currency char(3) not null default 'BRL'` quando houver multimoeda |
| **Quantidade** | `numeric(14,4)` quando fracionável (kg, litro, hora); `integer` quando discreto |
| **Percentual** | `numeric(7,4)` guardando fração (0.0750 = 7,5%), nunca 7.5 — evita ambiguidade de leitura |
| **Domínio fechado** | Enum nativo do Postgres. `text + CHECK` **só** quando o conjunto muda a cada release (ex.: chave de feature flag) |
| **JSON** | `jsonb not null default '{}'::jsonb`. Nunca `json`. JSONB com forma conhecida tem `CHECK` validando as chaves obrigatórias |
| **Booleano** | Nome afirmativo com prefixo `is_`/`has_`/`can_`, `not null default`. Nunca nullable |
| **Data sem hora** | `date` (competência, vencimento, admissão). `timestamptz` para instante. **Nunca `timestamp` sem timezone** |
| **Endereço** | Bloco padrão reutilizado: `zip_code`, `street`, `number`, `complement`, `district`, `city`, `state char(2)`, `country char(2) default 'BR'`, `latitude numeric(10,7)`, `longitude numeric(10,7)` |
| **RLS** | `enable row level security` **e** `force row level security`, com 4 policies separadas (select/insert/update/delete). Nunca uma policy `for all` |
| **Índice** | Todo `organization_id` indexado; toda FK usada em policy ou em JOIN frequente indexada; índices de listagem sempre compostos começando por `organization_id` |
| **Soft delete** | Apenas onde o histórico importa (usuários, projetos, tarefas, contas de CRM, POPs). Onde não importa, `DELETE` real. Toda consulta filtra `deleted_at is null` — encapsulado em views quando o filtro for fácil de esquecer |

### 4.3 Convenções de coluna recorrentes

| Coluna | Tipo | Uso |
|---|---|---|
| `code` | `text` | Código legível pelo humano, único por organização (`ORD-2026-00042`) |
| `number` | `integer` | Sequencial por organização, gerado por função atômica (§5.9.3) |
| `title` / `name` | `text not null` | `name` para entidade cadastral, `title` para documento/evento |
| `description` / `notes` | `text` | `description` estruturada; `notes` livre |
| `status` | enum | Estado do ciclo de vida. Toda transição válida documentada na seção do módulo |
| `metadata` | `jsonb` | Extensão por cliente. **Nunca** usado para dado que o sistema consulta com filtro |
| `position` | `integer not null default 0` | Ordenação manual (drag-and-drop) |
| `search_vector` | `tsvector` | Coluna gerada para busca textual, com índice GIN |
| `embedding` | `vector(1536)` | Busca semântica (POPs, chamados, produtos) |

### 4.4 Regras de integridade transversais

Quatro regras aplicadas a **todo** o schema:

**(1) Chave composta anti-cross-tenant.** Toda tabela que é alvo de FK a partir de outra tabela do mesmo
tenant declara `unique (id, organization_id)`. As tabelas filhas referenciam o par:

```sql
-- Impede estruturalmente que uma task aponte para um project de outra organização
alter table public.tasks
  add constraint tasks_project_same_org_fkey
  foreign key (project_id, organization_id)
  references public.projects (id, organization_id) on delete cascade;
```

Sem isso, um bug de aplicação (ou um `service_role` descuidado) cria referência cruzada que o RLS **não**
detecta. Com isso, o banco recusa.

**(2) `organization_id` imutável.** Um trigger em todas as tabelas de negócio:

```sql
create or replace function public.tg_lock_organization_id()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id é imutável (tabela %, id %)', tg_table_name, old.id
      using errcode = '42501';
  end if;
  return new;
end $$;
```

**(3) `updated_at` automático.**

```sql
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
```

**(4) Aplicação em massa.** As três regras são aplicadas por um script idempotente que varre o catálogo,
garantindo que nenhuma tabela nova escape por esquecimento:

```sql
-- supabase/migrations/999999_apply_conventions.sql — reexecutável, roda ao fim de cada migration de schema
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnum > 0)
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force  row level security', t.relname);
    execute format($f$
      drop trigger if exists %1$s_lock_org on public.%1$I;
      create trigger %1$s_lock_org before update on public.%1$I
        for each row execute function public.tg_lock_organization_id();
    $f$, t.relname);
    if exists (select 1 from pg_attribute a
                where a.attrelid = format('public.%I', t.relname)::regclass
                  and a.attname = 'updated_at' and a.attnum > 0) then
      execute format($f$
        drop trigger if exists %1$s_set_updated on public.%1$I;
        create trigger %1$s_set_updated before update on public.%1$I
          for each row execute function public.tg_set_updated_at();
      $f$, t.relname);
    end if;
  end loop;
end $$;
```

### 4.5 Padrão de policies

Para reduzir repetição em ~110 tabelas, quatro **perfis de policy** cobrem quase tudo. A seção de cada
tabela indica qual perfil usa; o DDL completo aparece apenas quando foge do padrão.

| Perfil | select | insert | update | delete | Usado em |
|---|---|---|---|---|---|
| **P1 — Org aberta** | membro | membro (`member+`) | membro (`member+`) | `manager+` | Catálogos, categorias, POPs publicados |
| **P2 — Org restrita** | `manager+` ou dono do registro | `member+` | dono ou `manager+` | `admin+` | Chamados, tarefas, oportunidades |
| **P3 — Confidencial** | `admin+` ou o próprio titular | `admin+` | `admin+` | `owner` | Folha, holerite, dados médicos, faturas |
| **P4 — Portal** | o próprio cliente (via `portal` scope) ou staff | cliente ou staff | staff; cliente só em janela permitida | staff `admin+` | SAC, portal do distribuidor |

Exemplo canônico de P2, escrito por extenso uma vez:

```sql
alter table public.tickets enable row level security;
alter table public.tickets force  row level security;

create policy tickets_select on public.tickets for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_min_role(organization_id, 'manager')          -- gestão vê tudo
      or requester_id  = public.current_user_id()               -- solicitante vê o seu
      or assigned_to   = public.current_user_id()               -- técnico vê o atribuído
      or public.can_view_department(organization_id, module)    -- perfil de acesso do módulo
    )
  );

create policy tickets_insert on public.tickets for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and requester_id = public.current_user_id()
    and public.has_min_role(organization_id, 'member')
  );

create policy tickets_update on public.tickets for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (assigned_to = public.current_user_id()
         or public.has_min_role(organization_id, 'manager'))
  )
  with check (public.is_org_member(organization_id));

create policy tickets_delete on public.tickets for delete to authenticated
  using (public.has_min_role(organization_id, 'admin'));
```

> Observe o par `using` + `with check` no `update`: sem o `with check`, um usuário autorizado poderia
> **mover** a linha para outra organização em um único UPDATE. O trigger do §4.4(2) é a segunda barreira.

---

## 5. SCHEMA DO BANCO

### 5.1 Extensões

```sql
create extension if not exists "pgcrypto";        -- gen_random_uuid, digest, hmac
create extension if not exists "citext";          -- e-mail e slug case-insensitive
create extension if not exists "pg_trgm";         -- busca por similaridade / fuzzy
create extension if not exists "btree_gin";       -- índice composto envolvendo jsonb e arrays
create extension if not exists "unaccent";        -- busca ignorando acentuação (essencial em pt-BR)
create extension if not exists "pg_cron";         -- agendamento dentro do banco
create extension if not exists "pg_net";          -- HTTP a partir do banco (dispara Edge Function)
create extension if not exists "vector";          -- pgvector: embeddings / busca semântica
create extension if not exists "supabase_vault";  -- segredos (chaves BYOK de IA, tokens OAuth)
create extension if not exists "pg_stat_statements"; -- diagnóstico de consultas lentas
```

Configuração de busca textual em português, usada por todas as colunas `search_vector`:

```sql
create text search configuration public.pt_unaccent (copy = portuguese);
alter text search configuration public.pt_unaccent
  alter mapping for hword, hword_part, word with unaccent, portuguese_stem;
```

### 5.2 Enums

Todos os enums do sistema, agrupados por domínio. **Regra de evolução:** só se acrescenta valor
(`alter type ... add value`); nunca se remove nem se renomeia em produção (§1.4.6).

```sql
-- ══════════════════════ NÚCLEO / IDENTIDADE ══════════════════════

create type public.member_role as enum (
  'owner',    -- dono da conta; único que exclui a organização e gerencia billing
  'admin',    -- gerencia usuários, permissões, configurações e todos os módulos
  'manager',  -- gestão dos módulos/departamentos aos quais tem acesso
  'member',   -- operação: cria e edita registros do seu escopo
  'viewer',   -- somente leitura
  'partner',  -- externo com escopo parcial (distribuidor, representante)
  'portal'    -- consumidor final (SAC); vê apenas o que é seu
);

create type public.membership_scope as enum (
  'staff',    -- painel interno
  'partner',  -- painel do parceiro/distribuidor (subconjunto do painel)
  'portal'    -- portal SAC do consumidor
);

create type public.membership_status as enum ('invited', 'active', 'suspended');

create type public.organization_status as enum (
  'trialing', 'active', 'past_due', 'suspended', 'canceled'
);

create type public.department as enum (
  'ti', 'rh', 'financeiro', 'marketing', 'qualidade', 'comercial', 'operacoes', 'diretoria'
);

create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type public.domain_status as enum ('pending', 'verified', 'broken', 'disabled');

create type public.activity_action as enum (
  'created', 'updated', 'deleted', 'restored', 'status_changed', 'assigned', 'unassigned',
  'commented', 'member_added', 'member_removed', 'archived', 'unarchived',
  'login', 'logout', 'login_failed', 'permission_changed', 'exported', 'imported',
  'approved', 'rejected', 'sent', 'viewed'
);

create type public.notification_type as enum (
  -- trabalho
  'task_assigned', 'task_due_soon', 'task_overdue', 'task_status_changed',
  'project_invite', 'mention', 'comment_reply',
  -- atendimento
  'ticket_created', 'ticket_assigned', 'ticket_reply', 'ticket_resolved',
  'sla_warning', 'sla_breached',
  -- ativos e contratos
  'contract_expiring', 'license_expiring', 'maintenance_due',
  -- aprovações
  'approval_requested', 'approval_granted', 'approval_denied',
  -- comercial
  'opportunity_stage_changed', 'order_approved', 'target_at_risk', 'visit_scheduled',
  -- plataforma
  'membership_invite', 'workflow_failed', 'import_finished', 'billing_issue', 'system'
);

create type public.notification_channel as enum ('in_app', 'email', 'push', 'webhook');

-- ══════════════════════ WORK MANAGEMENT ══════════════════════

create type public.project_status as enum (
  'planning', 'active', 'on_hold', 'completed', 'archived', 'cancelled'
);

create type public.task_status as enum (
  'backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'
);

create type public.task_priority as enum ('urgent', 'high', 'medium', 'low');

create type public.comment_visibility as enum ('public', 'internal');

-- ══════════════════════ ATENDIMENTO / HELPDESK ══════════════════════

create type public.ticket_status as enum (
  'open', 'in_progress', 'waiting_user', 'waiting_parts', 'waiting_third_party',
  'resolved', 'closed', 'cancelled', 'rejected'
);

create type public.ticket_priority as enum ('critical', 'high', 'medium', 'low');

create type public.ticket_source as enum (
  'portal', 'email', 'phone', 'chat', 'whatsapp', 'ai_assistant', 'api', 'workflow', 'manual'
);

create type public.form_field_type as enum (
  'text', 'textarea', 'email', 'phone', 'select', 'multiselect', 'radio', 'checkbox',
  'date', 'datetime', 'number', 'currency', 'file', 'asset_select', 'assignee_select',
  'product_select', 'employee_select'
);

create type public.sla_target_kind as enum ('first_response', 'resolution');

-- ══════════════════════ INVENTÁRIO / ATIVOS ══════════════════════

create type public.asset_category as enum (
  'hardware', 'software', 'network', 'peripheral', 'mobile', 'furniture', 'vehicle', 'other'
);

create type public.asset_status as enum (
  'in_stock', 'in_use', 'maintenance', 'reserved', 'decommissioned', 'lost', 'disposed'
);

create type public.maintenance_type as enum (
  'preventive', 'corrective', 'upgrade', 'cleaning', 'inspection', 'calibration'
);

create type public.maintenance_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create type public.license_type as enum ('perpetual', 'subscription', 'volume', 'oem', 'freeware', 'trial');

create type public.contract_status as enum (
  'draft', 'active', 'expiring', 'expired', 'cancelled', 'renewed'
);

create type public.payment_frequency as enum (
  'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly', 'one_time'
);

-- ══════════════════════ CONHECIMENTO / POPs ══════════════════════

create type public.pop_status as enum ('draft', 'in_review', 'published', 'archived');

create type public.pop_visibility as enum ('public', 'internal', 'restricted');

create type public.pop_block_type as enum (
  'heading', 'paragraph', 'list', 'checklist', 'code', 'image', 'video', 'gif',
  'callout', 'table', 'divider', 'embed', 'file'
);

create type public.pop_interaction_type as enum ('view', 'search_hit', 'copy', 'print', 'linked_to_ticket');

-- ══════════════════════ RH ══════════════════════

create type public.hr_employment_status as enum (
  'hiring', 'active', 'on_leave', 'vacation', 'notice_period', 'terminated'
);

create type public.hr_contract_type as enum ('clt', 'pj', 'intern', 'temporary', 'apprentice', 'partner');

create type public.hr_request_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');

create type public.hr_absence_type as enum (
  'sick_leave', 'unjustified', 'justified', 'legal_leave', 'maternity', 'paternity',
  'bereavement', 'remote', 'training', 'other'
);

create type public.hr_benefit_type as enum (
  'transport', 'meal', 'food', 'fuel', 'health', 'dental', 'life_insurance',
  'childcare', 'education', 'gym', 'other'
);

create type public.hr_document_category as enum (
  'contract', 'identity', 'address_proof', 'certificate', 'medical', 'admission',
  'termination', 'payslip', 'training', 'other'
);

create type public.hr_payroll_status as enum ('draft', 'calculated', 'approved', 'paid', 'closed');

-- ══════════════════════ FINANCEIRO ══════════════════════

create type public.fin_entry_kind as enum ('payable', 'receivable');

create type public.fin_entry_status as enum (
  'pending', 'scheduled', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'
);

create type public.fin_payment_method as enum (
  'pix', 'boleto', 'bank_transfer', 'credit_card', 'debit_card', 'cash', 'check', 'other'
);

create type public.fin_import_status as enum (
  'pending', 'processing', 'completed', 'partially_completed', 'failed'
);

create type public.fin_purchase_status as enum (
  'draft', 'pending_approval', 'approved', 'rejected', 'quoting',
  'ordered', 'partially_received', 'received', 'cancelled'
);

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'skipped');

-- ══════════════════════ MARKETING ══════════════════════

create type public.social_platform as enum (
  'instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook',
  'whatsapp', 'meta_ads', 'google_ads', 'pinterest'
);

create type public.social_post_type as enum (
  'feed', 'story', 'reel', 'live', 'short', 'post', 'carousel',
  'article', 'paid_ad', 'broadcast_list'
);

create type public.social_post_status as enum (
  'draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed'
);

create type public.talent_category as enum ('artist', 'influencer', 'creator', 'model', 'ambassador', 'other');

create type public.partner_status as enum ('prospect', 'active', 'inactive', 'blocked');

create type public.mkt_event_type as enum (
  'show', 'fair', 'live', 'launch', 'workshop', 'meeting', 'sponsorship', 'activation', 'other'
);

create type public.mkt_event_status as enum ('planning', 'confirmed', 'in_progress', 'completed', 'cancelled');

create type public.event_participant_role as enum (
  'speaker', 'artist', 'guest', 'sponsor', 'staff', 'exhibitor', 'other'
);

create type public.event_participant_status as enum (
  'invited', 'confirmed', 'declined', 'maybe', 'attended', 'no_show'
);

create type public.supplier_category as enum (
  'printing', 'production', 'media', 'events', 'gifts', 'digital',
  'audiovisual', 'logistics', 'catering', 'scenography', 'other'
);

create type public.quotation_status as enum (
  'draft', 'sent', 'pending', 'approved', 'rejected', 'completed', 'cancelled'
);

create type public.ugc_media_type as enum ('image', 'video', 'story', 'reel', 'carousel', 'text');

create type public.ugc_status as enum ('pending', 'approved', 'rejected', 'archived');

create type public.deliverable_frequency as enum (
  'weekly', 'biweekly', 'monthly', 'per_event', 'one_time'
);

-- ══════════════════════ QUALIDADE / SAC ══════════════════════

create type public.sac_ticket_status as enum (
  'open', 'in_analysis', 'in_progress', 'waiting_customer', 'waiting_collection',
  'resolved', 'closed', 'cancelled'
);

create type public.sac_complaint_type as enum (
  'quality', 'foreign_body', 'packaging', 'expiration', 'shortage',
  'delivery', 'commercial', 'labeling', 'suggestion', 'compliment', 'other'
);

create type public.sac_severity as enum ('low', 'medium', 'high', 'critical');

create type public.sac_resolution_type as enum (
  'refund', 'replacement', 'credit', 'apology', 'guidance', 'no_action', 'technical_report'
);

create type public.qa_report_status as enum ('draft', 'in_analysis', 'concluded', 'approved', 'reopened');

create type public.qa_verdict as enum (
  'substantiated', 'partially_substantiated', 'unsubstantiated', 'inconclusive'
);

-- ══════════════════════ COMERCIAL / CRM ══════════════════════

create type public.crm_account_type as enum (
  'lead', 'prospect', 'customer', 'distributor', 'reseller', 'former_customer'
);

create type public.crm_account_status as enum ('active', 'inactive', 'blocked', 'churned');

create type public.crm_opportunity_status as enum ('open', 'won', 'lost', 'abandoned');

create type public.crm_activity_type as enum (
  'call', 'visit', 'email', 'meeting', 'whatsapp', 'note', 'demo', 'proposal_sent'
);

create type public.crm_activity_status as enum ('planned', 'done', 'cancelled', 'no_show');

create type public.crm_order_status as enum (
  'draft', 'pending_approval', 'approved', 'invoiced', 'shipped',
  'delivered', 'cancelled', 'returned'
);

create type public.crm_order_channel as enum (
  'direct', 'distributor', 'representative', 'marketplace', 'ecommerce', 'inbound'
);

create type public.crm_visit_status as enum (
  'planned', 'checked_in', 'checked_out', 'completed', 'missed', 'cancelled'
);

create type public.crm_target_scope as enum (
  'organization', 'user', 'distributor', 'territory', 'product', 'product_category'
);

create type public.crm_target_metric as enum (
  'revenue', 'volume', 'orders', 'new_accounts', 'visits', 'positivation', 'mix'
);

create type public.crm_commission_status as enum ('pending', 'calculated', 'approved', 'paid', 'cancelled');

create type public.crm_lead_status as enum (
  'new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost'
);

create type public.crm_lead_source as enum (
  'inbound_form', 'landing_page', 'referral', 'event', 'cold_call', 'ai_prospecting',
  'marketplace', 'social', 'import', 'partner', 'other'
);

create type public.crm_prospecting_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

create type public.crm_prospect_status as enum (
  'new', 'enriched', 'approved', 'rejected', 'duplicate', 'converted'
);

create type public.crm_price_list_scope as enum ('general', 'distributor', 'territory', 'account', 'channel');

-- ══════════════════════ IA ══════════════════════

create type public.ai_provider as enum ('anthropic', 'openai', 'google');

create type public.ai_role as enum ('system', 'user', 'assistant', 'tool');

create type public.ai_feature as enum (
  'assistant', 'suggest_reply', 'semantic_search', 'pattern_analysis', 'transcription',
  'insight_report', 'creative', 'lead_prospecting', 'workflow_step', 'summarize', 'classify'
);

-- ══════════════════════ WORKFLOWS ══════════════════════

create type public.wf_node_type as enum (
  'trigger',   -- entrada do workflow (exatamente 1 por workflow)
  'condition', -- ramifica por expressão booleana (true/false)
  'branch',    -- ramifica por múltiplos casos (switch)
  'action',    -- efeito colateral (criar tarefa, notificar, atualizar registro)
  'delay',     -- espera relativa ou até uma data
  'ai_step',   -- chamada de IA com prompt template
  'webhook',   -- HTTP de saída
  'approval',  -- pausa aguardando decisão humana
  'loop'       -- itera sobre uma coleção
);

create type public.wf_trigger_type as enum (
  'manual', 'schedule', 'webhook',
  'record_created', 'record_updated', 'record_deleted',
  'ticket_created', 'ticket_status_changed', 'task_status_changed',
  'form_submitted', 'sla_breached', 'order_created', 'opportunity_stage_changed'
);

create type public.wf_execution_status as enum (
  'queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'timed_out'
);

create type public.wf_step_status as enum ('pending', 'running', 'succeeded', 'failed', 'skipped');

-- ══════════════════════ BILLING ══════════════════════

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'
);

create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');

create type public.billing_interval as enum ('month', 'year');

-- ══════════════════════ INFRAESTRUTURA ══════════════════════

create type public.email_status as enum (
  'queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed'
);

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

create type public.file_scope as enum (
  'ticket', 'task', 'pop', 'hr_document', 'sac', 'product', 'crm', 'marketing', 'finance', 'avatar', 'branding'
);
```

---
### 5.3 Núcleo — organizações e identidade

Mapa de relacionamentos do núcleo:

```
auth.users (Supabase)
    │ 1:1
    ▼
  users ──────────────┐
    │ 1:N             │ N:1 (created_by em tudo)
    ▼                 │
memberships ──N:1──► organizations ──1:N──► organization_domains
    │                   │  1:1                 organization_settings
    │                   ├──1:N──► invites
    │                   ├──1:N──► access_profiles
    │                   └──1:1──► subscriptions (§5.22)
    │ N:M
    ▼
membership_access_profiles ──N:1──► access_profiles
```

#### 5.3.1 `organizations`

```sql
create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 120),
  legal_name     text check (legal_name is null or char_length(legal_name) <= 200),
  slug           citext not null unique
                   check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'
                      and slug not in ('www','app','api','admin','auth','login','signup','account',
                                       'billing','docs','status','static','assets','cdn','img','files',
                                       'mail','smtp','blog','help','suporte','support','sac','dev',
                                       'staging','test','preview','demo','helpoint','internal','root',
                                       'system','security')),
  cnpj           text unique check (cnpj is null or cnpj ~ '^\d{14}$'),
  status         public.organization_status not null default 'trialing',
  -- branding
  logo_url       text,
  icon_url       text,
  primary_color  text check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color   text check (accent_color  is null or accent_color  ~ '^#[0-9a-fA-F]{6}$'),
  -- localização e preferências
  timezone       text not null default 'America/Sao_Paulo',
  locale         text not null default 'pt-BR',
  currency       char(3) not null default 'BRL',
  -- plano (espelho desnormalizado de subscriptions, para leitura barata em RLS/proxy)
  plan_code      text not null default 'free',
  seats_limit    int  not null default 5 check (seats_limit > 0),
  enabled_modules text[] not null default array['ti']::text[],
  trial_ends_at  timestamptz,
  -- extensão
  settings       jsonb not null default '{}'::jsonb,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index organizations_status_idx on public.organizations (status) where deleted_at is null;
create index organizations_plan_idx   on public.organizations (plan_code) where deleted_at is null;
create index organizations_trial_idx  on public.organizations (trial_ends_at)
  where status = 'trialing' and deleted_at is null;
```

> **Nota sobre a FK composta:** `organizations` é a raiz, então o par anti-cross-tenant nas filhas
> referencia `organizations(id)` diretamente. As demais tabelas-pai (projects, tickets, crm_accounts…)
> declaram `unique (id, organization_id)` para servirem de alvo composto (§4.4).

**Integridade e regras:**

- `slug` é imutável após 30 dias da criação (trigger) — trocar slug quebra links salvos e integrações.
  Antes disso, a troca invalida o cache de tenant (§3.6) e registra em `activity_log`.
- `enabled_modules` é espelho do plano; a fonte de verdade é `subscriptions` + `plans.modules` (§5.22).
  Um job de reconciliação diário corrige divergências e alerta.
- `status <> 'active'` bloqueia o painel no proxy (§3.3), exceto rotas de billing e logout.
- **DELETE não tem policy**: exclusão de organização só por RPC `SECURITY DEFINER` com dupla confirmação,
  soft delete e expurgo agendado em 30 dias (LGPD, §7.10).

**RLS:** `select` para membros; `update` só `admin+`; `insert` e `delete` sem policy (só via RPC).

#### 5.3.2 `organization_domains`

```sql
create table public.organization_domains (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  hostname           citext not null unique
                       check (hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  is_primary         boolean not null default false,
  status             public.domain_status not null default 'pending',
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at        timestamptz,
  last_checked_at    timestamptz,
  last_error         text,
  failure_count      int not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index organization_domains_org_idx on public.organization_domains (organization_id);
create unique index organization_domains_one_primary_idx
  on public.organization_domains (organization_id) where is_primary;
create index organization_domains_recheck_idx
  on public.organization_domains (last_checked_at) where status in ('verified','pending');
```

**RLS:** P2 — `select` para membros, `insert`/`update`/`delete` só `admin+`.

#### 5.3.3 `users`

Tabela-espelho de `auth.users`. **É a única tabela que referencia `auth.users`** (§2.4.3, regra 2).

```sql
create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          citext not null unique,
  full_name      text not null check (char_length(btrim(full_name)) between 2 and 150),
  avatar_url     text,
  phone          text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  locale         text not null default 'pt-BR',
  timezone       text not null default 'America/Sao_Paulo',
  preferences    jsonb not null default '{}'::jsonb,   -- tema, densidade de tabela, atalhos
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index users_email_idx     on public.users (email) where deleted_at is null;
create index users_last_seen_idx on public.users (last_seen_at desc nulls last);
```

Sincronização automática no cadastro:

```sql
create or replace function public.tg_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_auth_user();
```

**RLS:** um usuário lê o próprio registro **e** o de quem compartilha organização com ele (necessário para
exibir nome/avatar de responsáveis). Atualiza somente o próprio.

```sql
create policy users_select on public.users for select to authenticated
  using (
    id = public.current_user_id()
    or exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m2.organization_id = m1.organization_id
      where m1.user_id = public.current_user_id() and m1.status = 'active'
        and m2.user_id = public.users.id and m2.status = 'active'
        and m1.scope = 'staff'          -- portal/partner não enumera o quadro de funcionários
    )
  );

create policy users_update on public.users for update to authenticated
  using (id = public.current_user_id()) with check (id = public.current_user_id());
```

> Note a condição `m1.scope = 'staff'`: sem ela, um consumidor do SAC conseguiria listar todos os
> funcionários da empresa. É exatamente o tipo de vazamento que uma policy "óbvia" deixa passar.

#### 5.3.4 `memberships`

O elo entre usuário e organização. **É a fonte de verdade do acesso** — remover a linha revoga tudo na hora.

```sql
create table public.memberships (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  role              public.member_role not null default 'member',
  scope             public.membership_scope not null default 'staff',
  department        public.department,
  job_title         text check (job_title is null or char_length(job_title) <= 120),
  status            public.membership_status not null default 'active',
  -- vínculos opcionais conforme o escopo
  crm_account_id    uuid,   -- FK adicionada em §5.19 (scope = 'partner' ⇒ distribuidor)
  invited_by        uuid references public.users(id) on delete set null,
  invited_at        timestamptz,
  accepted_at       timestamptz,
  last_used_at      timestamptz,
  suspended_at      timestamptz,
  suspended_reason  text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint memberships_unique_user_org unique (organization_id, user_id),
  constraint memberships_id_org_key      unique (id, organization_id),
  constraint memberships_scope_role_ck check (
    (scope = 'staff'   and role in ('owner','admin','manager','member','viewer'))
    or (scope = 'partner' and role = 'partner')
    or (scope = 'portal'  and role = 'portal')
  ),
  constraint memberships_partner_account_ck check (
    scope <> 'partner' or crm_account_id is not null
  )
);

create index memberships_org_idx        on public.memberships (organization_id) where deleted_at is null;
create index memberships_user_idx       on public.memberships (user_id) where deleted_at is null;
create index memberships_org_scope_idx  on public.memberships (organization_id, scope, status)
  where deleted_at is null;
create index memberships_org_dept_idx   on public.memberships (organization_id, department)
  where deleted_at is null and scope = 'staff';
create unique index memberships_single_owner_idx
  on public.memberships (organization_id) where role = 'owner' and deleted_at is null;
```

**Integridade e regras:**

- `memberships_single_owner_idx` garante **exatamente um** `owner` por organização. Transferir propriedade é
  uma RPC atômica que rebaixa o antigo para `admin` e promove o novo na mesma transação.
- Um usuário pode ter membership em **N** organizações (consultor, grupo econômico) — mas com **um** scope
  por organização.
- `last_used_at` alimenta `current_organization_id()` (§3.4) para escolher a organização padrão no login.
- Rebaixar o próprio papel é permitido; **remover a si mesmo sendo o único owner é bloqueado** por trigger.

**RLS:**

```sql
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = public.current_user_id()
    or (public.is_staff(organization_id) and public.has_min_role(organization_id, 'member'))
  );

create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_min_role(organization_id, 'admin'));

create policy memberships_update on public.memberships for update to authenticated
  using (public.has_min_role(organization_id, 'admin')
         or (user_id = public.current_user_id()))          -- o próprio pode atualizar last_used_at
  with check (
    public.has_min_role(organization_id, 'admin')
    or (user_id = public.current_user_id()
        and role = (select role from public.memberships m where m.id = public.memberships.id))
  );

create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_min_role(organization_id, 'admin')
         and role <> 'owner');
```

#### 5.3.5 `invites`

```sql
create table public.invites (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email             citext not null,
  role              public.member_role not null default 'member',
  scope             public.membership_scope not null default 'staff',
  department        public.department,
  access_profile_ids uuid[] not null default '{}',
  token_hash        text not null unique,             -- SHA-256 do token; o token cru só vai no e-mail
  status            public.invite_status not null default 'pending',
  expires_at        timestamptz not null default now() + interval '7 days',
  accepted_at       timestamptz,
  accepted_by       uuid references public.users(id) on delete set null,
  revoked_at        timestamptz,
  invited_by        uuid not null references public.users(id) on delete cascade,
  send_count        int not null default 1 check (send_count <= 5),
  last_sent_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index invites_pending_email_idx
  on public.invites (organization_id, email) where status = 'pending';
create index invites_org_idx     on public.invites (organization_id, status);
create index invites_expiry_idx  on public.invites (expires_at) where status = 'pending';
```

**Integridade e regras:**

- **O token nunca é armazenado**, apenas seu hash. O link do e-mail contém o token cru; a aceitação
  compara `digest(token,'sha256')`.
- `send_count <= 5` limita reenvio (anti-abuso de e-mail).
- Aceitação é uma RPC `SECURITY DEFINER` atômica: valida token + expiração + limite de seats do plano,
  cria `memberships`, vincula `access_profiles`, marca o convite, grava `activity_log`.
- Convite pendente para e-mail que já é membro → erro claro, não duplicação.

**RLS:** `select`/`insert`/`update` só `admin+`. A tela pública de aceite **não** lê a tabela: usa a RPC
`get_invite_public(token)` que devolve apenas nome da organização e e-mail mascarado.

### 5.4 RBAC — perfis de acesso unificados

Substitui os **três** modelos coexistentes de hoje (`ti_access_profiles`, `access_profiles`,
`qualidade_access_profiles`) e também `user_module_access` e `employee_access_grants` (§1.4.1).

#### 5.4.1 `access_profiles`

```sql
create table public.access_profiles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  department       public.department not null,
  name             text not null check (char_length(btrim(name)) between 2 and 80),
  description      text,
  permissions      jsonb not null default '{}'::jsonb,
  restrictions     jsonb not null default '{}'::jsonb,
  is_default       boolean not null default false,
  is_system        boolean not null default false,   -- semeado no onboarding; não pode ser excluído
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint access_profiles_unique_name unique (organization_id, department, name),
  constraint access_profiles_id_org_key  unique (id, organization_id),
  constraint access_profiles_permissions_shape check (jsonb_typeof(permissions) = 'object'),
  constraint access_profiles_restrictions_shape check (jsonb_typeof(restrictions) = 'object')
);

create index access_profiles_org_dept_idx on public.access_profiles (organization_id, department);
create unique index access_profiles_one_default_idx
  on public.access_profiles (organization_id, department) where is_default;
create index access_profiles_permissions_gin on public.access_profiles using gin (permissions);
```

**Formato de `permissions`** — contrato fixo, validado por Zod na aplicação e por CHECK no banco:

```jsonc
{
  "tickets":   { "view": "department", "create": true, "edit": "assigned", "delete": false, "approve": false },
  "assets":    { "view": "all",        "create": true, "edit": true,       "delete": false, "approve": false },
  "pops":      { "view": "all",        "create": true, "edit": "own",      "delete": false, "approve": true  },
  "reports":   { "view": "all",        "export": true },
  "settings":  { "view": false,        "edit": false }
}
```

- `view` aceita `false | "own" | "assigned" | "team" | "department" | "all"` — escopo de linha, não booleano.
  É isso que permite "o técnico vê os chamados que atende; o coordenador vê os do departamento".
- `edit`/`delete` aceitam `boolean` ou o mesmo escopo.
- Recursos não citados são **negados por omissão** (default deny).

**Formato de `restrictions`** — filtros de linha adicionais, avaliados junto com o escopo:

```jsonc
{
  "territories":  ["uuid-sudeste"],          // vendedor só vê contas do seu território
  "cost_centers": ["uuid-cc-ti"],            // financeiro só vê lançamentos do seu centro de custo
  "max_amount":   50000.00,                  // aprovador com alçada limitada
  "categories":   ["uuid-cat-hardware"]
}
```

#### 5.4.2 `membership_access_profiles`

```sql
create table public.membership_access_profiles (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  membership_id     uuid not null,
  access_profile_id uuid not null,
  overrides         jsonb not null default '{}'::jsonb,   -- exceções pontuais, mesmo formato
  granted_by        uuid references public.users(id) on delete set null,
  expires_at        timestamptz,                          -- acesso temporário (cobertura de férias)
  created_at        timestamptz not null default now(),

  constraint map_unique unique (membership_id, access_profile_id),
  constraint map_membership_fk foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete cascade,
  constraint map_profile_fk foreign key (access_profile_id, organization_id)
    references public.access_profiles (id, organization_id) on delete cascade
);

create index map_membership_idx on public.membership_access_profiles (membership_id);
create index map_org_idx        on public.membership_access_profiles (organization_id);
create index map_expiry_idx     on public.membership_access_profiles (expires_at)
  where expires_at is not null;
```

> As duas FKs **compostas** com `organization_id` são o exemplo mais claro do §4.4(1): sem elas, seria
> possível conceder à membership da organização A um perfil da organização B.

#### 5.4.3 Resolução efetiva de permissão

```sql
-- View materializada em memória por request na aplicação; no banco, função para uso em RLS.
create or replace function public.effective_permissions(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_deep_merge_agg(ap.permissions || coalesce(map.overrides, '{}'::jsonb)),
    '{}'::jsonb)
  from public.memberships m
  join public.membership_access_profiles map
    on map.membership_id = m.id
   and (map.expires_at is null or map.expires_at > now())
  join public.access_profiles ap on ap.id = map.access_profile_id
 where m.organization_id = p_org
   and m.user_id = public.current_user_id()
   and m.status = 'active' and m.deleted_at is null;
$$;

-- Atalho usado nas policies de módulo
create or replace function public.can_view_department(p_org uuid, p_dept public.department)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_min_role(p_org, 'admin')
      or exists (
        select 1 from public.memberships m
        join public.membership_access_profiles map on map.membership_id = m.id
        join public.access_profiles ap on ap.id = map.access_profile_id
        where m.organization_id = p_org and m.user_id = public.current_user_id()
          and m.status = 'active' and ap.department = p_dept
          and coalesce(ap.permissions #>> '{tickets,view}', 'false') <> 'false'
      );
$$;
```

**Precedência (do mais forte para o mais fraco):**

1. `role = 'owner'` → tudo permitido, sem consulta a perfil.
2. `role = 'admin'` → tudo permitido dentro da organização, exceto billing/exclusão (só `owner`).
3. União dos perfis de acesso, com `overrides` da membership sobrepondo o perfil.
4. `restrictions` aplicadas como filtro **adicional** (nunca ampliam, só restringem).
5. Omissão → negado.

**Perfis semeados no onboarding** (`is_system = true`), por departamento: `Gestor` (tudo do departamento,
inclusive aprovar), `Operador` (criar/editar o próprio e o atribuído), `Somente leitura`.

### 5.5 Configurações e branding

```sql
create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- atendimento
  business_hours   jsonb not null default
    '{"mon":["08:00","18:00"],"tue":["08:00","18:00"],"wed":["08:00","18:00"],
      "thu":["08:00","18:00"],"fri":["08:00","18:00"],"sat":null,"sun":null}'::jsonb,
  holidays         date[] not null default '{}',
  sla_pause_outside_hours boolean not null default true,
  -- identidade do assistente de IA
  assistant_name   text not null default 'Lyra' check (char_length(assistant_name) between 2 and 30),
  assistant_tone   text not null default 'professional',
  -- portal SAC
  sac_enabled      boolean not null default false,
  sac_welcome_text text,
  sac_require_invoice boolean not null default false,
  sac_auto_close_days int not null default 7 check (sac_auto_close_days between 1 and 90),
  -- e-mail
  email_from_name  text,
  email_reply_to   citext,
  -- segurança
  password_min_length int not null default 10 check (password_min_length between 8 and 64),
  session_max_hours   int not null default 12 check (session_max_hours between 1 and 720),
  require_mfa_for_admins boolean not null default false,
  allowed_email_domains text[] not null default '{}',   -- vazio = qualquer domínio
  ip_allowlist     inet[] not null default '{}',
  updated_by       uuid references public.users(id) on delete set null,
  updated_at       timestamptz not null default now()
);
```

**RLS:** `select` para membros staff; `update` só `admin+`.

### 5.6 Auditoria — `activity_log`

Substitui o `audit_logs` genérico de hoje. **Particionada por mês desde o dia 1** (§3.7).

```sql
create table public.activity_log (
  id              uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,
  actor_label     text,                       -- nome no momento do evento (sobrevive à exclusão do usuário)
  actor_type      text not null default 'user' check (actor_type in ('user','system','workflow','ai','api')),
  action          public.activity_action not null,
  entity_type     text not null,              -- 'ticket' | 'task' | 'crm_order' | ...
  entity_id       uuid,
  entity_label    text,                       -- título legível no momento do evento
  summary         text,                       -- frase pronta para a timeline da UI
  changes         jsonb not null default '{}'::jsonb,  -- { campo: { from, to } } — só o que mudou
  context         jsonb not null default '{}'::jsonb,  -- ip, user_agent, request_id, origem
  occurred_at     timestamptz not null default now(),

  primary key (occurred_at, id)
) partition by range (occurred_at);

create index activity_log_org_time_idx    on public.activity_log (organization_id, occurred_at desc);
create index activity_log_entity_idx      on public.activity_log (organization_id, entity_type, entity_id, occurred_at desc);
create index activity_log_actor_idx       on public.activity_log (organization_id, actor_id, occurred_at desc);
create index activity_log_action_idx      on public.activity_log (organization_id, action, occurred_at desc);
```

Criação automática de partições (roda mensalmente via `pg_cron`, cria os 3 meses seguintes):

```sql
create or replace function public.ensure_monthly_partitions(
  p_table text, p_months_ahead int default 3)
returns void language plpgsql as $$
declare d date := date_trunc('month', now())::date; i int;
begin
  for i in 0..p_months_ahead loop
    execute format(
      'create table if not exists %I partition of public.%I for values from (%L) to (%L)',
      p_table || '_' || to_char(d + (i || ' month')::interval, 'YYYY_MM'),
      p_table,
      (d + (i || ' month')::interval)::date,
      (d + ((i+1) || ' month')::interval)::date);
  end loop;
end $$;

select cron.schedule('partitions-monthly', '0 3 1 * *', $$
  select public.ensure_monthly_partitions('activity_log');
  select public.ensure_monthly_partitions('workflow_executions');
  select public.ensure_monthly_partitions('notifications');
  select public.ensure_monthly_partitions('ai_messages');
$$);
```

**Como é gravado:** não por trigger genérico em cada tabela (o modelo atual, que gera ruído e não sabe o
"porquê" da mudança), mas por um **wrapper explícito na camada de dados**:

```ts
// src/lib/audit/log.ts — chamado por TODA Server Action de mutação
export async function logActivity(ctx: OrgContext, input: {
  action: ActivityAction; entityType: string; entityId: string; entityLabel?: string;
  summary?: string; changes?: Record<string, { from: unknown; to: unknown }>;
}): Promise<void>;
```

Exceção: operações críticas que precisam de garantia mesmo em caso de bug de aplicação (alteração de
`memberships`, `access_profiles`, `organization_settings`, `subscriptions`, e tudo em RH e Financeiro) **também**
têm trigger de banco, redundante de propósito.

**Retenção:** 24 meses no plano padrão, 60 meses no enterprise. Partições mais antigas são exportadas para
storage (Parquet/CSV) e removidas. `activity_log` é **append-only**: sem policy de `update` nem de `delete`.

**RLS:** `select` para `manager+`; `insert` apenas por função `SECURITY DEFINER` (a aplicação nunca insere
direto); `update`/`delete` sem policy.

### 5.7 Notificações

```sql
create table public.notifications (
  id              uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  type            public.notification_type not null,
  title           text not null check (char_length(title) <= 200),
  body            text,
  link            text,                         -- caminho relativo dentro do painel
  entity_type     text,
  entity_id       uuid,
  priority        smallint not null default 3 check (priority between 1 and 5),
  group_key       text,                         -- agrupa "5 novos comentários" em uma linha
  read_at         timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),

  primary key (created_at, id)
) partition by range (created_at);

create index notifications_inbox_idx
  on public.notifications (organization_id, user_id, created_at desc) where read_at is null;
create index notifications_user_all_idx
  on public.notifications (organization_id, user_id, created_at desc);
create index notifications_group_idx
  on public.notifications (organization_id, user_id, group_key) where group_key is not null;
```

```sql
create table public.notification_preferences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  type            public.notification_type not null,
  channels        public.notification_channel[] not null default array['in_app']::public.notification_channel[],
  is_enabled      boolean not null default true,
  digest_minutes  int not null default 0 check (digest_minutes in (0, 15, 60, 240, 1440)),
  quiet_hours     jsonb not null default '{}'::jsonb,   -- {"from":"20:00","to":"07:00"}
  updated_at      timestamptz not null default now(),

  constraint notif_pref_unique unique (organization_id, user_id, type)
);
```

**Regras:**

- Entrega é **fan-out por canal** na criação: grava `notifications` (in-app) e enfileira e-mail/push
  conforme `notification_preferences`, respeitando `quiet_hours` e `digest_minutes`.
- `group_key` evita avalanche: 12 comentários na mesma tarefa em 5 minutos viram uma notificação agregada.
- Realtime: canal privado `org:{id}:user:{id}` via Broadcast from Database.
- Retenção: 6 meses; lidas com mais de 90 dias são removidas.

**RLS:** o usuário só enxerga e altera as próprias (`user_id = current_user_id()`). Inserção via
`SECURITY DEFINER`.

### 5.8 Arquivos e anexos — tabela única

O sistema atual espalha `*_attachments` por módulo (tickets, POPs, SAC, cards…). Aqui há **uma** tabela,
com referência polimórfica controlada:

```sql
create table public.files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope           public.file_scope not null,
  entity_type     text not null,
  entity_id       uuid not null,
  bucket          text not null,
  storage_path    text not null,     -- org/{org_id}/{scope}/{entity_id}/{uuid}-{slug}.ext
  file_name       text not null check (char_length(file_name) <= 255),
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 104857600),  -- 100 MB
  checksum_sha256 text,
  width           int,
  height          int,
  duration_ms     int,
  is_public       boolean not null default false,
  uploaded_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint files_storage_unique unique (bucket, storage_path),
  constraint files_mime_ck check (
    mime_type ~ '^(image/(png|jpe?g|gif|webp|svg\+xml)|video/(mp4|webm|quicktime)|audio/(mpeg|ogg|wav|webm)'
             || '|application/(pdf|zip|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|msword)'
             || '|text/(plain|csv))$'
  )
);

create index files_entity_idx on public.files (organization_id, entity_type, entity_id)
  where deleted_at is null;
create index files_scope_idx  on public.files (organization_id, scope, created_at desc)
  where deleted_at is null;
create index files_orphan_idx on public.files (created_at) where entity_id is null;
```

**Regras:**

- Validação de extensão/MIME acontece **três vezes**: no client (UX), na Server Action (Zod + magic bytes)
  e na policy de storage (§7.7). O `CHECK` acima é a quarta.
- Upload em duas fases: cria `files` com `entity_id` provisório → gera signed upload URL → confirma.
  Órfãos com mais de 24 h são expurgados por job.
- Exclusão é **soft** na tabela e assíncrona no storage (job diário), para permitir desfazer.

**RLS:** herda o acesso da entidade dona — a policy consulta a tabela referenciada por `entity_type`.
Na prática, isso é implementado com uma policy por `scope` para manter o plano simples:

```sql
create policy files_select_ticket on public.files for select to authenticated
  using (scope = 'ticket' and exists (
    select 1 from public.tickets t
     where t.id = files.entity_id and t.organization_id = files.organization_id
  ));   -- o RLS de tickets já filtra o que o usuário pode ver
```

### 5.9 Infraestrutura — fila, e-mail e sequências

#### 5.9.1 `job_queue` — fila auditável

Substitui o `pgmq` do sistema atual por uma tabela normal: visível na UI de suporte, testável, com RLS.

```sql
create table public.job_queue (
  id              bigserial primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  queue           text not null,                 -- 'email' | 'workflow' | 'ai' | 'import' | 'export'
  job_type        text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          public.job_status not null default 'queued',
  priority        smallint not null default 5 check (priority between 1 and 9),
  run_at          timestamptz not null default now(),
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  dedupe_key      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index job_queue_pick_idx on public.job_queue (queue, status, priority, run_at)
  where status = 'queued';
create index job_queue_org_idx  on public.job_queue (organization_id, created_at desc);
create unique index job_queue_dedupe_idx on public.job_queue (queue, dedupe_key)
  where dedupe_key is not null and status in ('queued','running');
```

Consumo com `SKIP LOCKED` — seguro para múltiplos workers concorrentes:

```sql
create or replace function public.dequeue_jobs(p_queue text, p_limit int default 10, p_worker text default null)
returns setof public.job_queue language sql volatile as $$
  with picked as (
    select id from public.job_queue
     where queue = p_queue and status = 'queued' and run_at <= now()
     order by priority, run_at
     limit p_limit
     for update skip locked
  )
  update public.job_queue j
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
    from picked where j.id = picked.id
  returning j.*;
$$;
```

Falha → `run_at = now() + backoff exponencial com jitter`; ao esgotar `max_attempts`, vira `dead` e dispara
alerta no Sentry. Jobs `dead` aparecem em uma tela de suporte com botão de reprocessar.

#### 5.9.2 E-mail transacional

```sql
create table public.email_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  to_email        citext not null,
  from_email      citext not null,
  reply_to        citext,
  subject         text not null,
  template        text not null,
  template_data   jsonb not null default '{}'::jsonb,
  status          public.email_status not null default 'queued',
  provider_id     text,                      -- id da mensagem no Resend
  error           text,
  entity_type     text,
  entity_id       uuid,
  queued_at       timestamptz not null default now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  bounced_at      timestamptz
);

create index email_log_org_idx      on public.email_log (organization_id, queued_at desc);
create index email_log_to_idx       on public.email_log (to_email, queued_at desc);
create index email_log_provider_idx on public.email_log (provider_id) where provider_id is not null;

create table public.email_suppressions (
  id              uuid primary key default gen_random_uuid(),
  email           citext not null unique,
  reason          text not null check (reason in ('bounce','complaint','unsubscribe','manual','invalid')),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table public.email_unsubscribe_tokens (
  token           text primary key default encode(gen_random_bytes(24), 'hex'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete cascade,
  email           citext not null,
  scope           text not null default 'all',
  created_at      timestamptz not null default now(),
  used_at         timestamptz
);
```

**Regras:** todo envio consulta `email_suppressions` antes; webhook do Resend atualiza status e alimenta a
supressão automaticamente; e-mails de notificação carregam link de unsubscribe (transacionais críticos —
convite, recuperação de senha, OTP — não).

#### 5.9.3 Sequências por organização

Números legíveis (`#1042`, `ORD-2026-00042`) precisam ser **sequenciais por organização**, não globais.
Sequência do Postgres não serve (é global); `max()+1` gera race condition sob concorrência.

```sql
create table public.sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,      -- 'ticket' | 'sac_ticket' | 'order' | 'purchase_request' | ...
  period          text not null default '',  -- '' (contínuo) ou '2026' / '2026-08' (reinicia)
  current_value   bigint not null default 0,
  primary key (organization_id, key, period)
);

create or replace function public.next_sequence(p_org uuid, p_key text, p_period text default '')
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.sequences (organization_id, key, period, current_value)
  values (p_org, p_key, p_period, 1)
  on conflict (organization_id, key, period)
  do update set current_value = public.sequences.current_value + 1
  returning current_value into v;
  return v;
end $$;
```

`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` é atômico: a linha é travada pela própria operação, sem
`SELECT FOR UPDATE` explícito e sem risco de pular números.

---
### 5.10 Work Management — projetos, tarefas e comentários

Capacidade **nova**. É a espinha dorsal de trabalho em equipe que faltava: o Kanban do sistema atual tinha
11 tabelas no banco e nenhuma UI, e acabou removido (§1.3). Aqui ele volta como módulo de primeira classe,
e — mais importante — **tarefas e comentários passam a ser genéricos**: qualquer entidade de qualquer módulo
(um chamado, uma requisição de compra, uma oportunidade, um laudo) pode gerar tarefa e receber comentário
pelo mesmo mecanismo, com a mesma UI e a mesma auditoria.

#### 5.10.1 `projects`

```sql
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),  -- prefixo das tarefas: "INFRA-42"
  name            text not null check (char_length(btrim(name)) between 2 and 140),
  description     text,
  status          public.project_status not null default 'planning',
  department      public.department,
  color           text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon            text,
  owner_id        uuid references public.users(id) on delete set null,
  start_date      date,
  due_date        date,
  completed_at    timestamptz,
  is_private      boolean not null default false,   -- só membros explícitos veem
  position        int not null default 0,
  settings        jsonb not null default '{}'::jsonb,  -- colunas do board, campos custom, automações
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint projects_key_unique   unique (organization_id, key),
  constraint projects_id_org_key   unique (id, organization_id),
  constraint projects_dates_ck     check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_org_status_idx on public.projects (organization_id, status, position)
  where deleted_at is null;
create index projects_owner_idx      on public.projects (organization_id, owner_id) where deleted_at is null;
create index projects_dept_idx       on public.projects (organization_id, department) where deleted_at is null;
```

```sql
create table public.project_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid not null,
  membership_id   uuid not null,
  project_role    text not null default 'member' check (project_role in ('lead','member','viewer')),
  created_at      timestamptz not null default now(),

  constraint project_members_unique unique (project_id, membership_id),
  constraint project_members_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint project_members_membership_fk foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete cascade
);

create index project_members_project_idx    on public.project_members (project_id);
create index project_members_membership_idx on public.project_members (membership_id);
```

```sql
-- Colunas do board (Kanban). Um projeto sem colunas usa o default do status da tarefa.
create table public.project_columns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid not null,
  name            text not null check (char_length(name) between 1 and 60),
  maps_to_status  public.task_status not null,
  color           text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  wip_limit       int check (wip_limit is null or wip_limit > 0),
  is_done_column  boolean not null default false,
  position        int not null default 0,
  created_at      timestamptz not null default now(),

  constraint project_columns_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint project_columns_id_org_key unique (id, organization_id)
);

create index project_columns_project_idx on public.project_columns (project_id, position);
create unique index project_columns_one_done_idx
  on public.project_columns (project_id) where is_done_column;
```

**RLS:** P2 com escopo de projeto — membro vê projetos não privados da organização; projeto privado exige
linha em `project_members`. `insert` `member+`; `update` lead do projeto ou `manager+`; `delete` `admin+`.

#### 5.10.2 `tasks`

```sql
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  project_id       uuid,                       -- null = tarefa pessoal / avulsa
  column_id        uuid,
  parent_task_id   uuid,                       -- subtarefa (1 nível; ver constraint)
  number           int not null,               -- sequencial por organização → "INFRA-42"
  title            text not null check (char_length(btrim(title)) between 1 and 300),
  description      text,
  status           public.task_status not null default 'todo',
  priority         public.task_priority not null default 'medium',
  assignee_id      uuid references public.users(id) on delete set null,
  reporter_id      uuid references public.users(id) on delete set null,
  due_date         timestamptz,
  start_date       timestamptz,
  completed_at     timestamptz,
  estimate_minutes int check (estimate_minutes is null or estimate_minutes between 0 and 100000),
  spent_minutes    int not null default 0 check (spent_minutes >= 0),
  labels           text[] not null default '{}',
  position         numeric(20,10) not null default 0,  -- ordenação fracionária (drag sem reindexar)
  -- origem: a tarefa pode nascer de qualquer entidade de qualquer módulo
  source_type      text,
  source_id        uuid,
  -- IA
  is_ai_suggested  boolean not null default false,
  ai_rationale     text,
  -- busca
  search_vector    tsvector generated always as (
                     to_tsvector('public.pt_unaccent', coalesce(title,'') || ' ' || coalesce(description,''))
                   ) stored,
  custom_fields    jsonb not null default '{}'::jsonb,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint tasks_number_unique unique (organization_id, number),
  constraint tasks_id_org_key    unique (id, organization_id),
  constraint tasks_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint tasks_column_fk foreign key (column_id, organization_id)
    references public.project_columns (id, organization_id) on delete set null,
  constraint tasks_parent_fk foreign key (parent_task_id, organization_id)
    references public.tasks (id, organization_id) on delete cascade,
  constraint tasks_no_self_parent check (parent_task_id is null or parent_task_id <> id),
  constraint tasks_source_ck check (
    (source_type is null and source_id is null) or (source_type is not null and source_id is not null)
  ),
  constraint tasks_done_ck check (
    (status = 'done') = (completed_at is not null)
  )
);

create index tasks_org_status_idx    on public.tasks (organization_id, status, position)
  where deleted_at is null;
create index tasks_project_idx       on public.tasks (organization_id, project_id, status, position)
  where deleted_at is null;
create index tasks_assignee_idx      on public.tasks (organization_id, assignee_id, status)
  where deleted_at is null;
create index tasks_due_idx           on public.tasks (organization_id, due_date)
  where deleted_at is null and status not in ('done','cancelled');
create index tasks_source_idx        on public.tasks (organization_id, source_type, source_id)
  where source_id is not null;
create index tasks_parent_idx        on public.tasks (parent_task_id) where parent_task_id is not null;
create index tasks_labels_gin        on public.tasks using gin (labels);
create index tasks_search_gin        on public.tasks using gin (search_vector);
```

**Integridade e regras:**

- **Subtarefa em um único nível.** Um trigger recusa `parent_task_id` que aponte para tarefa que já tem pai —
  hierarquia arbitrária gera consulta recursiva e UI confusa sem ganho real.
- **`position` fracionária** (`numeric(20,10)`): arrastar um card calcula a média entre os vizinhos, sem
  reindexar a coluna inteira. Um job semanal normaliza quando a diferença fica abaixo de `1e-6`.
- **`number`** vem de `next_sequence(org, 'task')` (§5.9.3), gerado por trigger `before insert`.
- **`tasks_done_ck`** impede o estado inconsistente "concluída sem data de conclusão".
- `source_type`/`source_id` **não** têm FK (é polimórfico); a integridade é garantida na aplicação e um job
  diário marca órfãos. Foi uma escolha consciente: FK polimórfica exigiria uma tabela de junção por tipo.

**Transições de status válidas** (validadas na Server Action, não no banco — são regra de negócio, §2.5):

```
backlog → todo → in_progress → in_review → done
   ↑        ↓         ↓            ↓
   └──── blocked ─────┘            ↓
          qualquer → cancelled     ↓
                     done → in_progress (reabertura, exige justificativa)
```

**RLS:** P2 — vê quem é membro do projeto (ou da organização, se o projeto não for privado), o `assignee`,
o `reporter` e `manager+`.

#### 5.10.3 `comments` — comentários genéricos

Uma **única** tabela de comentário para todo o sistema (tarefa, chamado, oportunidade, laudo, pedido…).
O sistema atual tem `ticket_comments`, `kanban_card_comments`, `sac_ticket_comments` — três implementações
da mesma coisa, com três UIs e três conjuntos de bugs.

```sql
create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  entity_type       text not null check (entity_type in (
                      'task','project','ticket','sac_ticket','crm_account','crm_opportunity',
                      'crm_order','crm_visit','pop','asset','fin_entry','fin_purchase_request',
                      'hr_request','qa_report','mkt_event','mkt_social_post')),
  entity_id         uuid not null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  author_id         uuid references public.users(id) on delete set null,
  author_label      text,                   -- preserva o nome se o usuário for excluído
  author_kind       text not null default 'user'
                      check (author_kind in ('user','customer','system','ai','workflow')),
  body              text not null check (char_length(body) between 1 and 20000),
  body_format       text not null default 'markdown' check (body_format in ('markdown','plain','html')),
  visibility        public.comment_visibility not null default 'public',
  mentions          uuid[] not null default '{}',
  reactions         jsonb not null default '{}'::jsonb,   -- {"👍": ["uuid1","uuid2"]}
  is_pinned         boolean not null default false,
  edited_at         timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint comments_id_org_key unique (id, organization_id)
);

create index comments_entity_idx  on public.comments (organization_id, entity_type, entity_id, created_at)
  where deleted_at is null;
create index comments_author_idx  on public.comments (organization_id, author_id, created_at desc);
create index comments_thread_idx  on public.comments (parent_comment_id) where parent_comment_id is not null;
create index comments_mentions_gin on public.comments using gin (mentions);
create index comments_pinned_idx  on public.comments (organization_id, entity_type, entity_id)
  where is_pinned and deleted_at is null;
```

**Integridade e regras:**

- `visibility = 'internal'` é o comentário técnico que o solicitante/consumidor **não** vê. A policy do SAC
  e do portal filtra por isso — é a diferença entre "nota interna" e "resposta ao cliente".
- `author_kind = 'customer'` identifica comentário vindo do portal SAC; `'ai'`, do assistente.
- `mentions` dispara notificação; edição só pelo autor, em até 15 minutos, registrando `edited_at`.
- Comentário nunca é apagado de verdade quando tem respostas — soft delete com corpo substituído.
- Thread de **um nível** de resposta (mesma justificativa das subtarefas).

**RLS:** herda o acesso da entidade dona. Como `entity_type` é polimórfico, a policy é escrita com um
`case` sobre os tipos, delegando ao RLS da tabela referenciada:

```sql
create policy comments_select on public.comments for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (visibility = 'public' or public.is_staff(organization_id))
    and case entity_type
      when 'task'       then exists (select 1 from public.tasks t       where t.id = entity_id)
      when 'ticket'     then exists (select 1 from public.tickets t     where t.id = entity_id)
      when 'sac_ticket' then exists (select 1 from public.sac_tickets s where s.id = entity_id)
      -- ... demais tipos
      else false
    end
  );
```

> As subconsultas **não** precisam repetir o filtro de organização: o RLS da tabela referenciada já o aplica.
> Se o usuário não pode ver o chamado, o `exists` retorna falso e o comentário desaparece junto.

#### 5.10.4 `task_dependencies` e `time_entries`

```sql
create table public.task_dependencies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  task_id          uuid not null,
  depends_on_id    uuid not null,
  kind             text not null default 'blocks' check (kind in ('blocks','relates_to','duplicates')),
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint task_dep_unique unique (task_id, depends_on_id, kind),
  constraint task_dep_no_self check (task_id <> depends_on_id),
  constraint task_dep_task_fk foreign key (task_id, organization_id)
    references public.tasks (id, organization_id) on delete cascade,
  constraint task_dep_target_fk foreign key (depends_on_id, organization_id)
    references public.tasks (id, organization_id) on delete cascade
);

create index task_dep_task_idx   on public.task_dependencies (task_id);
create index task_dep_target_idx on public.task_dependencies (depends_on_id);
```

> Ciclos são detectados na aplicação (busca em profundidade antes de inserir), não no banco. Um `CHECK`
> não consegue expressar aciclicidade, e um trigger recursivo ficaria caro em grafos grandes.

```sql
create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null check (entity_type in ('task','ticket','crm_visit')),
  entity_id       uuid not null,
  user_id         uuid not null references public.users(id) on delete cascade,
  minutes         int not null check (minutes > 0 and minutes <= 1440),
  description     text,
  worked_on       date not null default current_date,
  is_billable     boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint time_entries_id_org_key unique (id, organization_id)
);

create index time_entries_entity_idx on public.time_entries (organization_id, entity_type, entity_id);
create index time_entries_user_idx   on public.time_entries (organization_id, user_id, worked_on desc);
```

Um trigger mantém `tasks.spent_minutes` sincronizado com a soma das entradas — desnormalização deliberada,
porque a listagem de tarefas mostra o tempo gasto e um `SUM` por linha seria caro.

---
### 5.11 Atendimento — chamados internos (helpdesk multi-departamento)

É o módulo mais maduro do sistema atual e o motor reusado por **todos** os departamentos: um chamado de TI,
uma solicitação de RH, uma requisição para o Financeiro e um caso de Qualidade são a mesma entidade,
discriminada por `department`. Isso já é verdade hoje (coluna `module` em `tickets`) e é mantido.

#### 5.11.1 `ticket_categories`

```sql
create table public.ticket_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department      public.department not null,
  parent_id       uuid,
  name            text not null check (char_length(btrim(name)) between 2 and 100),
  description     text,
  icon            text,
  color           text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  default_priority public.ticket_priority not null default 'medium',
  default_assignee_id uuid references public.users(id) on delete set null,
  sla_policy_id   uuid,
  requires_approval boolean not null default false,
  is_active       boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ticket_categories_unique unique (organization_id, department, parent_id, name),
  constraint ticket_categories_id_org_key unique (id, organization_id),
  constraint ticket_categories_parent_fk foreign key (parent_id, organization_id)
    references public.ticket_categories (id, organization_id) on delete cascade
);

create index ticket_categories_org_dept_idx
  on public.ticket_categories (organization_id, department, position) where is_active;
```

> Hierarquia de **dois níveis** (categoria → subcategoria), imposta por trigger. O modelo atual usa um array
> `subcategories` dentro da categoria, o que impede SLA e responsável por subcategoria.

#### 5.11.2 `sla_policies`

```sql
create table public.sla_policies (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  department            public.department not null,
  name                  text not null check (char_length(name) between 2 and 80),
  priority              public.ticket_priority not null,
  first_response_minutes int not null check (first_response_minutes between 1 and 100000),
  resolution_minutes     int not null check (resolution_minutes between 1 and 1000000),
  business_hours_only    boolean not null default true,
  warning_threshold_pct  numeric(5,2) not null default 80.00 check (warning_threshold_pct between 1 and 99),
  escalate_to_id         uuid references public.users(id) on delete set null,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint sla_policies_unique unique (organization_id, department, priority),
  constraint sla_policies_id_org_key unique (id, organization_id),
  constraint sla_policies_order_ck check (resolution_minutes >= first_response_minutes)
);

create index sla_policies_org_idx on public.sla_policies (organization_id, department) where is_active;
```

Cálculo do vencimento respeitando horário comercial e feriados (`organization_settings.business_hours`) é
**regra de negócio em TypeScript** (`modules/helpdesk/domain/sla.ts`), testada com Vitest. O banco apenas
armazena o `sla_due_at` resultante. Isso é uma correção deliberada ao modelo atual, que faz o cálculo em
PL/pgSQL (§1.4.5).

#### 5.11.3 `tickets`

```sql
create table public.tickets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  number              int not null,
  department          public.department not null default 'ti',
  title               text not null check (char_length(btrim(title)) between 3 and 300),
  description         text not null check (char_length(description) between 1 and 20000),
  status              public.ticket_status not null default 'open',
  priority            public.ticket_priority not null default 'medium',
  source              public.ticket_source not null default 'portal',
  category_id         uuid,
  -- pessoas
  requester_id        uuid not null references public.users(id) on delete restrict,
  assigned_to         uuid references public.users(id) on delete set null,
  assigned_team       public.department,
  created_by          uuid references public.users(id) on delete set null,
  -- vínculos
  asset_id            uuid,
  project_id          uuid,
  parent_ticket_id    uuid,
  sac_ticket_id       uuid,              -- chamado interno originado de uma reclamação do SAC
  -- SLA
  sla_policy_id       uuid,
  sla_due_at          timestamptz,
  first_response_due_at timestamptz,
  first_response_at   timestamptz,
  sla_paused_at       timestamptz,
  sla_paused_minutes  int not null default 0,
  is_sla_breached     boolean not null default false,
  -- ciclo de vida
  due_date            timestamptz,
  resolved_at         timestamptz,
  closed_at           timestamptz,
  reopened_count      int not null default 0,
  resolution_notes    text,
  resolution_category text,
  -- satisfação
  satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  satisfaction_comment text,
  rated_at            timestamptz,
  -- IA e busca
  ai_summary          text,
  ai_suggested_pop_id uuid,
  embedding           vector(1536),
  search_vector       tsvector generated always as (
                        to_tsvector('public.pt_unaccent',
                          coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
                          coalesce(resolution_notes,''))
                      ) stored,
  custom_fields       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tickets_number_unique unique (organization_id, number),
  constraint tickets_id_org_key    unique (id, organization_id),
  constraint tickets_category_fk foreign key (category_id, organization_id)
    references public.ticket_categories (id, organization_id) on delete set null,
  constraint tickets_sla_fk foreign key (sla_policy_id, organization_id)
    references public.sla_policies (id, organization_id) on delete set null,
  constraint tickets_parent_fk foreign key (parent_ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null,
  constraint tickets_resolved_ck check (
    (status in ('resolved','closed')) = (resolved_at is not null)
  ),
  constraint tickets_closed_ck check (status <> 'closed' or closed_at is not null),
  constraint tickets_rating_ck check ((satisfaction_rating is null) = (rated_at is null))
);

-- Índices: sempre liderados por organization_id (§3.7)
create index tickets_org_status_idx    on public.tickets (organization_id, status, created_at desc);
create index tickets_org_dept_idx      on public.tickets (organization_id, department, status, created_at desc);
create index tickets_assignee_idx      on public.tickets (organization_id, assigned_to, status)
  where assigned_to is not null;
create index tickets_requester_idx     on public.tickets (organization_id, requester_id, created_at desc);
create index tickets_sla_watch_idx     on public.tickets (organization_id, sla_due_at)
  where status not in ('resolved','closed','cancelled','rejected');
create index tickets_open_priority_idx on public.tickets (organization_id, priority, created_at)
  where status in ('open','in_progress');
create index tickets_asset_idx         on public.tickets (organization_id, asset_id) where asset_id is not null;
create index tickets_search_gin        on public.tickets using gin (search_vector);
create index tickets_embedding_idx     on public.tickets using hnsw (embedding vector_cosine_ops);
```

**Integridade e regras:**

- `number` por `next_sequence(org, 'ticket')` — sequencial por organização, não global.
- SLA: `sla_due_at` e `first_response_due_at` calculados no INSERT pela aplicação, recalculados quando a
  prioridade muda. `sla_paused_minutes` acumula o tempo em `waiting_user`/`waiting_third_party` quando
  `sla_pause_outside_hours` estiver ativo.
- `is_sla_breached` é desnormalizado (atualizado por job a cada 5 min) porque o dashboard filtra por ele —
  calcular `now() > sla_due_at` em tempo real impediria índice.
- Fechamento é **bloqueado** por trigger se houver checklist obrigatório pendente (§5.11.5) ou, no fluxo de
  Qualidade, laudo técnico não emitido — comportamento já existente hoje e mantido.
- Reabertura incrementa `reopened_count` e limpa `resolved_at`/`closed_at`; acima de 3 reaberturas, o
  chamado é sinalizado para revisão de gestão.

**Transições de status válidas:**

```
open ⇄ in_progress ⇄ waiting_user | waiting_parts | waiting_third_party
                  ↓
              resolved → closed
                  ↑         │ (reabertura, ≤ 7 dias)
                  └─────────┘
qualquer (exceto closed) → cancelled | rejected
```

**RLS:** P2, com o `select` do exemplo canônico do §4.5.

#### 5.11.4 Formulários dinâmicos

```sql
create table public.ticket_form_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department      public.department not null,
  category_id     uuid,
  field_key       text not null check (field_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label           text not null check (char_length(label) between 1 and 140),
  help_text       text,
  field_type      public.form_field_type not null,
  options         jsonb not null default '[]'::jsonb,   -- [{value,label,color}]
  is_required     boolean not null default false,
  validation      jsonb not null default '{}'::jsonb,   -- {min,max,pattern,maxSizeMb,accept}
  default_value   jsonb,
  conditional_on  jsonb,                                -- {field_key, operator, value}
  position        int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tff_unique unique (organization_id, department, category_id, field_key),
  constraint tff_id_org_key unique (id, organization_id),
  constraint tff_category_fk foreign key (category_id, organization_id)
    references public.ticket_categories (id, organization_id) on delete cascade,
  constraint tff_options_ck check (
    field_type not in ('select','multiselect','radio') or jsonb_array_length(options) > 0
  )
);

create index tff_org_dept_idx on public.ticket_form_fields (organization_id, department, position)
  where is_active;
```

```sql
create table public.ticket_form_responses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id       uuid not null,
  field_id        uuid not null,
  field_key       text not null,          -- desnormalizado: o campo pode ser renomeado depois
  field_label     text not null,          -- idem — a resposta precisa continuar legível
  value           jsonb not null,
  created_at      timestamptz not null default now(),

  constraint tfr_unique unique (ticket_id, field_id),
  constraint tfr_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete cascade,
  constraint tfr_field_fk foreign key (field_id, organization_id)
    references public.ticket_form_fields (id, organization_id) on delete restrict
);

create index tfr_ticket_idx on public.ticket_form_responses (ticket_id);
create index tfr_value_gin  on public.ticket_form_responses using gin (value);
```

> A desnormalização de `field_key`/`field_label` é deliberada: um chamado de 2 anos atrás precisa continuar
> exibindo a pergunta como ela era, mesmo que o formulário tenha mudado. O sistema atual perde isso.

#### 5.11.5 Checklists de conformidade

```sql
create table public.checklist_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department      public.department not null,
  name            text not null check (char_length(name) between 2 and 120),
  description     text,
  blocks_closing  boolean not null default true,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint checklist_templates_id_org_key unique (id, organization_id)
);

create table public.checklist_template_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  checklist_template_id uuid not null,
  label                text not null check (char_length(label) between 1 and 300),
  help_text            text,
  is_required          boolean not null default true,
  requires_evidence    boolean not null default false,   -- exige anexo para marcar
  position             int not null default 0,

  constraint clti_template_fk foreign key (checklist_template_id, organization_id)
    references public.checklist_templates (id, organization_id) on delete cascade
);

-- Quando o template se aplica automaticamente
create table public.checklist_template_bindings (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  checklist_template_id uuid not null,
  category_id          uuid,
  priority             public.ticket_priority,
  department           public.department,

  constraint cltb_template_fk foreign key (checklist_template_id, organization_id)
    references public.checklist_templates (id, organization_id) on delete cascade,
  constraint cltb_category_fk foreign key (category_id, organization_id)
    references public.ticket_categories (id, organization_id) on delete cascade
);

create table public.ticket_checklists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id       uuid not null,
  template_id     uuid,
  name            text not null,
  blocks_closing  boolean not null default true,
  completed_at    timestamptz,

  constraint tcl_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete cascade,
  constraint tcl_id_org_key unique (id, organization_id)
);

create table public.ticket_checklist_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  ticket_checklist_id uuid not null,
  label               text not null,
  is_required         boolean not null default true,
  requires_evidence   boolean not null default false,
  is_done             boolean not null default false,
  done_by             uuid references public.users(id) on delete set null,
  done_at             timestamptz,
  evidence_file_id    uuid references public.files(id) on delete set null,
  notes               text,
  position            int not null default 0,

  constraint tcli_checklist_fk foreign key (ticket_checklist_id, organization_id)
    references public.ticket_checklists (id, organization_id) on delete cascade,
  constraint tcli_done_ck check ((is_done) = (done_at is not null)),
  constraint tcli_evidence_ck check (not (is_done and requires_evidence and evidence_file_id is null))
);

create index tcli_checklist_idx on public.ticket_checklist_items (ticket_checklist_id, position);
```

O trigger que impede fechar com pendência:

```sql
create or replace function public.tg_block_ticket_close_with_pending_checklist()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved','closed') and old.status not in ('resolved','closed') then
    if exists (
      select 1 from public.ticket_checklists c
      join public.ticket_checklist_items i on i.ticket_checklist_id = c.id
      where c.ticket_id = new.id and c.blocks_closing
        and i.is_required and not i.is_done
    ) then
      raise exception 'Existem itens obrigatórios de checklist pendentes neste chamado'
        using errcode = 'P0001', hint = 'Conclua o checklist antes de resolver o chamado.';
    end if;
  end if;
  return new;
end $$;
```

#### 5.11.6 Padrões detectados por IA e menções

```sql
create table public.ticket_patterns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department      public.department not null,
  pattern_name    text not null,
  keywords        text[] not null default '{}',
  description     text,
  occurrence_count int not null default 0,
  first_seen_at   timestamptz,
  last_seen_at    timestamptz,
  suggested_pop_id uuid,
  suggested_action text,
  is_dismissed    boolean not null default false,
  detected_by     public.ai_provider,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ticket_patterns_unique unique (organization_id, department, pattern_name)
);

create index ticket_patterns_org_idx on public.ticket_patterns (organization_id, occurrence_count desc)
  where not is_dismissed;
create index ticket_patterns_keywords_gin on public.ticket_patterns using gin (keywords);
```

```sql
create table public.ticket_mentions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  ticket_id        uuid not null,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  mentioned_by     uuid references public.users(id) on delete set null,
  comment_id       uuid references public.comments(id) on delete cascade,
  can_edit         boolean not null default false,   -- menção que concede permissão temporária
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),

  constraint ticket_mentions_unique unique (ticket_id, mentioned_user_id, comment_id),
  constraint ticket_mentions_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete cascade
);

create index ticket_mentions_user_idx on public.ticket_mentions (organization_id, mentioned_user_id)
  where acknowledged_at is null;
```

> `can_edit` é o mecanismo pelo qual um técnico "chama" um colega para um chamado fora do departamento dele —
> concessão pontual e auditável, sem alterar o perfil de acesso.

### 5.12 Inventário, licenças, contratos e manutenções

#### 5.12.1 `assets`

```sql
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  asset_tag         text not null check (char_length(asset_tag) between 1 and 60),
  name              text not null check (char_length(btrim(name)) between 2 and 160),
  category          public.asset_category not null,
  subcategory       text,
  status            public.asset_status not null default 'in_stock',
  -- identificação
  manufacturer      text,
  model             text,
  serial_number     text,
  imei              text,
  mac_address       macaddr,
  ip_address        inet,
  hostname          text,
  -- alocação
  assigned_to       uuid references public.users(id) on delete set null,
  department        public.department,
  location          text,
  cost_center       text,
  -- financeiro
  purchase_date     date,
  purchase_value    numeric(14,2) check (purchase_value is null or purchase_value >= 0),
  supplier_name     text,
  invoice_number    text,
  warranty_until    date,
  depreciation_months int check (depreciation_months is null or depreciation_months between 1 and 600),
  residual_value    numeric(14,2),
  -- técnico
  specs             jsonb not null default '{}'::jsonb,
  notes             text,
  qr_code           text,
  parent_asset_id   uuid,                   -- periférico ligado a um host
  decommissioned_at timestamptz,
  search_vector     tsvector generated always as (
                      to_tsvector('public.pt_unaccent',
                        coalesce(asset_tag,'') || ' ' || coalesce(name,'') || ' ' ||
                        coalesce(serial_number,'') || ' ' || coalesce(model,'') || ' ' ||
                        coalesce(manufacturer,''))
                    ) stored,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint assets_tag_unique   unique (organization_id, asset_tag),
  constraint assets_id_org_key   unique (id, organization_id),
  constraint assets_serial_unique unique (organization_id, serial_number) deferrable initially deferred,
  constraint assets_parent_fk foreign key (parent_asset_id, organization_id)
    references public.assets (id, organization_id) on delete set null,
  constraint assets_no_self_parent check (parent_asset_id is null or parent_asset_id <> id),
  constraint assets_assigned_ck check (
    status <> 'in_use' or assigned_to is not null or department is not null
  )
);

create index assets_org_status_idx   on public.assets (organization_id, status) where deleted_at is null;
create index assets_org_category_idx on public.assets (organization_id, category, status)
  where deleted_at is null;
create index assets_assigned_idx     on public.assets (organization_id, assigned_to)
  where assigned_to is not null and deleted_at is null;
create index assets_warranty_idx     on public.assets (organization_id, warranty_until)
  where warranty_until is not null and deleted_at is null;
create index assets_search_gin       on public.assets using gin (search_vector);
create index assets_specs_gin        on public.assets using gin (specs);
```

A FK de `tickets.asset_id` é adicionada aqui (ordem de criação das tabelas):

```sql
alter table public.tickets
  add constraint tickets_asset_fk foreign key (asset_id, organization_id)
  references public.assets (id, organization_id) on delete set null;
```

#### 5.12.2 `asset_maintenances`

```sql
create table public.asset_maintenances (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  asset_id         uuid not null,
  ticket_id        uuid,
  type             public.maintenance_type not null,
  status           public.maintenance_status not null default 'scheduled',
  title            text not null check (char_length(title) between 2 and 200),
  description      text,
  scheduled_for    timestamptz not null,
  started_at       timestamptz,
  completed_at     timestamptz,
  performed_by     uuid references public.users(id) on delete set null,
  provider_name    text,                     -- prestador externo
  cost             numeric(14,2) check (cost is null or cost >= 0),
  downtime_minutes int check (downtime_minutes is null or downtime_minutes >= 0),
  next_due_at      timestamptz,              -- preventiva recorrente
  recurrence       jsonb,                    -- {every: 3, unit: 'month'}
  result_notes     text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint am_asset_fk foreign key (asset_id, organization_id)
    references public.assets (id, organization_id) on delete cascade,
  constraint am_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null,
  constraint am_completed_ck check ((status = 'completed') = (completed_at is not null))
);

create index am_org_status_idx  on public.asset_maintenances (organization_id, status, scheduled_for);
create index am_asset_idx       on public.asset_maintenances (organization_id, asset_id, scheduled_for desc);
create index am_due_idx         on public.asset_maintenances (organization_id, next_due_at)
  where next_due_at is not null and status <> 'cancelled';
```

Trigger: ao concluir uma manutenção com `recurrence`, cria automaticamente a próxima ocorrência.

#### 5.12.3 Licenças de software

```sql
create table public.software_licenses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null check (char_length(name) between 2 and 160),
  vendor            text,
  license_type      public.license_type not null default 'subscription',
  seats_total       int not null default 1 check (seats_total > 0),
  seats_used        int not null default 0 check (seats_used >= 0),
  unit_cost         numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  payment_frequency public.payment_frequency,
  purchase_date     date,
  starts_at         date,
  expires_at        date,
  auto_renew        boolean not null default false,
  renewal_notice_days int not null default 30 check (renewal_notice_days between 0 and 365),
  contract_id       uuid,
  notes             text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint sl_id_org_key unique (id, organization_id),
  constraint sl_seats_ck   check (seats_used <= seats_total),
  constraint sl_dates_ck   check (expires_at is null or starts_at is null or expires_at >= starts_at)
);

create index sl_org_idx     on public.software_licenses (organization_id) where deleted_at is null;
create index sl_expiry_idx  on public.software_licenses (organization_id, expires_at)
  where expires_at is not null and deleted_at is null;

create table public.software_license_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  license_id      uuid not null,
  key_value       text not null,             -- criptografado na aplicação (§7.6)
  key_last4       text,
  is_used         boolean not null default false,
  assigned_to     uuid references public.users(id) on delete set null,
  asset_id        uuid,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint slk_license_fk foreign key (license_id, organization_id)
    references public.software_licenses (id, organization_id) on delete cascade,
  constraint slk_asset_fk foreign key (asset_id, organization_id)
    references public.assets (id, organization_id) on delete set null
);

create table public.license_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  license_id      uuid not null,
  user_id         uuid references public.users(id) on delete cascade,
  asset_id        uuid,
  assigned_at     timestamptz not null default now(),
  revoked_at      timestamptz,
  assigned_by     uuid references public.users(id) on delete set null,

  constraint la_license_fk foreign key (license_id, organization_id)
    references public.software_licenses (id, organization_id) on delete cascade,
  constraint la_asset_fk foreign key (asset_id, organization_id)
    references public.assets (id, organization_id) on delete cascade,
  constraint la_target_ck check (user_id is not null or asset_id is not null)
);

create unique index la_active_user_idx on public.license_assignments (license_id, user_id)
  where revoked_at is null and user_id is not null;
create unique index la_active_asset_idx on public.license_assignments (license_id, asset_id)
  where revoked_at is null and asset_id is not null;

create table public.software_license_renewals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  license_id      uuid not null,
  renewed_at      date not null,
  previous_expiry date,
  new_expiry      date not null,
  cost            numeric(14,2) not null check (cost >= 0),
  seats_delta     int not null default 0,
  invoice_number  text,
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint slr_license_fk foreign key (license_id, organization_id)
    references public.software_licenses (id, organization_id) on delete cascade
);
```

Trigger mantém `software_licenses.seats_used` = contagem de `license_assignments` ativas, e bloqueia
atribuição que exceda `seats_total`.

#### 5.12.4 Contratos

```sql
create table public.contracts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  code              text,
  name              text not null check (char_length(name) between 2 and 200),
  vendor_name       text not null,
  vendor_cnpj       text check (vendor_cnpj is null or vendor_cnpj ~ '^\d{14}$'),
  department        public.department not null default 'ti',
  category          text,
  status            public.contract_status not null default 'active',
  value             numeric(14,2) check (value is null or value >= 0),
  payment_frequency public.payment_frequency not null default 'monthly',
  starts_at         date not null,
  ends_at           date,
  notice_days       int not null default 30 check (notice_days between 0 and 365),
  auto_renew        boolean not null default false,
  responsible_id    uuid references public.users(id) on delete set null,
  cost_center       text,
  terms             text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint contracts_code_unique unique (organization_id, code),
  constraint contracts_id_org_key  unique (id, organization_id),
  constraint contracts_dates_ck    check (ends_at is null or ends_at >= starts_at)
);

create index contracts_org_status_idx on public.contracts (organization_id, status)
  where deleted_at is null;
create index contracts_expiry_idx     on public.contracts (organization_id, ends_at)
  where ends_at is not null and deleted_at is null;

alter table public.software_licenses
  add constraint sl_contract_fk foreign key (contract_id, organization_id)
  references public.contracts (id, organization_id) on delete set null;
```

**Alertas de vencimento** (licenças, contratos, garantias, manutenções) são um único job diário que varre as
quatro tabelas e cria notificações — não quatro jobs distintos.

### 5.13 Conhecimento — POPs e base de conhecimento

#### 5.13.1 `pops`

```sql
create table public.pops (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  code              text,                       -- "POP-TI-014"
  title             text not null check (char_length(btrim(title)) between 3 and 250),
  summary           text check (summary is null or char_length(summary) <= 600),
  department        public.department not null,
  category_id       uuid,
  status            public.pop_status not null default 'draft',
  visibility        public.pop_visibility not null default 'internal',
  allowed_profile_ids uuid[] not null default '{}',  -- usado quando visibility = 'restricted'
  version           int not null default 1 check (version > 0),
  keywords          text[] not null default '{}',
  estimated_minutes int check (estimated_minutes is null or estimated_minutes between 1 and 600),
  -- conteúdo em blocos (o editor atual já usa esse modelo)
  blocks            jsonb not null default '[]'::jsonb,
  plain_text        text,                       -- projeção do conteúdo para busca e embedding
  cover_file_id     uuid references public.files(id) on delete set null,
  -- ciclo de vida
  author_id         uuid references public.users(id) on delete set null,
  reviewer_id       uuid references public.users(id) on delete set null,
  published_at      timestamptz,
  review_due_at     date,                       -- revisão periódica obrigatória
  archived_at       timestamptz,
  -- métricas desnormalizadas (listagem)
  view_count        int not null default 0,
  helpful_count     int not null default 0,
  unhelpful_count   int not null default 0,
  linked_ticket_count int not null default 0,
  -- busca
  embedding         vector(1536),
  search_vector     tsvector generated always as (
                      to_tsvector('public.pt_unaccent',
                        coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' ||
                        coalesce(plain_text,'') || ' ' || array_to_string(keywords, ' '))
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint pops_code_unique unique (organization_id, code),
  constraint pops_id_org_key  unique (id, organization_id),
  constraint pops_published_ck check ((status = 'published') = (published_at is not null)),
  constraint pops_blocks_ck    check (jsonb_typeof(blocks) = 'array')
);

create index pops_org_status_idx  on public.pops (organization_id, status, department)
  where deleted_at is null;
create index pops_visibility_idx  on public.pops (organization_id, visibility, status)
  where deleted_at is null;
create index pops_review_due_idx  on public.pops (organization_id, review_due_at)
  where status = 'published' and deleted_at is null;
create index pops_keywords_gin    on public.pops using gin (keywords);
create index pops_search_gin      on public.pops using gin (search_vector);
create index pops_embedding_idx   on public.pops using hnsw (embedding vector_cosine_ops);
```

**Formato de `blocks`** — array de objetos, cada um com `type` de `pop_block_type`:

```jsonc
[
  { "id": "b1", "type": "heading",   "level": 2, "text": "Pré-requisitos" },
  { "id": "b2", "type": "checklist", "items": [{"text": "Acesso ao AD", "checked": false}] },
  { "id": "b3", "type": "image",     "fileId": "uuid", "caption": "Tela de login", "alt": "..." },
  { "id": "b4", "type": "callout",   "variant": "warning", "text": "Não reiniciar em horário comercial" },
  { "id": "b5", "type": "code",      "language": "powershell", "code": "Get-ADUser ..." }
]
```

Validado por schema Zod compartilhado (`modules/knowledge/schemas/blocks.ts`) na Server Action e no editor.

#### 5.13.2 Versões, feedback e interações

```sql
create table public.pop_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pop_id          uuid not null,
  version         int not null,
  title           text not null,
  blocks          jsonb not null,
  plain_text      text,
  change_summary  text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint pop_versions_unique unique (pop_id, version),
  constraint pop_versions_pop_fk foreign key (pop_id, organization_id)
    references public.pops (id, organization_id) on delete cascade
);

create index pop_versions_pop_idx on public.pop_versions (pop_id, version desc);

create table public.pop_feedbacks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pop_id          uuid not null,
  user_id         uuid references public.users(id) on delete set null,
  is_helpful      boolean not null,
  rating          smallint check (rating between 1 and 5),
  comment         text check (comment is null or char_length(comment) <= 2000),
  version         int,
  created_at      timestamptz not null default now(),

  constraint pop_feedbacks_unique unique (pop_id, user_id),
  constraint pop_feedbacks_pop_fk foreign key (pop_id, organization_id)
    references public.pops (id, organization_id) on delete cascade
);

create table public.pop_interactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pop_id          uuid not null,
  user_id         uuid references public.users(id) on delete set null,
  type            public.pop_interaction_type not null,
  ticket_id       uuid,
  search_query    text,
  created_at      timestamptz not null default now(),

  constraint pop_interactions_pop_fk foreign key (pop_id, organization_id)
    references public.pops (id, organization_id) on delete cascade
);

create index pop_interactions_pop_idx  on public.pop_interactions (organization_id, pop_id, created_at desc);
create index pop_interactions_type_idx on public.pop_interactions (organization_id, type, created_at desc);
```

**Efetividade do POP** — métrica que o produto já expõe hoje: proporção de chamados de uma categoria que
foram resolvidos após consulta ao POP, calculada a partir de `pop_interactions` com `type =
'linked_to_ticket'` cruzado com `tickets.resolved_at`. Materializada por job (§5.23).

**Retenção:** `pop_interactions` de tipo `view` é agregada mensalmente e as linhas cruas com mais de 90 dias
são removidas — é a tabela de maior volume do módulo.

**RLS:** P1 para `visibility = 'public'`/`'internal'`; `restricted` exige que um dos
`allowed_profile_ids` esteja entre os perfis do usuário. O portal SAC lê apenas `visibility = 'public'` e
`status = 'published'`.

---
### 5.14 RH — Recursos Humanos

Módulo com o dado mais sensível do sistema (CPF, salário, atestado médico). **Todas as tabelas usam o perfil
de policy P3 (confidencial)**: leitura restrita a `admin+` do RH e ao próprio titular; nada de "todo
`manager` vê tudo".

> **Correção arquitetural em relação ao sistema atual:** o cálculo de INSS, IRRF e a geração da folha estão
> hoje em PL/pgSQL (`rh_calc_inss`, `rh_calc_irpf`, `rh_generate_payroll`). Aqui eles são **funções puras em
> TypeScript** (`modules/hr/domain/payroll/`), com tabelas de faixas versionadas em `hr_tax_brackets` e
> cobertura de teste obrigatória — inclusive casos de virada de faixa e de teto. O banco guarda o resultado
> e a memória de cálculo, não a regra (§2.5).

#### 5.14.1 Empresas, departamentos e cargos

```sql
create table public.hr_companies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name      text not null check (char_length(legal_name) between 2 and 200),
  trade_name      text,
  cnpj            text not null check (cnpj ~ '^\d{14}$'),
  cnae            text,
  address         jsonb not null default '{}'::jsonb,
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint hr_companies_cnpj_unique unique (organization_id, cnpj),
  constraint hr_companies_id_org_key  unique (id, organization_id)
);
create unique index hr_companies_one_default_idx
  on public.hr_companies (organization_id) where is_default;

create table public.hr_departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id      uuid,
  name            text not null check (char_length(name) between 2 and 120),
  code            text,
  cost_center     text,
  manager_id      uuid references public.users(id) on delete set null,
  parent_id       uuid,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint hr_departments_unique unique (organization_id, name),
  constraint hr_departments_id_org_key unique (id, organization_id),
  constraint hr_departments_company_fk foreign key (company_id, organization_id)
    references public.hr_companies (id, organization_id) on delete set null,
  constraint hr_departments_parent_fk foreign key (parent_id, organization_id)
    references public.hr_departments (id, organization_id) on delete set null
);

create table public.hr_positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null check (char_length(title) between 2 and 140),
  cbo_code        text,
  level           text,
  min_salary      numeric(14,2) check (min_salary is null or min_salary >= 0),
  max_salary      numeric(14,2) check (max_salary is null or max_salary >= 0),
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint hr_positions_unique unique (organization_id, title, level),
  constraint hr_positions_id_org_key unique (id, organization_id),
  constraint hr_positions_salary_ck check (max_salary is null or min_salary is null or max_salary >= min_salary)
);
```

#### 5.14.2 `hr_employees`

```sql
create table public.hr_employees (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  membership_id      uuid,                    -- null enquanto não tem acesso ao sistema
  company_id         uuid,
  department_id      uuid,
  position_id        uuid,
  manager_id         uuid,                    -- outro hr_employee
  registration_number text,                   -- matrícula
  -- dados pessoais (LGPD: categoria "dado pessoal", §7.10)
  full_name          text not null check (char_length(btrim(full_name)) between 2 and 150),
  social_name        text,
  cpf                text check (cpf is null or cpf ~ '^\d{11}$'),
  rg                 text,
  birth_date         date check (birth_date is null or birth_date > '1920-01-01'),
  gender             text,
  marital_status     text,
  nationality        text,
  personal_email     citext,
  phone              text,
  emergency_contact  jsonb not null default '{}'::jsonb,
  address            jsonb not null default '{}'::jsonb,
  -- vínculo
  contract_type      public.hr_contract_type not null default 'clt',
  employment_status  public.hr_employment_status not null default 'active',
  hired_at           date not null,
  probation_ends_at  date,
  terminated_at      date,
  termination_reason text,
  -- remuneração
  base_salary        numeric(14,2) check (base_salary is null or base_salary >= 0),
  salary_currency    char(3) not null default 'BRL',
  weekly_hours       numeric(5,2) check (weekly_hours is null or weekly_hours between 1 and 60),
  -- bancário (criptografado na aplicação, §7.6)
  bank_data          jsonb not null default '{}'::jsonb,
  pis_pasep          text,
  -- férias
  vacation_balance_days numeric(6,2) not null default 0,
  next_vacation_due  date,
  notes              text,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  constraint hr_employees_cpf_unique unique (organization_id, cpf),
  constraint hr_employees_reg_unique unique (organization_id, registration_number),
  constraint hr_employees_membership_unique unique (membership_id),
  constraint hr_employees_id_org_key unique (id, organization_id),
  constraint hr_employees_membership_fk foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete set null,
  constraint hr_employees_company_fk foreign key (company_id, organization_id)
    references public.hr_companies (id, organization_id) on delete set null,
  constraint hr_employees_dept_fk foreign key (department_id, organization_id)
    references public.hr_departments (id, organization_id) on delete set null,
  constraint hr_employees_position_fk foreign key (position_id, organization_id)
    references public.hr_positions (id, organization_id) on delete set null,
  constraint hr_employees_manager_fk foreign key (manager_id, organization_id)
    references public.hr_employees (id, organization_id) on delete set null,
  constraint hr_employees_term_ck check (
    (employment_status = 'terminated') = (terminated_at is not null)
  )
);

create index hr_employees_org_status_idx on public.hr_employees (organization_id, employment_status)
  where deleted_at is null;
create index hr_employees_dept_idx    on public.hr_employees (organization_id, department_id)
  where deleted_at is null;
create index hr_employees_manager_idx on public.hr_employees (organization_id, manager_id);
create index hr_employees_membership_idx on public.hr_employees (membership_id)
  where membership_id is not null;
create index hr_employees_vacation_idx on public.hr_employees (organization_id, next_vacation_due)
  where employment_status = 'active' and deleted_at is null;
```

**RLS (P3), escrita por extenso porque é o caso mais sensível do sistema:**

```sql
create policy hr_employees_select on public.hr_employees for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      -- o próprio colaborador (tela "Meu RH")
      membership_id = (select m.id from public.memberships m
                        where m.organization_id = hr_employees.organization_id
                          and m.user_id = public.current_user_id())
      -- RH com permissão explícita
      or public.can_view_department(organization_id, 'rh')
      -- gestor direto: vê a própria equipe, mas NÃO salário (coluna filtrada na view, abaixo)
      or manager_id = (select e.id from public.hr_employees e
                        join public.memberships m on m.id = e.membership_id
                       where m.user_id = public.current_user_id()
                         and e.organization_id = hr_employees.organization_id)
      or public.has_min_role(organization_id, 'owner')
    )
  );

create policy hr_employees_insert on public.hr_employees for insert to authenticated
  with check (public.can_view_department(organization_id, 'rh')
              and public.has_min_role(organization_id, 'manager'));

create policy hr_employees_update on public.hr_employees for update to authenticated
  using (public.can_view_department(organization_id, 'rh')
         and public.has_min_role(organization_id, 'manager'))
  with check (public.is_org_member(organization_id));

create policy hr_employees_delete on public.hr_employees for delete to authenticated
  using (public.has_min_role(organization_id, 'owner'));
```

> **Coluna sensível vista por gestor:** RLS controla *linhas*, não *colunas*. Para que o gestor direto veja a
> equipe **sem** salário, a aplicação nunca consulta `hr_employees` diretamente na tela de equipe — usa a view
> `hr_team_view`, que omite `base_salary`, `cpf`, `bank_data` e `pis_pasep`. A tela de RH usa a tabela.
> Views com `security_invoker = true` herdam o RLS da tabela base.

```sql
create view public.hr_team_view with (security_invoker = true) as
  select id, organization_id, membership_id, department_id, position_id, manager_id,
         full_name, social_name, employment_status, hired_at, contract_type
    from public.hr_employees where deleted_at is null;
```

#### 5.14.3 Solicitações, férias, ausências e atestados

Todas as solicitações de RH compartilham uma tabela base com um fluxo de aprovação comum — o sistema atual
tem quatro tabelas com quatro fluxos quase idênticos.

```sql
create table public.hr_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  kind            text not null check (kind in
                    ('vacation','absence','medical_certificate','reimbursement',
                     'document','salary_review','termination','other')),
  status          public.hr_request_status not null default 'pending',
  title           text not null,
  details         jsonb not null default '{}'::jsonb,   -- payload específico do tipo
  starts_on       date,
  ends_on         date,
  days            numeric(6,2),
  amount          numeric(14,2) check (amount is null or amount >= 0),
  ticket_id       uuid,                                  -- chamado gerado no módulo de atendimento
  requested_by    uuid references public.users(id) on delete set null,
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint hr_requests_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade,
  constraint hr_requests_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null,
  constraint hr_requests_id_org_key unique (id, organization_id),
  constraint hr_requests_dates_ck check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint hr_requests_review_ck check (
    (status in ('approved','rejected')) = (reviewed_at is not null)
  )
);

create index hr_requests_org_status_idx on public.hr_requests (organization_id, status, created_at desc);
create index hr_requests_employee_idx   on public.hr_requests (organization_id, employee_id, created_at desc);
create index hr_requests_kind_idx       on public.hr_requests (organization_id, kind, status);
create index hr_requests_period_idx     on public.hr_requests (organization_id, starts_on, ends_on)
  where status = 'approved';
```

```sql
create table public.hr_absences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  request_id      uuid,
  type            public.hr_absence_type not null,
  starts_on       date not null,
  ends_on         date not null,
  days            numeric(6,2) not null check (days > 0),
  is_paid         boolean not null default true,
  discounts_payroll boolean not null default false,
  cid_code        text,                       -- CID do atestado (dado de saúde: acesso restrito)
  file_id         uuid references public.files(id) on delete set null,
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint hr_absences_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade,
  constraint hr_absences_request_fk foreign key (request_id, organization_id)
    references public.hr_requests (id, organization_id) on delete set null,
  constraint hr_absences_dates_ck check (ends_on >= starts_on)
);

create index hr_absences_employee_idx on public.hr_absences (organization_id, employee_id, starts_on desc);
create index hr_absences_period_idx   on public.hr_absences (organization_id, starts_on, ends_on);
```

> `cid_code` é **dado de saúde** — categoria especial na LGPD. Visível apenas para perfis de RH com a
> permissão `hr.medical.view` explícita; o gestor direto vê a ausência, não o diagnóstico. Todo acesso a
> essa coluna gera registro em `activity_log` com `action = 'viewed'` (§7.10).

#### 5.14.4 Benefícios

```sql
create table public.hr_benefit_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 120),
  type            public.hr_benefit_type not null,
  provider_name   text,
  employer_cost   numeric(14,2) not null default 0 check (employer_cost >= 0),
  employee_cost   numeric(14,2) not null default 0 check (employee_cost >= 0),
  calculation     jsonb not null default '{}'::jsonb,  -- {mode:'fixed'|'per_day'|'percent_salary', value}
  is_taxable      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint hr_benefit_plans_unique unique (organization_id, name),
  constraint hr_benefit_plans_id_org_key unique (id, organization_id)
);

create table public.hr_employee_benefits (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  plan_id         uuid not null,
  starts_on       date not null default current_date,
  ends_on         date,
  custom_value    numeric(14,2),
  dependents      int not null default 0 check (dependents >= 0),
  notes           text,
  created_at      timestamptz not null default now(),

  constraint heb_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade,
  constraint heb_plan_fk foreign key (plan_id, organization_id)
    references public.hr_benefit_plans (id, organization_id) on delete restrict,
  constraint heb_dates_ck check (ends_on is null or ends_on >= starts_on)
);

create unique index heb_active_idx on public.hr_employee_benefits (employee_id, plan_id)
  where ends_on is null;
create index heb_org_idx on public.hr_employee_benefits (organization_id, plan_id);
```

Benefícios com controle de saldo/recarga (vale-transporte, vale-refeição, combustível) usam uma única tabela
de movimentação, em vez das três tabelas separadas de hoje:

```sql
create table public.hr_benefit_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_benefit_id uuid not null,
  reference_month date not null,          -- sempre dia 1
  quantity        numeric(12,2) not null default 0,   -- dias úteis, litros, etc.
  unit_value      numeric(14,4) not null default 0,
  total_value     numeric(14,2) generated always as (round(quantity * unit_value, 2)) stored,
  employee_share  numeric(14,2) not null default 0,
  status          text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  receipt_file_id uuid references public.files(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint hbm_benefit_fk foreign key (employee_benefit_id) references public.hr_employee_benefits(id)
    on delete cascade,
  constraint hbm_unique unique (employee_benefit_id, reference_month)
);

create index hbm_org_month_idx on public.hr_benefit_movements (organization_id, reference_month desc, status);
```

#### 5.14.5 Folha de pagamento

```sql
create table public.hr_tax_brackets (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('inss','irrf','fgts')),
  valid_from      date not null,
  valid_to        date,
  bracket_order   int not null,
  min_amount      numeric(14,2) not null,
  max_amount      numeric(14,2),
  rate            numeric(7,4) not null,      -- 0.0750 = 7,5%
  deduction       numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),

  constraint hr_tax_brackets_unique unique (kind, valid_from, bracket_order)
);
```

> **Tabela global, sem `organization_id`** — as faixas de INSS/IRRF são lei federal, iguais para todos.
> É uma das pouquíssimas tabelas do sistema sem tenant. RLS: `select` para qualquer autenticado;
> escrita apenas por migration.

```sql
create table public.hr_payroll_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  company_id       uuid,
  reference_month  date not null,             -- sempre dia 1
  kind             text not null default 'monthly'
                     check (kind in ('monthly','13th_first','13th_second','vacation','termination')),
  status           public.hr_payroll_status not null default 'draft',
  employee_count   int not null default 0,
  gross_total      numeric(14,2) not null default 0,
  deductions_total numeric(14,2) not null default 0,
  net_total        numeric(14,2) not null default 0,
  employer_cost    numeric(14,2) not null default 0,
  calculated_at    timestamptz,
  calculated_by    uuid references public.users(id) on delete set null,
  approved_at      timestamptz,
  approved_by      uuid references public.users(id) on delete set null,
  paid_at          timestamptz,
  closed_at        timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint hr_payroll_runs_unique unique (organization_id, company_id, reference_month, kind),
  constraint hr_payroll_runs_id_org_key unique (id, organization_id),
  constraint hr_payroll_runs_company_fk foreign key (company_id, organization_id)
    references public.hr_companies (id, organization_id) on delete set null
);

create index hr_payroll_runs_org_idx on public.hr_payroll_runs (organization_id, reference_month desc);
```

```sql
create table public.hr_payroll_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id  uuid not null,
  employee_id     uuid not null,
  base_salary     numeric(14,2) not null default 0,
  gross_amount    numeric(14,2) not null default 0,
  inss_base       numeric(14,2) not null default 0,
  inss_amount     numeric(14,2) not null default 0,
  irrf_base       numeric(14,2) not null default 0,
  irrf_amount     numeric(14,2) not null default 0,
  fgts_amount     numeric(14,2) not null default 0,
  benefits_amount numeric(14,2) not null default 0,
  other_earnings  numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  net_amount      numeric(14,2) not null default 0,
  worked_days     numeric(6,2),
  absence_days    numeric(6,2) not null default 0,
  overtime_hours  numeric(7,2) not null default 0,
  -- memória de cálculo: como cada número foi obtido (auditoria e conferência)
  breakdown       jsonb not null default '[]'::jsonb,
  calc_version    text not null,             -- versão do algoritmo que gerou (reprodutibilidade)
  created_at      timestamptz not null default now(),

  constraint hpe_unique unique (payroll_run_id, employee_id),
  constraint hpe_run_fk foreign key (payroll_run_id, organization_id)
    references public.hr_payroll_runs (id, organization_id) on delete cascade,
  constraint hpe_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete restrict
);

create index hpe_run_idx      on public.hr_payroll_entries (payroll_run_id);
create index hpe_employee_idx on public.hr_payroll_entries (organization_id, employee_id, created_at desc);
```

**Formato de `breakdown`** — cada linha do holerite, com origem rastreável:

```jsonc
[
  { "code": "001", "label": "Salário base",       "kind": "earning",   "base": 5000.00, "rate": null,   "amount": 5000.00 },
  { "code": "301", "label": "INSS",               "kind": "deduction", "base": 5000.00, "rate": 0.1100, "amount": 449.36,
    "reference": "hr_tax_brackets:inss:2026-01-01" },
  { "code": "302", "label": "IRRF",               "kind": "deduction", "base": 4550.64, "rate": 0.0750, "amount": 155.62 }
]
```

```sql
create table public.hr_payslips (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  payroll_entry_id uuid,
  reference_month date not null,
  kind            text not null default 'monthly',
  file_id         uuid references public.files(id) on delete set null,
  net_amount      numeric(14,2) not null,
  published_at    timestamptz,
  viewed_at       timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),

  constraint hr_payslips_unique unique (employee_id, reference_month, kind),
  constraint hr_payslips_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade
);

create index hr_payslips_employee_idx on public.hr_payslips (organization_id, employee_id, reference_month desc);
```

**Fluxo da folha:** `draft` (seleção de competência e colaboradores) → `calculated` (executa o cálculo em
TypeScript, grava `hr_payroll_entries` com `breakdown` e `calc_version`) → `approved` (bloqueia edição) →
`paid` (gera `fin_entries` do tipo `payable`) → `closed` (imutável; correção exige folha complementar).

#### 5.14.6 Documentos e histórico

```sql
create table public.hr_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  category        public.hr_document_category not null,
  name            text not null,
  file_id         uuid not null references public.files(id) on delete cascade,
  issued_on       date,
  expires_on      date,
  requires_signature boolean not null default false,
  signed_at       timestamptz,
  uploaded_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint hr_documents_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade
);

create index hr_documents_employee_idx on public.hr_documents (organization_id, employee_id, category);
create index hr_documents_expiry_idx   on public.hr_documents (organization_id, expires_on)
  where expires_on is not null;

create table public.hr_employee_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  event_type      text not null check (event_type in
                    ('hired','promoted','salary_change','department_change','position_change',
                     'leave_start','leave_end','warning','terminated','rehired')),
  effective_on    date not null,
  previous_value  jsonb,
  new_value       jsonb,
  reason          text,
  document_id     uuid references public.hr_documents(id) on delete set null,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint hr_history_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade
);

create index hr_history_employee_idx on public.hr_employee_history (organization_id, employee_id, effective_on desc);
```

#### 5.14.7 Onboarding e offboarding

Fluxo que o sistema atual resolve com triggers específicos (`create_offboarding_ti_ticket`) e que aqui vira
um **workflow** (§5.21) — mas com uma tabela para rastrear a execução do checklist de acessos:

```sql
create table public.hr_access_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null,
  system_name     text not null,             -- 'E-mail', 'ERP', 'VPN', 'Crachá'
  access_level    text,
  granted_at      timestamptz,
  granted_by      uuid references public.users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.users(id) on delete set null,
  ticket_id       uuid,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint hag_employee_fk foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete cascade,
  constraint hag_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null
);

create index hag_employee_idx on public.hr_access_grants (organization_id, employee_id);
create index hag_pending_revoke_idx on public.hr_access_grants (organization_id, employee_id)
  where revoked_at is null;
```

Ao mudar `hr_employees.employment_status` para `terminated`, um workflow abre chamado de TI listando todos
os `hr_access_grants` com `revoked_at is null` — e o chamado não fecha enquanto restar acesso ativo
(checklist com `blocks_closing`).

### 5.15 Financeiro

#### 5.15.1 Plano de contas e centros de custo

```sql
create table public.fin_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id       uuid,
  code            text,
  name            text not null check (char_length(name) between 2 and 120),
  kind            public.fin_entry_kind not null,
  is_active       boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),

  constraint fin_categories_unique unique (organization_id, kind, name, parent_id),
  constraint fin_categories_id_org_key unique (id, organization_id),
  constraint fin_categories_parent_fk foreign key (parent_id, organization_id)
    references public.fin_categories (id, organization_id) on delete cascade
);

create table public.fin_cost_centers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  name            text not null,
  department      public.department,
  manager_id      uuid references public.users(id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint fin_cost_centers_unique unique (organization_id, code),
  constraint fin_cost_centers_id_org_key unique (id, organization_id)
);

create table public.fin_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  kind            text not null default 'checking'
                    check (kind in ('checking','savings','cash','card','investment','other')),
  bank_code       text,
  agency          text,
  account_number  text,
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint fin_accounts_id_org_key unique (id, organization_id)
);
```

#### 5.15.2 `fin_entries` — contas a pagar e a receber

```sql
create table public.fin_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            public.fin_entry_kind not null,
  status          public.fin_entry_status not null default 'pending',
  description     text not null check (char_length(btrim(description)) between 2 and 300),
  document_number text,
  category_id     uuid,
  cost_center_id  uuid,
  account_id      uuid,
  -- contraparte
  counterparty_name text,
  counterparty_cnpj text check (counterparty_cnpj is null or counterparty_cnpj ~ '^\d{11}$|^\d{14}$'),
  crm_account_id  uuid,                       -- quando a contraparte é um cliente do CRM
  supplier_id     uuid,
  -- valores
  amount          numeric(14,2) not null check (amount > 0),
  paid_amount     numeric(14,2) not null default 0 check (paid_amount >= 0),
  discount        numeric(14,2) not null default 0 check (discount >= 0),
  interest        numeric(14,2) not null default 0 check (interest >= 0),
  currency        char(3) not null default 'BRL',
  -- datas
  issue_date      date not null default current_date,
  competence_date date not null,              -- regime de competência
  due_date        date not null,
  paid_at         date,
  payment_method  public.fin_payment_method,
  -- recorrência e parcelamento
  recurrence      jsonb,                      -- {every:1, unit:'month', until:'2027-12-31'}
  parent_entry_id uuid,
  installment_no  int check (installment_no is null or installment_no > 0),
  installment_total int check (installment_total is null or installment_total > 0),
  -- origem
  source_type     text,                       -- 'purchase_request' | 'crm_order' | 'payroll' | 'import' | 'manual'
  source_id       uuid,
  import_id       uuid,
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint fin_entries_id_org_key unique (id, organization_id),
  constraint fin_entries_category_fk foreign key (category_id, organization_id)
    references public.fin_categories (id, organization_id) on delete set null,
  constraint fin_entries_cc_fk foreign key (cost_center_id, organization_id)
    references public.fin_cost_centers (id, organization_id) on delete set null,
  constraint fin_entries_account_fk foreign key (account_id, organization_id)
    references public.fin_accounts (id, organization_id) on delete set null,
  constraint fin_entries_parent_fk foreign key (parent_entry_id, organization_id)
    references public.fin_entries (id, organization_id) on delete cascade,
  constraint fin_entries_paid_ck check (
    (status = 'paid') = (paid_at is not null and paid_amount >= amount - discount)
  ),
  constraint fin_entries_installment_ck check (
    (installment_no is null) = (installment_total is null)
    and (installment_total is null or installment_no <= installment_total)
  )
);

create index fin_entries_org_kind_idx  on public.fin_entries (organization_id, kind, status, due_date)
  where deleted_at is null;
create index fin_entries_due_idx       on public.fin_entries (organization_id, due_date)
  where status in ('pending','scheduled','partially_paid') and deleted_at is null;
create index fin_entries_competence_idx on public.fin_entries (organization_id, competence_date)
  where deleted_at is null;
create index fin_entries_cc_idx        on public.fin_entries (organization_id, cost_center_id, competence_date)
  where deleted_at is null;
create index fin_entries_source_idx    on public.fin_entries (organization_id, source_type, source_id)
  where source_id is not null;
create index fin_entries_crm_idx       on public.fin_entries (organization_id, crm_account_id)
  where crm_account_id is not null;
```

**Regras:**

- `overdue` **não** é gravado manualmente: um job diário promove `pending`/`scheduled` com `due_date < today`
  para `overdue`. Manter isso como job (e não como coluna calculada) permite índice e histórico.
- Parcelamento gera N linhas filhas com `parent_entry_id`, cada uma com seu `due_date` — nunca uma linha com
  "saldo".
- Recorrência gera as próximas 12 ocorrências e é re-alimentada por job — nunca gera infinito.
- Baixa parcial atualiza `paid_amount` e muda para `partially_paid`; quitação total dispara o
  `fin_entries_paid_ck`.

**RLS (P3 atenuado):** `select` exige perfil do departamento `financeiro`, **ou** ser o solicitante do
lançamento de origem, **ou** ser gestor do centro de custo. `restrictions.cost_centers` e
`restrictions.max_amount` do perfil de acesso são aplicadas na aplicação e refletidas na policy.

#### 5.15.3 Importação de extrato e conciliação

```sql
create table public.fin_imports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id      uuid,
  file_id         uuid references public.files(id) on delete set null,
  format          text not null check (format in ('ofx','csv','xlsx','cnab240','cnab400')),
  status          public.fin_import_status not null default 'pending',
  period_start    date,
  period_end      date,
  total_rows      int not null default 0,
  imported_rows   int not null default 0,
  skipped_rows    int not null default 0,
  error_rows      int not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  mapping         jsonb not null default '{}'::jsonb,   -- coluna do arquivo → campo do sistema
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,

  constraint fin_imports_account_fk foreign key (account_id, organization_id)
    references public.fin_accounts (id, organization_id) on delete set null
);

create table public.fin_transactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id      uuid not null,
  import_id       uuid,
  external_id     text,                       -- FITID do OFX — chave de deduplicação
  posted_on       date not null,
  description     text not null,
  amount          numeric(14,2) not null,     -- negativo = saída
  balance_after   numeric(14,2),
  entry_id        uuid,                       -- conciliado com um lançamento
  reconciled_at   timestamptz,
  reconciled_by   uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint fin_tx_account_fk foreign key (account_id, organization_id)
    references public.fin_accounts (id, organization_id) on delete cascade,
  constraint fin_tx_entry_fk foreign key (entry_id, organization_id)
    references public.fin_entries (id, organization_id) on delete set null
);

create unique index fin_tx_dedupe_idx on public.fin_transactions (account_id, external_id)
  where external_id is not null;
create index fin_tx_unreconciled_idx on public.fin_transactions (organization_id, posted_on)
  where reconciled_at is null;
```

> `external_id` com índice único parcial é o que impede importar o mesmo extrato duas vezes — problema
> clássico e caro de conciliação financeira.

#### 5.15.4 Compras e requisições

```sql
create table public.fin_purchase_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number          int not null,
  title           text not null check (char_length(title) between 3 and 200),
  justification   text,
  status          public.fin_purchase_status not null default 'draft',
  requester_id    uuid not null references public.users(id) on delete restrict,
  department      public.department,
  cost_center_id  uuid,
  ticket_id       uuid,
  needed_by       date,
  estimated_total numeric(14,2) not null default 0 check (estimated_total >= 0),
  approved_total  numeric(14,2),
  selected_quote_id uuid,
  ordered_at      timestamptz,
  received_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint fpr_number_unique unique (organization_id, number),
  constraint fpr_id_org_key    unique (id, organization_id),
  constraint fpr_cc_fk foreign key (cost_center_id, organization_id)
    references public.fin_cost_centers (id, organization_id) on delete set null,
  constraint fpr_ticket_fk foreign key (ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null
);

create index fpr_org_status_idx on public.fin_purchase_requests (organization_id, status, created_at desc);
create index fpr_requester_idx  on public.fin_purchase_requests (organization_id, requester_id);

create table public.fin_purchase_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null,
  product_id      uuid,                       -- catálogo unificado (§5.16)
  description     text not null,
  quantity        numeric(14,4) not null check (quantity > 0),
  unit            text not null default 'un',
  estimated_unit_price numeric(14,4),
  received_quantity numeric(14,4) not null default 0,
  position        int not null default 0,

  constraint fpi_request_fk foreign key (request_id, organization_id)
    references public.fin_purchase_requests (id, organization_id) on delete cascade
);

create table public.fin_purchase_quotes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null,
  supplier_id     uuid,
  supplier_name   text not null,
  total_amount    numeric(14,2) not null check (total_amount >= 0),
  delivery_days   int,
  payment_terms   text,
  valid_until     date,
  file_id         uuid references public.files(id) on delete set null,
  is_selected     boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint fpq_request_fk foreign key (request_id, organization_id)
    references public.fin_purchase_requests (id, organization_id) on delete cascade,
  constraint fpq_id_org_key unique (id, organization_id)
);

create unique index fpq_one_selected_idx on public.fin_purchase_quotes (request_id) where is_selected;
```

Aprovações em múltiplos níveis por alçada, genéricas (reusadas por RH, Financeiro e Comercial):

```sql
create table public.approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null check (entity_type in
                    ('fin_purchase_request','fin_entry','hr_request','crm_order','crm_discount')),
  entity_id       uuid not null,
  step            int not null default 1,
  approver_id     uuid references public.users(id) on delete set null,
  approver_role   public.member_role,
  status          public.approval_status not null default 'pending',
  amount_limit    numeric(14,2),
  decided_at      timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint approvals_unique unique (entity_type, entity_id, step)
);

create index approvals_pending_idx on public.approvals (organization_id, approver_id, status)
  where status = 'pending';
create index approvals_entity_idx  on public.approvals (organization_id, entity_type, entity_id, step);
```

#### 5.15.5 Orçamento por departamento

```sql
create table public.fin_budgets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cost_center_id  uuid,
  department      public.department,
  category_id     uuid,
  reference_month date not null,              -- dia 1
  planned_amount  numeric(14,2) not null check (planned_amount >= 0),
  committed_amount numeric(14,2) not null default 0,   -- requisições aprovadas ainda não pagas
  actual_amount   numeric(14,2) not null default 0,
  alert_threshold_pct numeric(5,2) not null default 80 check (alert_threshold_pct between 1 and 200),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint fin_budgets_unique unique (organization_id, cost_center_id, category_id, reference_month),
  constraint fin_budgets_cc_fk foreign key (cost_center_id, organization_id)
    references public.fin_cost_centers (id, organization_id) on delete cascade
);

create index fin_budgets_period_idx on public.fin_budgets (organization_id, reference_month desc);
```

Um job noturno recalcula `committed_amount` e `actual_amount`, e dispara notificação
`target_at_risk` quando `actual + committed > planned * alert_threshold_pct / 100`.

---
### 5.16 Catálogo compartilhado — produtos, lotes e fornecedores

Correção estrutural em relação ao sistema atual, que mantém **três catálogos paralelos**: `sac_products`
(produtos reclamados), `fin_purchase_products` (itens de compra) e `mkt_suppliers` (fornecedores só de
marketing). Aqui há **um** catálogo de produtos e **um** de fornecedores, consumidos por SAC, Qualidade,
Financeiro, Marketing e CRM.

Foi uma das decisões confirmadas para o módulo Comercial: sem catálogo único, um pedido de venda, uma
reclamação de consumidor sobre o mesmo item e uma requisição de compra desse item não se conversam.

#### 5.16.1 `products`

```sql
create table public.product_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id       uuid,
  name            text not null check (char_length(name) between 2 and 120),
  code            text,
  position        int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint product_categories_unique unique (organization_id, name, parent_id),
  constraint product_categories_id_org_key unique (id, organization_id),
  constraint product_categories_parent_fk foreign key (parent_id, organization_id)
    references public.product_categories (id, organization_id) on delete cascade
);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  sku               text not null check (char_length(sku) between 1 and 60),
  ean               text check (ean is null or ean ~ '^\d{8}$|^\d{12,14}$'),
  name              text not null check (char_length(btrim(name)) between 2 and 200),
  short_name        text,
  description       text,
  category_id       uuid,
  brand             text,
  -- unidades e embalagem
  unit              text not null default 'un',
  units_per_pack    numeric(12,4) not null default 1 check (units_per_pack > 0),
  net_weight_g      numeric(12,3),
  gross_weight_g    numeric(12,3),
  shelf_life_days   int check (shelf_life_days is null or shelf_life_days > 0),
  -- fiscal
  ncm               text,
  cest              text,
  origin_code       text,
  -- comercial
  list_price        numeric(14,4) check (list_price is null or list_price >= 0),
  cost_price        numeric(14,4) check (cost_price is null or cost_price >= 0),
  min_price         numeric(14,4),            -- piso para desconto do vendedor
  is_sellable       boolean not null default true,
  is_purchasable    boolean not null default false,
  -- qualidade / SAC
  is_sac_visible    boolean not null default true,   -- aparece na lista do portal do consumidor
  quality_notes     text,
  -- mídia e busca
  image_file_id     uuid references public.files(id) on delete set null,
  attributes        jsonb not null default '{}'::jsonb,
  embedding         vector(1536),
  search_vector     tsvector generated always as (
                      to_tsvector('public.pt_unaccent',
                        coalesce(sku,'') || ' ' || coalesce(name,'') || ' ' ||
                        coalesce(brand,'') || ' ' || coalesce(description,''))
                    ) stored,
  is_active         boolean not null default true,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint products_sku_unique unique (organization_id, sku),
  constraint products_ean_unique unique (organization_id, ean),
  constraint products_id_org_key unique (id, organization_id),
  constraint products_category_fk foreign key (category_id, organization_id)
    references public.product_categories (id, organization_id) on delete set null,
  constraint products_price_ck check (min_price is null or list_price is null or min_price <= list_price)
);

create index products_org_active_idx on public.products (organization_id, is_active, name)
  where deleted_at is null;
create index products_category_idx   on public.products (organization_id, category_id)
  where deleted_at is null;
create index products_sellable_idx   on public.products (organization_id) where is_sellable and is_active;
create index products_search_gin     on public.products using gin (search_vector);
create index products_embedding_idx  on public.products using hnsw (embedding vector_cosine_ops);
```

#### 5.16.2 `product_batches` — lotes

Essencial para o SAC de indústria alimentícia: uma reclamação aponta um lote, e o lote conecta a
reclamação ao processo produtivo.

```sql
create table public.product_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null,
  batch_code      text not null check (char_length(batch_code) between 1 and 60),
  manufactured_on date,
  expires_on      date,
  quantity        numeric(14,4),
  production_line text,
  shift           text,
  notes           text,
  is_recalled     boolean not null default false,
  recalled_at     timestamptz,
  recall_reason   text,
  created_at      timestamptz not null default now(),

  constraint product_batches_unique unique (organization_id, product_id, batch_code),
  constraint product_batches_id_org_key unique (id, organization_id),
  constraint product_batches_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  constraint product_batches_dates_ck check (
    expires_on is null or manufactured_on is null or expires_on >= manufactured_on
  )
);

create index product_batches_product_idx on public.product_batches (organization_id, product_id, expires_on desc);
create index product_batches_code_idx    on public.product_batches (organization_id, batch_code);
create index product_batches_recall_idx  on public.product_batches (organization_id) where is_recalled;
```

> `is_recalled` permite a consulta mais importante do módulo de Qualidade: "quais reclamações estão ligadas
> a lotes recolhidos?" — e alimenta um alerta automático quando um lote acumula N reclamações no período.

#### 5.16.3 `suppliers` — fornecedores unificados

```sql
create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 200),
  legal_name      text,
  cnpj            text check (cnpj is null or cnpj ~ '^\d{11}$|^\d{14}$'),
  category        public.supplier_category not null default 'other',
  departments     public.department[] not null default '{}',   -- quais módulos usam este fornecedor
  status          public.partner_status not null default 'active',
  -- contato
  email           citext,
  phone           text,
  website         text,
  contact_name    text,
  address         jsonb not null default '{}'::jsonb,
  -- comercial
  payment_terms   text,
  rating          numeric(3,2) check (rating is null or rating between 0 and 5),
  rating_count    int not null default 0,
  services        text[] not null default '{}',
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint suppliers_cnpj_unique unique (organization_id, cnpj),
  constraint suppliers_id_org_key  unique (id, organization_id)
);

create index suppliers_org_status_idx on public.suppliers (organization_id, status)
  where deleted_at is null;
create index suppliers_category_idx   on public.suppliers (organization_id, category)
  where deleted_at is null;
create index suppliers_dept_gin       on public.suppliers using gin (departments);
```

FKs pendentes de §5.15 e §5.17 são adicionadas aqui:

```sql
alter table public.fin_entries
  add constraint fin_entries_supplier_fk foreign key (supplier_id, organization_id)
  references public.suppliers (id, organization_id) on delete set null;

alter table public.fin_purchase_quotes
  add constraint fpq_supplier_fk foreign key (supplier_id, organization_id)
  references public.suppliers (id, organization_id) on delete set null;

alter table public.fin_purchase_items
  add constraint fpi_product_fk foreign key (product_id, organization_id)
  references public.products (id, organization_id) on delete set null;
```

### 5.17 Marketing

#### 5.17.1 Talentos (influenciadores e artistas)

O sistema atual tem `mkt_influencers` **e** `mkt_artists` com estruturas quase idênticas. Aqui é uma tabela
com `category`.

```sql
create table public.mkt_talents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 2 and 160),
  stage_name        text,
  category          public.talent_category not null default 'influencer',
  status            public.partner_status not null default 'prospect',
  document          text,                     -- CPF/CNPJ
  email             citext,
  phone             text,
  city              text,
  state             char(2),
  -- redes sociais e métricas
  social_handles    jsonb not null default '{}'::jsonb,  -- {"instagram":"@x","tiktok":"@y"}
  followers_total   int not null default 0 check (followers_total >= 0),
  engagement_rate   numeric(7,4) check (engagement_rate is null or engagement_rate between 0 and 1),
  audience_profile  jsonb not null default '{}'::jsonb,
  -- comercial
  fee_range_min     numeric(14,2),
  fee_range_max     numeric(14,2),
  tags              text[] not null default '{}',
  notes             text,
  manager_name      text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint mkt_talents_id_org_key unique (id, organization_id),
  constraint mkt_talents_fee_ck check (
    fee_range_max is null or fee_range_min is null or fee_range_max >= fee_range_min
  )
);

create index mkt_talents_org_status_idx on public.mkt_talents (organization_id, status, category)
  where deleted_at is null;
create index mkt_talents_tags_gin on public.mkt_talents using gin (tags);
```

```sql
create table public.mkt_talent_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  talent_id       uuid not null,
  contract_id     uuid,                       -- vínculo com o módulo de contratos (§5.12.4)
  title           text not null,
  starts_on       date not null,
  ends_on         date,
  total_value     numeric(14,2) not null default 0 check (total_value >= 0),
  payment_frequency public.payment_frequency not null default 'monthly',
  exclusivity     boolean not null default false,
  status          public.contract_status not null default 'active',
  terms           text,
  file_id         uuid references public.files(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint mtc_talent_fk foreign key (talent_id, organization_id)
    references public.mkt_talents (id, organization_id) on delete cascade,
  constraint mtc_contract_fk foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete set null,
  constraint mtc_id_org_key unique (id, organization_id)
);

create table public.mkt_talent_deliverables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  talent_contract_id uuid not null,
  description     text not null,
  platform        public.social_platform,
  post_type       public.social_post_type,
  quantity        int not null default 1 check (quantity > 0),
  frequency       public.deliverable_frequency not null default 'monthly',
  unit_value      numeric(14,2),

  constraint mtd_contract_fk foreign key (talent_contract_id, organization_id)
    references public.mkt_talent_contracts (id, organization_id) on delete cascade,
  constraint mtd_id_org_key unique (id, organization_id)
);

create table public.mkt_talent_deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deliverable_id  uuid not null,
  social_post_id  uuid,
  delivered_on    date not null default current_date,
  proof_url       text,
  metrics         jsonb not null default '{}'::jsonb,   -- {reach, likes, comments, saves}
  is_approved     boolean not null default false,
  approved_by     uuid references public.users(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),

  constraint mtdel_deliverable_fk foreign key (deliverable_id, organization_id)
    references public.mkt_talent_deliverables (id, organization_id) on delete cascade
);

create index mtdel_deliverable_idx on public.mkt_talent_deliveries (organization_id, deliverable_id, delivered_on desc);
```

#### 5.17.2 Eventos

```sql
create table public.mkt_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 200),
  type            public.mkt_event_type not null default 'other',
  status          public.mkt_event_status not null default 'planning',
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  is_online       boolean not null default false,
  venue_name      text,
  address         jsonb not null default '{}'::jsonb,
  expected_audience int,
  actual_audience   int,
  budget          numeric(14,2) not null default 0 check (budget >= 0),
  actual_cost     numeric(14,2) not null default 0 check (actual_cost >= 0),
  responsible_id  uuid references public.users(id) on delete set null,
  cover_file_id   uuid references public.files(id) on delete set null,
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint mkt_events_id_org_key unique (id, organization_id),
  constraint mkt_events_dates_ck check (ends_at is null or ends_at >= starts_at)
);

create index mkt_events_org_period_idx on public.mkt_events (organization_id, starts_at desc)
  where deleted_at is null;
create index mkt_events_status_idx     on public.mkt_events (organization_id, status)
  where deleted_at is null;

create table public.mkt_event_participants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id        uuid not null,
  talent_id       uuid,
  supplier_id     uuid,
  crm_account_id  uuid,
  name            text not null,
  role            public.event_participant_role not null default 'guest',
  status          public.event_participant_status not null default 'invited',
  fee             numeric(14,2) check (fee is null or fee >= 0),
  notes           text,
  created_at      timestamptz not null default now(),

  constraint mep_event_fk foreign key (event_id, organization_id)
    references public.mkt_events (id, organization_id) on delete cascade,
  constraint mep_talent_fk foreign key (talent_id, organization_id)
    references public.mkt_talents (id, organization_id) on delete set null,
  constraint mep_supplier_fk foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id) on delete set null
);

create index mep_event_idx on public.mkt_event_participants (organization_id, event_id);
```

#### 5.17.3 Redes sociais

```sql
create table public.mkt_social_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform        public.social_platform not null,
  handle          text not null,
  display_name    text,
  external_id     text,                       -- id da conta na plataforma
  avatar_url      text,
  followers_count int not null default 0,
  is_active       boolean not null default true,
  connected_by    uuid references public.users(id) on delete set null,
  connected_at    timestamptz,
  token_expires_at timestamptz,
  last_sync_at    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint msa_unique unique (organization_id, platform, handle),
  constraint msa_id_org_key unique (id, organization_id)
);

-- Tokens OAuth NUNCA ficam na tabela principal. Vão para o Vault (§7.6).
create table public.mkt_social_account_secrets (
  social_account_id uuid primary key,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  vault_secret_id   uuid not null,            -- referência a vault.secrets
  scopes            text[] not null default '{}',
  refreshed_at      timestamptz,

  constraint msas_account_fk foreign key (social_account_id, organization_id)
    references public.mkt_social_accounts (id, organization_id) on delete cascade
);
```

> **RLS de `mkt_social_account_secrets`: nenhuma policy.** A tabela é inacessível a `authenticated`;
> só o `service_role` (Route Handler de publicação) a lê. Mesma disciplina aplicada às credenciais de IA.

```sql
create table public.mkt_social_posts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid,
  event_id        uuid,
  talent_id       uuid,
  campaign_name   text,
  title           text,
  caption         text check (caption is null or char_length(caption) <= 5000),
  hashtags        text[] not null default '{}',
  platform        public.social_platform not null,
  post_type       public.social_post_type not null default 'feed',
  status          public.social_post_status not null default 'draft',
  scheduled_at    timestamptz,
  published_at    timestamptz,
  external_post_id text,
  permalink       text,
  media_file_ids  uuid[] not null default '{}',
  metrics         jsonb not null default '{}'::jsonb,
  approved_by     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  error_message   text,
  retry_count     int not null default 0,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint msp_account_fk foreign key (social_account_id, organization_id)
    references public.mkt_social_accounts (id, organization_id) on delete set null,
  constraint msp_event_fk foreign key (event_id, organization_id)
    references public.mkt_events (id, organization_id) on delete set null,
  constraint msp_id_org_key unique (id, organization_id),
  constraint msp_scheduled_ck check (status <> 'scheduled' or scheduled_at is not null),
  constraint msp_published_ck check ((status = 'published') = (published_at is not null))
);

create index msp_org_schedule_idx on public.mkt_social_posts (organization_id, scheduled_at)
  where status in ('scheduled','approved');
create index msp_org_status_idx   on public.mkt_social_posts (organization_id, status, created_at desc);
create index msp_due_idx          on public.mkt_social_posts (scheduled_at)
  where status = 'scheduled';
```

Publicação: job a cada 5 min seleciona `status='scheduled' and scheduled_at <= now()`, enfileira em
`job_queue` (queue `social`), e o worker chama a API da plataforma. Falha incrementa `retry_count`; a partir
de 3, marca `failed` e notifica.

#### 5.17.4 Cotações, UGC e geração criativa

```sql
create table public.mkt_quotations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id     uuid not null,
  event_id        uuid,
  title           text not null,
  status          public.quotation_status not null default 'draft',
  items           jsonb not null default '[]'::jsonb,
  total_amount    numeric(14,2) not null default 0 check (total_amount >= 0),
  valid_until     date,
  file_id         uuid references public.files(id) on delete set null,
  approved_by     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint mq_supplier_fk foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id) on delete cascade,
  constraint mq_event_fk foreign key (event_id, organization_id)
    references public.mkt_events (id, organization_id) on delete set null
);

create index mq_org_status_idx on public.mkt_quotations (organization_id, status, created_at desc);

create table public.mkt_ugc_content (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  talent_id       uuid,
  title           text,
  media_type      public.ugc_media_type not null,
  source_platform public.social_platform,
  source_url      text,
  author_handle   text,
  file_id         uuid references public.files(id) on delete set null,
  status          public.ugc_status not null default 'pending',
  has_usage_rights boolean not null default false,
  rights_evidence_file_id uuid references public.files(id) on delete set null,
  original_metrics jsonb not null default '{}'::jsonb,
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),

  constraint mugc_talent_fk foreign key (talent_id, organization_id)
    references public.mkt_talents (id, organization_id) on delete set null,
  constraint mugc_rights_ck check (not has_usage_rights or rights_evidence_file_id is not null)
);

create index mugc_org_status_idx on public.mkt_ugc_content (organization_id, status, created_at desc);
```

> `mugc_rights_ck` é jurídico, não técnico: publicar UGC sem prova de autorização é risco de imagem e de
> processo. O banco recusa marcar "temos direito" sem o comprovante anexado.

```sql
create table public.mkt_assets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('banner','logo','template','video','photo','copy','other')),
  file_id         uuid references public.files(id) on delete cascade,
  campaign_name   text,
  event_id        uuid,
  tags            text[] not null default '{}',
  usage_rights_until date,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint ma_event_fk foreign key (event_id, organization_id)
    references public.mkt_events (id, organization_id) on delete set null
);

create index ma_org_kind_idx on public.mkt_assets (organization_id, kind, created_at desc);
create index ma_tags_gin     on public.mkt_assets using gin (tags);
```

### 5.18 Qualidade e SAC (portal do consumidor)

O SAC é a **segunda porta de entrada** do sistema (§1.2): quem abre chamado aqui é o consumidor final da
empresa cliente, não um funcionário. A separação de sessão, permissão e dados é absoluta.

**Mudança em relação ao sistema atual:** o consumidor deixa de ter uma tabela própria (`customer_profiles`)
e passa a ser um **contato de uma conta do CRM** (§5.19), com uma `membership` de `scope = 'portal'`.
Isso é o que permite a ficha 360°: a mesma pessoa que reclamou no SAC aparece na conta do CRM, com histórico
de pedidos e reclamações lado a lado.

#### 5.18.1 `sac_tickets`

```sql
create table public.sac_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number          int not null,
  protocol        text not null,              -- código público mostrado ao consumidor
  -- quem reclamou
  contact_id      uuid,                       -- crm_contacts (§5.19)
  account_id      uuid,                       -- crm_accounts (o cliente/distribuidor, quando aplicável)
  contact_name    text not null,              -- snapshot: o consumidor pode não ter cadastro completo
  contact_email   citext,
  contact_phone   text,
  contact_document text,
  contact_address jsonb not null default '{}'::jsonb,
  -- o caso
  subject         text not null check (char_length(btrim(subject)) between 3 and 250),
  description     text not null check (char_length(description) between 1 and 20000),
  complaint_type  public.sac_complaint_type not null default 'quality',
  severity        public.sac_severity not null default 'medium',
  status          public.sac_ticket_status not null default 'open',
  category_id     uuid,
  -- comercial
  purchase_place  text,
  purchase_date   date,
  invoice_number  text,
  invoice_file_id uuid references public.files(id) on delete set null,
  -- tratativa
  assigned_to     uuid references public.users(id) on delete set null,
  internal_ticket_id uuid,                    -- chamado interno gerado para investigação
  resolution_type public.sac_resolution_type,
  resolution_notes text,
  needs_collection boolean not null default false,   -- precisa recolher a amostra
  collected_at    timestamptz,
  first_response_at timestamptz,
  sla_due_at      timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  -- satisfação
  satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  satisfaction_comment text,
  -- IA e busca
  ai_summary      text,
  ai_classification jsonb not null default '{}'::jsonb,
  embedding       vector(1536),
  search_vector   tsvector generated always as (
                    to_tsvector('public.pt_unaccent',
                      coalesce(subject,'') || ' ' || coalesce(description,'') || ' ' ||
                      coalesce(contact_name,''))
                  ) stored,
  source          public.ticket_source not null default 'portal',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint sac_tickets_number_unique   unique (organization_id, number),
  constraint sac_tickets_protocol_unique unique (organization_id, protocol),
  constraint sac_tickets_id_org_key      unique (id, organization_id),
  constraint sac_tickets_internal_fk foreign key (internal_ticket_id, organization_id)
    references public.tickets (id, organization_id) on delete set null,
  constraint sac_tickets_resolved_ck check (
    (status in ('resolved','closed')) = (resolved_at is not null)
  ),
  constraint sac_tickets_contact_ck check (contact_email is not null or contact_phone is not null)
);

create index sac_tickets_org_status_idx on public.sac_tickets (organization_id, status, created_at desc);
create index sac_tickets_contact_idx    on public.sac_tickets (organization_id, contact_id)
  where contact_id is not null;
create index sac_tickets_account_idx    on public.sac_tickets (organization_id, account_id)
  where account_id is not null;
create index sac_tickets_email_idx      on public.sac_tickets (organization_id, contact_email);
create index sac_tickets_type_idx       on public.sac_tickets (organization_id, complaint_type, created_at desc);
create index sac_tickets_sla_idx        on public.sac_tickets (organization_id, sla_due_at)
  where status not in ('resolved','closed','cancelled');
create index sac_tickets_search_gin     on public.sac_tickets using gin (search_vector);
```

```sql
create table public.sac_ticket_products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sac_ticket_id   uuid not null,
  product_id      uuid,
  batch_id        uuid,
  product_name    text not null,              -- snapshot (o consumidor pode digitar livre)
  batch_code      text,
  expires_on      date,
  quantity        numeric(12,4) not null default 1,
  problem_description text,
  photo_file_ids  uuid[] not null default '{}',
  position        int not null default 0,

  constraint stp_ticket_fk foreign key (sac_ticket_id, organization_id)
    references public.sac_tickets (id, organization_id) on delete cascade,
  constraint stp_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null,
  constraint stp_batch_fk foreign key (batch_id, organization_id)
    references public.product_batches (id, organization_id) on delete set null
);

create index stp_ticket_idx  on public.sac_ticket_products (sac_ticket_id);
create index stp_product_idx on public.sac_ticket_products (organization_id, product_id);
create index stp_batch_idx   on public.sac_ticket_products (organization_id, batch_id)
  where batch_id is not null;
```

> Este é o índice que responde à pergunta mais importante da Qualidade: **"quantas reclamações este lote
> acumulou?"** — cruzando `stp_batch_idx` com `sac_tickets.created_at`. Um job dispara alerta ao ultrapassar
> o limiar configurado por produto.

#### 5.18.2 Categorias, formulário público e OTP

```sql
create table public.sac_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  complaint_type  public.sac_complaint_type,
  default_severity public.sac_severity not null default 'medium',
  sla_hours       int not null default 48 check (sla_hours between 1 and 8760),
  requires_product boolean not null default true,
  requires_invoice boolean not null default false,
  is_active       boolean not null default true,
  position        int not null default 0,

  constraint sac_categories_unique unique (organization_id, name),
  constraint sac_categories_id_org_key unique (id, organization_id)
);

alter table public.sac_tickets
  add constraint sac_tickets_category_fk foreign key (category_id, organization_id)
  references public.sac_categories (id, organization_id) on delete set null;

create table public.sac_form_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id     uuid,
  field_key       text not null check (field_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label           text not null,
  field_type      public.form_field_type not null,
  options         jsonb not null default '[]'::jsonb,
  is_required     boolean not null default false,
  validation      jsonb not null default '{}'::jsonb,
  position        int not null default 0,
  is_active       boolean not null default true,

  constraint sff_unique unique (organization_id, category_id, field_key),
  constraint sff_category_fk foreign key (category_id, organization_id)
    references public.sac_categories (id, organization_id) on delete cascade
);

create table public.sac_otp_codes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           citext not null,
  code_hash       text not null,              -- nunca o código em claro
  purpose         text not null default 'login' check (purpose in ('login','register','verify')),
  attempts        int not null default 0 check (attempts <= 5),
  expires_at      timestamptz not null default now() + interval '10 minutes',
  consumed_at     timestamptz,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index sac_otp_lookup_idx on public.sac_otp_codes (organization_id, email, created_at desc)
  where consumed_at is null;
create index sac_otp_cleanup_idx on public.sac_otp_codes (expires_at);
```

**RLS de `sac_otp_codes`: nenhuma policy.** Toda a operação (gerar, validar, consumir) acontece em Edge
Function com `service_role`. Um cliente jamais lê essa tabela — nem a própria linha.

#### 5.18.3 Laudos técnicos (Qualidade)

```sql
create table public.qa_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number          int not null,
  sac_ticket_id   uuid,
  status          public.qa_report_status not null default 'draft',
  verdict         public.qa_verdict,
  -- análise
  received_on     date,
  analyzed_on     date,
  sample_condition text,
  analysis_method text,
  findings        text,
  root_cause      text,
  corrective_action text,
  preventive_action text,
  recommendation  text,
  -- responsáveis
  analyst_id      uuid references public.users(id) on delete set null,
  approver_id     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  -- saída
  report_file_id  uuid references public.files(id) on delete set null,
  sent_to_customer_at timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint qa_reports_number_unique unique (organization_id, number),
  constraint qa_reports_id_org_key    unique (id, organization_id),
  constraint qa_reports_sac_fk foreign key (sac_ticket_id, organization_id)
    references public.sac_tickets (id, organization_id) on delete set null,
  constraint qa_reports_verdict_ck check (
    status not in ('concluded','approved') or verdict is not null
  ),
  constraint qa_reports_approved_ck check ((status = 'approved') = (approved_at is not null))
);

create index qa_reports_org_status_idx on public.qa_reports (organization_id, status, created_at desc);
create index qa_reports_sac_idx        on public.qa_reports (organization_id, sac_ticket_id);

create table public.qa_report_products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id       uuid not null,
  product_id      uuid,
  batch_id        uuid,
  product_name    text not null,
  batch_code      text,
  analysis_result jsonb not null default '{}'::jsonb,
  verdict         public.qa_verdict,
  photo_file_ids  uuid[] not null default '{}',
  notes           text,

  constraint qarp_report_fk foreign key (report_id, organization_id)
    references public.qa_reports (id, organization_id) on delete cascade,
  constraint qarp_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null,
  constraint qarp_batch_fk foreign key (batch_id, organization_id)
    references public.product_batches (id, organization_id) on delete set null
);
```

**Regra:** um `sac_ticket` com `complaint_type in ('quality','foreign_body','expiration')` **não fecha**
sem laudo `approved` — trigger equivalente ao de checklist (§5.11.5). Comportamento já existente hoje.

#### 5.18.4 RLS do portal (perfil P4)

O consumidor tem `membership.scope = 'portal'`. As policies do SAC são as mais delicadas do sistema:

```sql
create policy sac_tickets_select on public.sac_tickets for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.is_staff(organization_id)             -- staff vê conforme perfil de acesso
      or contact_id = public.current_portal_contact_id(organization_id)  -- consumidor vê só o seu
    )
  );

create policy sac_tickets_insert on public.sac_tickets for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (public.is_staff(organization_id)
         or contact_id = public.current_portal_contact_id(organization_id))
  );

create policy sac_tickets_update on public.sac_tickets for update to authenticated
  using (public.is_staff(organization_id) and public.can_view_department(organization_id, 'qualidade'))
  with check (public.is_org_member(organization_id));
```

O consumidor **não atualiza** o chamado diretamente — ele responde via `comments` (`author_kind =
'customer'`, `visibility = 'public'`), e um trigger reabre o status para `in_progress`. Comentário com
`visibility = 'internal'` é invisível para ele por força da policy de §5.10.3.

Abertura **anônima** (sem login), que o produto oferece hoje, não passa por RLS: é uma Edge Function com
`service_role`, protegida por rate limit por IP + e-mail, CAPTCHA e validação de formato (§7.4).

---
### 5.19 Comercial — CRM, distribuidores e prospecção

Módulo **novo**, e o maior deles. Cobre quatro frentes, conforme definido: **funil de vendas**, **rede de
distribuidores**, **pedidos/metas/comissões** e **visitas com roteirização em campo** — mais a
**prospecção de leads por IA**.

**Quatro integrações obrigatórias**, que são a razão de o CRM viver dentro do Helpoint e não em uma
ferramenta separada:

| Integração | Como funciona |
|---|---|
| **Cliente unificado com o SAC** | `crm_accounts` + `crm_contacts` são a **única** identidade de cliente do sistema. Um `sac_ticket` referencia o mesmo contato. A ficha da conta mostra pedidos e reclamações na mesma linha do tempo |
| **Faturamento no Financeiro** | Um `crm_order` aprovado gera `fin_entries` do tipo `receivable` (uma por parcela), alimentando fluxo de caixa e indicadores existentes |
| **Catálogo único de produtos** | `crm_order_items` e `crm_price_list_items` referenciam `products` (§5.16) — os mesmos produtos que o SAC recebe reclamação e que o Financeiro compra |
| **Prospecção com a IA da organização** | Usa a credencial BYOK já configurada (§5.20). O custo do token é do tenant, e a chave nunca sai do servidor |

#### 5.19.1 Territórios e contas

```sql
create table public.crm_territories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id       uuid,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  code            text,
  -- definição geográfica (qualquer combinação; vazio = sem restrição naquele nível)
  states          char(2)[] not null default '{}',
  cities          text[]    not null default '{}',
  zip_ranges      jsonb     not null default '[]'::jsonb,   -- [{from:'30000000', to:'31999999'}]
  is_exclusive    boolean not null default false,
  manager_id      uuid references public.users(id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_territories_unique unique (organization_id, name),
  constraint crm_territories_id_org_key unique (id, organization_id),
  constraint crm_territories_parent_fk foreign key (parent_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null
);

create index crm_territories_org_idx    on public.crm_territories (organization_id) where is_active;
create index crm_territories_states_gin on public.crm_territories using gin (states);
create index crm_territories_cities_gin on public.crm_territories using gin (cities);
```

> `is_exclusive` é a regra comercial mais sensível de uma rede de distribuição: um território exclusivo não
> aceita dois distribuidores. Validado na aplicação (a sobreposição geográfica é cara de expressar em CHECK)
> e verificado por um job diário que aponta conflitos existentes.

```sql
create table public.crm_accounts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  code              text,
  type              public.crm_account_type not null default 'prospect',
  status            public.crm_account_status not null default 'active',
  -- identificação
  legal_name        text not null check (char_length(btrim(legal_name)) between 2 and 200),
  trade_name        text,
  document          text check (document is null or document ~ '^\d{11}$|^\d{14}$'),  -- CPF ou CNPJ
  state_registration text,
  -- classificação comercial
  segment           text,
  sub_segment       text,
  size_tier         text check (size_tier is null or size_tier in ('micro','small','medium','large','key')),
  channel           public.crm_order_channel,
  -- rede
  territory_id      uuid,
  distributor_id    uuid,                     -- conta do distribuidor que atende este cliente
  owner_id          uuid references public.users(id) on delete set null,   -- vendedor responsável
  price_list_id     uuid,
  payment_terms     text,
  credit_limit      numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  -- contato e localização
  email             citext,
  phone             text,
  website           text,
  address           jsonb not null default '{}'::jsonb,
  latitude          numeric(10,7) check (latitude  is null or latitude  between -90  and 90),
  longitude         numeric(10,7) check (longitude is null or longitude between -180 and 180),
  -- origem
  source            public.crm_lead_source,
  source_detail     text,
  converted_from_lead_id uuid,
  -- métricas desnormalizadas (listagem e ranking)
  last_order_at     timestamptz,
  last_visit_at     timestamptz,
  last_contact_at   timestamptz,
  orders_count      int not null default 0,
  revenue_12m       numeric(14,2) not null default 0,
  open_sac_count    int not null default 0,
  -- extras
  tags              text[] not null default '{}',
  notes             text,
  custom_fields     jsonb not null default '{}'::jsonb,
  search_vector     tsvector generated always as (
                      to_tsvector('public.pt_unaccent',
                        coalesce(legal_name,'') || ' ' || coalesce(trade_name,'') || ' ' ||
                        coalesce(document,'') || ' ' || coalesce(segment,''))
                    ) stored,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint crm_accounts_doc_unique  unique (organization_id, document),
  constraint crm_accounts_code_unique unique (organization_id, code),
  constraint crm_accounts_id_org_key  unique (id, organization_id),
  constraint crm_accounts_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null,
  constraint crm_accounts_distributor_fk foreign key (distributor_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null,
  constraint crm_accounts_no_self_dist check (distributor_id is null or distributor_id <> id)
);

create index crm_accounts_org_type_idx    on public.crm_accounts (organization_id, type, status)
  where deleted_at is null;
create index crm_accounts_owner_idx       on public.crm_accounts (organization_id, owner_id)
  where deleted_at is null;
create index crm_accounts_territory_idx   on public.crm_accounts (organization_id, territory_id)
  where deleted_at is null;
create index crm_accounts_distributor_idx on public.crm_accounts (organization_id, distributor_id)
  where distributor_id is not null and deleted_at is null;
create index crm_accounts_inactive_idx    on public.crm_accounts (organization_id, last_order_at)
  where type = 'customer' and deleted_at is null;
create index crm_accounts_geo_idx         on public.crm_accounts (organization_id, latitude, longitude)
  where latitude is not null;
create index crm_accounts_tags_gin        on public.crm_accounts using gin (tags);
create index crm_accounts_search_gin      on public.crm_accounts using gin (search_vector);
```

> `crm_accounts_inactive_idx` responde à consulta comercial mais valiosa: **"quais clientes pararam de
> comprar?"** — base do fluxo de recuperação (churn), que vira automação no §5.21.

```sql
create table public.crm_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id      uuid,                       -- null = consumidor final avulso (SAC sem empresa)
  membership_id   uuid,                       -- quando o contato tem acesso a algum portal
  full_name       text not null check (char_length(btrim(full_name)) between 2 and 150),
  email           citext,
  phone           text,
  whatsapp        text,
  document        text,
  job_title       text,
  department_name text,
  is_primary      boolean not null default false,
  is_decision_maker boolean not null default false,
  birth_date      date,
  address         jsonb not null default '{}'::jsonb,
  -- consentimento (LGPD)
  opted_in_at     timestamptz,
  opted_out_at    timestamptz,
  consent_source  text,
  notes           text,
  tags            text[] not null default '{}',
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint crm_contacts_id_org_key unique (id, organization_id),
  constraint crm_contacts_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint crm_contacts_membership_fk foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete set null,
  constraint crm_contacts_reach_ck check (email is not null or phone is not null)
);

create unique index crm_contacts_email_idx on public.crm_contacts (organization_id, email)
  where email is not null and deleted_at is null;
create unique index crm_contacts_primary_idx on public.crm_contacts (account_id)
  where is_primary and deleted_at is null;
create index crm_contacts_account_idx    on public.crm_contacts (organization_id, account_id)
  where deleted_at is null;
create index crm_contacts_membership_idx on public.crm_contacts (membership_id)
  where membership_id is not null;
```

**Unificação com o SAC** — as FKs que fecham o ciclo:

```sql
alter table public.sac_tickets
  add constraint sac_tickets_contact_fk foreign key (contact_id, organization_id)
    references public.crm_contacts (id, organization_id) on delete set null,
  add constraint sac_tickets_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null;

alter table public.memberships
  add constraint memberships_crm_account_fk foreign key (crm_account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null;

alter table public.fin_entries
  add constraint fin_entries_crm_account_fk foreign key (crm_account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null;

alter table public.mkt_event_participants
  add constraint mep_crm_account_fk foreign key (crm_account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null;

-- Contato do portal SAC da sessão corrente (usado nas policies P4)
create or replace function public.current_portal_contact_id(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.crm_contacts c
  join public.memberships m on m.id = c.membership_id
  where c.organization_id = p_org
    and m.user_id = public.current_user_id()
    and m.scope = 'portal' and m.status = 'active'
  limit 1;
$$;
```

Um job noturno mantém `crm_accounts.open_sac_count` e `revenue_12m` — desnormalização deliberada porque a
lista de contas exibe os dois e um agregado por linha seria proibitivo.

#### 5.19.2 Distribuidores

Um distribuidor **é uma conta** (`crm_accounts.type = 'distributor'`) com uma extensão de perfil. Essa
escolha evita duplicar endereço, contatos, pedidos e histórico em uma segunda entidade.

```sql
create table public.crm_distributor_profiles (
  account_id           uuid primary key,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  code                 text not null,
  contract_id          uuid,
  price_list_id        uuid,
  commission_rate      numeric(7,4) not null default 0 check (commission_rate between 0 and 1),
  min_order_amount     numeric(14,2) not null default 0 check (min_order_amount >= 0),
  credit_limit         numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  is_exclusive         boolean not null default false,
  portal_enabled       boolean not null default false,   -- acesso ao painel do parceiro
  can_see_end_customers boolean not null default true,
  starts_on            date not null default current_date,
  ends_on              date,
  performance_score    numeric(5,2),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint cdp_code_unique unique (organization_id, code),
  constraint cdp_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint cdp_contract_fk foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete set null,
  constraint cdp_id_org_key unique (account_id, organization_id)
);

create table public.crm_distributor_territories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  distributor_id  uuid not null,
  territory_id    uuid not null,
  is_exclusive    boolean not null default false,
  starts_on       date not null default current_date,
  ends_on         date,
  created_at      timestamptz not null default now(),

  constraint cdt_unique unique (distributor_id, territory_id),
  constraint cdt_distributor_fk foreign key (distributor_id, organization_id)
    references public.crm_distributor_profiles (account_id, organization_id) on delete cascade,
  constraint cdt_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete cascade
);

create unique index cdt_exclusive_idx on public.crm_distributor_territories (territory_id)
  where is_exclusive and ends_on is null;
```

> O índice único parcial `cdt_exclusive_idx` **impõe no banco** a exclusividade de território: dois
> distribuidores exclusivos na mesma região tornam-se estruturalmente impossíveis.

**Acesso do distribuidor ao painel** (`membership.scope = 'partner'`): vê apenas contas cujo
`distributor_id` é a própria conta, seus pedidos, suas metas e suas visitas. Isso é expresso em uma função
usada por todas as policies do módulo:

```sql
create or replace function public.current_partner_account_id(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.crm_account_id from public.memberships m
   where m.organization_id = p_org and m.user_id = public.current_user_id()
     and m.scope = 'partner' and m.status = 'active'
   limit 1;
$$;

create policy crm_accounts_select on public.crm_accounts for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_min_role(organization_id, 'manager')
      or owner_id = public.current_user_id()
      or (public.can_view_department(organization_id, 'comercial')
          and public.account_in_user_territory(organization_id, territory_id))
      or distributor_id = public.current_partner_account_id(organization_id)
      or id            = public.current_partner_account_id(organization_id)
    )
  );
```

`account_in_user_territory()` lê `access_profiles.restrictions.territories` — é o mecanismo que faz o
vendedor do Sudeste não enxergar a carteira do Nordeste.

#### 5.19.3 Tabelas de preço

```sql
create table public.crm_price_lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 120),
  scope           public.crm_price_list_scope not null default 'general',
  channel         public.crm_order_channel,
  territory_id    uuid,
  currency        char(3) not null default 'BRL',
  starts_on       date not null default current_date,
  ends_on         date,
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_price_lists_unique unique (organization_id, name),
  constraint crm_price_lists_id_org_key unique (id, organization_id),
  constraint crm_price_lists_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null,
  constraint crm_price_lists_dates_ck check (ends_on is null or ends_on >= starts_on)
);

create unique index crm_price_lists_one_default_idx
  on public.crm_price_lists (organization_id) where is_default and is_active;

create table public.crm_price_list_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id   uuid not null,
  product_id      uuid not null,
  unit_price      numeric(14,4) not null check (unit_price >= 0),
  min_quantity    numeric(14,4) not null default 1 check (min_quantity > 0),
  max_discount_pct numeric(5,2) not null default 0 check (max_discount_pct between 0 and 100),
  is_active       boolean not null default true,

  constraint cpli_unique unique (price_list_id, product_id, min_quantity),
  constraint cpli_list_fk foreign key (price_list_id, organization_id)
    references public.crm_price_lists (id, organization_id) on delete cascade,
  constraint cpli_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade
);

create index cpli_list_idx    on public.crm_price_list_items (price_list_id, product_id);
create index cpli_product_idx on public.crm_price_list_items (organization_id, product_id);

alter table public.crm_accounts
  add constraint crm_accounts_price_list_fk foreign key (price_list_id, organization_id)
  references public.crm_price_lists (id, organization_id) on delete set null;
alter table public.crm_distributor_profiles
  add constraint cdp_price_list_fk foreign key (price_list_id, organization_id)
  references public.crm_price_lists (id, organization_id) on delete set null;
```

**Resolução de preço** (regra de negócio em `modules/crm/domain/pricing.ts`, na ordem):
tabela da conta → tabela do distribuidor → tabela do território/canal → tabela padrão → `products.list_price`.
Faixa de quantidade escolhe o item com maior `min_quantity` ≤ quantidade pedida.

#### 5.19.4 Funil de vendas

```sql
create table public.crm_pipelines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 120),
  description     text,
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),

  constraint crm_pipelines_unique unique (organization_id, name),
  constraint crm_pipelines_id_org_key unique (id, organization_id)
);
create unique index crm_pipelines_one_default_idx
  on public.crm_pipelines (organization_id) where is_default and is_active;

create table public.crm_pipeline_stages (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  pipeline_id       uuid not null,
  name              text not null check (char_length(name) between 1 and 80),
  probability       numeric(5,2) not null default 0 check (probability between 0 and 100),
  color             text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  is_won            boolean not null default false,
  is_lost           boolean not null default false,
  max_days_in_stage int check (max_days_in_stage is null or max_days_in_stage > 0),
  required_fields   text[] not null default '{}',   -- campos exigidos para sair do estágio
  position          int not null default 0,

  constraint cps_unique unique (pipeline_id, name),
  constraint cps_pipeline_fk foreign key (pipeline_id, organization_id)
    references public.crm_pipelines (id, organization_id) on delete cascade,
  constraint cps_id_org_key unique (id, organization_id),
  constraint cps_outcome_ck check (not (is_won and is_lost))
);

create index cps_pipeline_idx on public.crm_pipeline_stages (pipeline_id, position);

create table public.crm_loss_reasons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  category        text check (category in ('price','product','competitor','timing','budget','no_contact','other')),
  is_active       boolean not null default true,
  position        int not null default 0,

  constraint crm_loss_reasons_unique unique (organization_id, name),
  constraint crm_loss_reasons_id_org_key unique (id, organization_id)
);
```

```sql
create table public.crm_opportunities (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  number            int not null,
  account_id        uuid not null,
  contact_id        uuid,
  pipeline_id       uuid not null,
  stage_id          uuid not null,
  title             text not null check (char_length(btrim(title)) between 3 and 200),
  description       text,
  status            public.crm_opportunity_status not null default 'open',
  owner_id          uuid references public.users(id) on delete set null,
  -- valores
  amount            numeric(14,2) not null default 0 check (amount >= 0),
  currency          char(3) not null default 'BRL',
  probability       numeric(5,2) not null default 0 check (probability between 0 and 100),
  weighted_amount   numeric(14,2) generated always as (round(amount * probability / 100.0, 2)) stored,
  recurring_months  int check (recurring_months is null or recurring_months > 0),
  -- previsão
  expected_close_on date,
  closed_at         timestamptz,
  won_order_id      uuid,
  loss_reason_id    uuid,
  loss_notes        text,
  competitor_name   text,
  -- rastreio de estágio
  stage_entered_at  timestamptz not null default now(),
  source            public.crm_lead_source,
  converted_from_lead_id uuid,
  tags              text[] not null default '{}',
  custom_fields     jsonb not null default '{}'::jsonb,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint crm_opp_number_unique unique (organization_id, number),
  constraint crm_opp_id_org_key    unique (id, organization_id),
  constraint crm_opp_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint crm_opp_contact_fk foreign key (contact_id, organization_id)
    references public.crm_contacts (id, organization_id) on delete set null,
  constraint crm_opp_pipeline_fk foreign key (pipeline_id, organization_id)
    references public.crm_pipelines (id, organization_id) on delete restrict,
  constraint crm_opp_stage_fk foreign key (stage_id, organization_id)
    references public.crm_pipeline_stages (id, organization_id) on delete restrict,
  constraint crm_opp_loss_fk foreign key (loss_reason_id, organization_id)
    references public.crm_loss_reasons (id, organization_id) on delete set null,
  constraint crm_opp_closed_ck check ((status in ('won','lost','abandoned')) = (closed_at is not null)),
  constraint crm_opp_loss_reason_ck check (status <> 'lost' or loss_reason_id is not null)
);

create index crm_opp_org_status_idx  on public.crm_opportunities (organization_id, status, expected_close_on)
  where deleted_at is null;
create index crm_opp_stage_idx       on public.crm_opportunities (organization_id, stage_id, updated_at desc)
  where status = 'open' and deleted_at is null;
create index crm_opp_owner_idx       on public.crm_opportunities (organization_id, owner_id, status)
  where deleted_at is null;
create index crm_opp_account_idx     on public.crm_opportunities (organization_id, account_id);
create index crm_opp_stale_idx       on public.crm_opportunities (organization_id, stage_entered_at)
  where status = 'open' and deleted_at is null;

create table public.crm_opportunity_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id  uuid not null,
  product_id      uuid,
  description     text not null,
  quantity        numeric(14,4) not null default 1 check (quantity > 0),
  unit_price      numeric(14,4) not null default 0 check (unit_price >= 0),
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  total           numeric(14,2) generated always as
                    (round(quantity * unit_price * (1 - discount_pct/100.0), 2)) stored,
  position        int not null default 0,

  constraint crm_oi_opp_fk foreign key (opportunity_id, organization_id)
    references public.crm_opportunities (id, organization_id) on delete cascade,
  constraint crm_oi_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null
);

create index crm_oi_opp_idx on public.crm_opportunity_items (opportunity_id, position);
```

**Histórico de estágio** — necessário para medir tempo de ciclo e taxa de conversão por etapa:

```sql
create table public.crm_opportunity_stage_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id  uuid not null,
  from_stage_id   uuid,
  to_stage_id     uuid not null,
  days_in_stage   numeric(8,2),
  changed_by      uuid references public.users(id) on delete set null,
  changed_at      timestamptz not null default now(),

  constraint cosh_opp_fk foreign key (opportunity_id, organization_id)
    references public.crm_opportunities (id, organization_id) on delete cascade
);

create index cosh_opp_idx  on public.crm_opportunity_stage_history (opportunity_id, changed_at);
create index cosh_org_idx  on public.crm_opportunity_stage_history (organization_id, to_stage_id, changed_at desc);
```

Gravado por trigger na mudança de `stage_id`, que também atualiza `stage_entered_at` e copia
`probability` do novo estágio (a menos que tenha sido sobrescrita manualmente).

#### 5.19.5 Atividades comerciais

```sql
create table public.crm_activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            public.crm_activity_type not null,
  status          public.crm_activity_status not null default 'planned',
  subject         text not null check (char_length(btrim(subject)) between 2 and 200),
  notes           text,
  -- a quem se refere (pelo menos um)
  account_id      uuid,
  contact_id      uuid,
  opportunity_id  uuid,
  -- quando
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes between 1 and 1440),
  owner_id        uuid references public.users(id) on delete set null,
  outcome         text,
  next_step       text,
  next_step_at    timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_act_target_ck check (
    account_id is not null or contact_id is not null or opportunity_id is not null
  ),
  constraint crm_act_done_ck check ((status = 'done') = (completed_at is not null)),
  constraint crm_act_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint crm_act_contact_fk foreign key (contact_id, organization_id)
    references public.crm_contacts (id, organization_id) on delete cascade,
  constraint crm_act_opp_fk foreign key (opportunity_id, organization_id)
    references public.crm_opportunities (id, organization_id) on delete cascade
);

create index crm_act_owner_agenda_idx on public.crm_activities (organization_id, owner_id, scheduled_at)
  where status = 'planned';
create index crm_act_account_idx      on public.crm_activities (organization_id, account_id, created_at desc);
create index crm_act_opp_idx          on public.crm_activities (organization_id, opportunity_id, created_at desc);
```

#### 5.19.6 Pedidos, metas e comissões

```sql
create table public.crm_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  number            int not null,
  code              text,                     -- "PED-2026-00042"
  account_id        uuid not null,
  contact_id        uuid,
  distributor_id    uuid,
  opportunity_id    uuid,
  seller_id         uuid references public.users(id) on delete set null,
  channel           public.crm_order_channel not null default 'direct',
  status            public.crm_order_status not null default 'draft',
  price_list_id     uuid,
  -- valores
  subtotal          numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount   numeric(14,2) not null default 0 check (discount_amount >= 0),
  freight_amount    numeric(14,2) not null default 0 check (freight_amount >= 0),
  tax_amount        numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount      numeric(14,2) not null default 0 check (total_amount >= 0),
  currency          char(3) not null default 'BRL',
  -- pagamento e entrega
  payment_terms     text,
  installments      int not null default 1 check (installments between 1 and 36),
  first_due_on      date,
  delivery_on       date,
  delivery_address  jsonb not null default '{}'::jsonb,
  -- fiscal
  invoice_number    text,
  invoice_key       text,                     -- chave da NF-e
  invoiced_at       timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  notes             text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint crm_orders_number_unique unique (organization_id, number),
  constraint crm_orders_code_unique   unique (organization_id, code),
  constraint crm_orders_id_org_key    unique (id, organization_id),
  constraint crm_orders_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete restrict,
  constraint crm_orders_distributor_fk foreign key (distributor_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null,
  constraint crm_orders_opp_fk foreign key (opportunity_id, organization_id)
    references public.crm_opportunities (id, organization_id) on delete set null,
  constraint crm_orders_total_ck check (
    total_amount = round(subtotal - discount_amount + freight_amount + tax_amount, 2)
  ),
  constraint crm_orders_invoiced_ck check ((status = 'invoiced') <= (invoiced_at is not null))
);

create index crm_orders_org_status_idx on public.crm_orders (organization_id, status, created_at desc);
create index crm_orders_account_idx    on public.crm_orders (organization_id, account_id, created_at desc);
create index crm_orders_seller_idx     on public.crm_orders (organization_id, seller_id, created_at desc);
create index crm_orders_distributor_idx on public.crm_orders (organization_id, distributor_id, created_at desc)
  where distributor_id is not null;
create index crm_orders_period_idx     on public.crm_orders (organization_id, invoiced_at)
  where invoiced_at is not null;

create table public.crm_order_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id        uuid not null,
  product_id      uuid not null,
  product_name    text not null,              -- snapshot
  sku             text not null,              -- snapshot
  quantity        numeric(14,4) not null check (quantity > 0),
  unit            text not null default 'un',
  unit_price      numeric(14,4) not null check (unit_price >= 0),
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  total           numeric(14,2) generated always as
                    (round(quantity * unit_price * (1 - discount_pct/100.0), 2)) stored,
  batch_id        uuid,
  delivered_quantity numeric(14,4) not null default 0,
  position        int not null default 0,

  constraint crm_oit_order_fk foreign key (order_id, organization_id)
    references public.crm_orders (id, organization_id) on delete cascade,
  constraint crm_oit_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete restrict,
  constraint crm_oit_batch_fk foreign key (batch_id, organization_id)
    references public.product_batches (id, organization_id) on delete set null
);

create index crm_oit_order_idx   on public.crm_order_items (order_id, position);
create index crm_oit_product_idx on public.crm_order_items (organization_id, product_id);
```

**Integração com o Financeiro** — na aprovação/faturamento do pedido, uma Server Action cria as parcelas:

```ts
// modules/crm/actions/invoice-order.ts (resumo do efeito)
// 1. valida status, alçada de desconto e limite de crédito da conta
// 2. gera N linhas em fin_entries (kind='receivable', source_type='crm_order', source_id=order.id)
//    com due_date = first_due_on + i meses e amount = total/installments (ajustando centavos na última)
// 3. atualiza crm_accounts.last_order_at, orders_count e revenue_12m
// 4. dispara evento 'order_created' para os workflows (§5.21)
// 5. grava activity_log
```

A operação inteira roda em **uma transação** via RPC `SECURITY DEFINER` — pedido faturado sem contas a
receber (ou o contrário) é um defeito financeiro inaceitável.

```sql
create table public.crm_targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  scope           public.crm_target_scope not null,
  metric          public.crm_target_metric not null,
  -- alvo do escopo (exatamente um preenchido, conforme scope)
  user_id         uuid references public.users(id) on delete cascade,
  distributor_id  uuid,
  territory_id    uuid,
  product_id      uuid,
  product_category_id uuid,
  -- período
  period_start    date not null,
  period_end      date not null,
  target_value    numeric(14,2) not null check (target_value > 0),
  achieved_value  numeric(14,2) not null default 0,
  achievement_pct numeric(7,2) generated always as
                    (case when target_value > 0 then round(achieved_value * 100 / target_value, 2) else 0 end) stored,
  is_active       boolean not null default true,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_targets_id_org_key unique (id, organization_id),
  constraint crm_targets_period_ck check (period_end >= period_start),
  constraint crm_targets_scope_ck check (
    (scope = 'organization'     and user_id is null and distributor_id is null and territory_id is null)
    or (scope = 'user'             and user_id is not null)
    or (scope = 'distributor'      and distributor_id is not null)
    or (scope = 'territory'        and territory_id is not null)
    or (scope = 'product'          and product_id is not null)
    or (scope = 'product_category' and product_category_id is not null)
  ),
  constraint crm_targets_distributor_fk foreign key (distributor_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint crm_targets_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete cascade,
  constraint crm_targets_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade
);

create index crm_targets_org_period_idx on public.crm_targets (organization_id, period_start, period_end)
  where is_active;
create index crm_targets_user_idx       on public.crm_targets (organization_id, user_id)
  where user_id is not null and is_active;
```

`achieved_value` é recalculado por job a cada hora (e sob demanda na tela), a partir de `crm_orders` no
período — não por trigger, porque um pedido cancelado retroativo precisa recalcular tudo.

```sql
create table public.crm_commission_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  applies_to      text not null default 'seller' check (applies_to in ('seller','distributor','manager')),
  -- filtros de aplicação (null = qualquer)
  user_id         uuid references public.users(id) on delete cascade,
  distributor_id  uuid,
  territory_id    uuid,
  product_category_id uuid,
  channel         public.crm_order_channel,
  -- cálculo
  base            text not null default 'net_total'
                    check (base in ('gross_total','net_total','margin','quantity')),
  rate            numeric(7,4) not null check (rate >= 0),
  min_achievement_pct numeric(7,2) not null default 0,   -- só paga se bateu X% da meta
  accelerators    jsonb not null default '[]'::jsonb,    -- [{fromPct:100, rate:0.05}]
  pays_on         text not null default 'invoice'
                    check (pays_on in ('order','invoice','payment')),
  is_active       boolean not null default true,
  priority        int not null default 0,
  starts_on       date not null default current_date,
  ends_on         date,
  created_at      timestamptz not null default now(),

  constraint crm_cr_id_org_key unique (id, organization_id)
);

create index crm_cr_org_idx on public.crm_commission_rules (organization_id, priority desc)
  where is_active;

create table public.crm_commissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id         uuid,
  order_id        uuid,
  order_item_id   uuid,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  beneficiary_account_id uuid,
  reference_month date not null,
  base_amount     numeric(14,2) not null check (base_amount >= 0),
  rate            numeric(7,4) not null,
  amount          numeric(14,2) not null check (amount >= 0),
  status          public.crm_commission_status not null default 'pending',
  calculation     jsonb not null default '{}'::jsonb,   -- memória de cálculo
  approved_by     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  fin_entry_id    uuid,                                  -- lançamento de pagamento gerado
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),

  constraint crm_comm_order_fk foreign key (order_id, organization_id)
    references public.crm_orders (id, organization_id) on delete cascade,
  constraint crm_comm_fin_fk foreign key (fin_entry_id, organization_id)
    references public.fin_entries (id, organization_id) on delete set null,
  constraint crm_comm_beneficiary_ck check (
    beneficiary_user_id is not null or beneficiary_account_id is not null
  )
);

create index crm_comm_month_idx       on public.crm_commissions (organization_id, reference_month, status);
create index crm_comm_beneficiary_idx on public.crm_commissions (organization_id, beneficiary_user_id, reference_month);
create index crm_comm_order_idx       on public.crm_commissions (order_id);
```

Apuração de comissão é **regra de negócio pura** (`modules/crm/domain/commission.ts`), com `calculation`
guardando a memória — mesma disciplina da folha de pagamento (§5.14.5). Aprovada, gera `fin_entries`
do tipo `payable`.

#### 5.19.7 Visitas e roteirização em campo

```sql
create table public.crm_routes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 120),
  owner_id        uuid references public.users(id) on delete set null,
  territory_id    uuid,
  weekday         smallint check (weekday between 0 and 6),   -- rota fixa semanal
  frequency_days  int check (frequency_days is null or frequency_days > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_routes_id_org_key unique (id, organization_id),
  constraint crm_routes_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null
);

create table public.crm_route_stops (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  route_id        uuid not null,
  account_id      uuid not null,
  position        int not null default 0,
  expected_minutes int not null default 30 check (expected_minutes > 0),
  notes           text,

  constraint crs_unique unique (route_id, account_id),
  constraint crs_route_fk foreign key (route_id, organization_id)
    references public.crm_routes (id, organization_id) on delete cascade,
  constraint crs_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade
);

create index crs_route_idx on public.crm_route_stops (route_id, position);
```

```sql
create table public.crm_visits (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id      uuid not null,
  contact_id      uuid,
  route_id        uuid,
  visitor_id      uuid not null references public.users(id) on delete restrict,
  status          public.crm_visit_status not null default 'planned',
  purpose         text,
  scheduled_for   timestamptz,
  -- check-in / check-out com geolocalização
  checked_in_at   timestamptz,
  checkin_latitude  numeric(10,7),
  checkin_longitude numeric(10,7),
  checkin_accuracy_m numeric(8,2),
  checked_out_at  timestamptz,
  checkout_latitude  numeric(10,7),
  checkout_longitude numeric(10,7),
  distance_from_account_m numeric(10,2),      -- calculado no check-in
  is_location_suspect boolean not null default false,
  duration_minutes int generated always as (
                     case when checked_out_at is not null and checked_in_at is not null
                          then ceil(extract(epoch from (checked_out_at - checked_in_at)) / 60)::int
                     end) stored,
  -- resultado
  outcome         text,
  order_id        uuid,                       -- pedido tirado na visita
  opportunity_id  uuid,
  next_visit_on   date,
  notes           text,
  photo_file_ids  uuid[] not null default '{}',
  signature_file_id uuid references public.files(id) on delete set null,
  missed_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint crm_visits_id_org_key unique (id, organization_id),
  constraint crm_visits_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint crm_visits_route_fk foreign key (route_id, organization_id)
    references public.crm_routes (id, organization_id) on delete set null,
  constraint crm_visits_order_fk foreign key (order_id, organization_id)
    references public.crm_orders (id, organization_id) on delete set null,
  constraint crm_visits_checkin_ck check (
    (checked_in_at is null) or (checkin_latitude is not null and checkin_longitude is not null)
  ),
  constraint crm_visits_order_ck check (checked_out_at is null or checked_in_at is not null)
);

create index crm_visits_visitor_day_idx on public.crm_visits (organization_id, visitor_id, scheduled_for);
create index crm_visits_account_idx     on public.crm_visits (organization_id, account_id, checked_in_at desc);
create index crm_visits_status_idx      on public.crm_visits (organization_id, status, scheduled_for);
create index crm_visits_suspect_idx     on public.crm_visits (organization_id, checked_in_at)
  where is_location_suspect;
```

> **`is_location_suspect`** é marcado no check-in quando `distance_from_account_m` excede o raio configurado
> (padrão 300 m). Não bloqueia o vendedor — sinaliza para o gestor. Bloquear geraria falso positivo em
> shopping, galpão e área com GPS ruim; sinalizar dá o dado sem travar a operação.

```sql
-- Pesquisa de ponto de venda: ruptura, share de gôndola, preço praticado, concorrência
create table public.crm_pos_surveys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visit_id        uuid not null,
  account_id      uuid not null,
  product_id      uuid,
  is_available    boolean,                    -- ruptura: false = produto faltando
  facings         int check (facings is null or facings >= 0),
  shelf_share_pct numeric(5,2) check (shelf_share_pct is null or shelf_share_pct between 0 and 100),
  price_observed  numeric(14,4),
  competitor_name text,
  competitor_price numeric(14,4),
  has_pos_material boolean,
  photo_file_ids  uuid[] not null default '{}',
  notes           text,
  created_at      timestamptz not null default now(),

  constraint cps_visit_fk foreign key (visit_id, organization_id)
    references public.crm_visits (id, organization_id) on delete cascade,
  constraint cps_account_fk foreign key (account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete cascade,
  constraint cps_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null
);

create index cps_visit_idx      on public.crm_pos_surveys (visit_id);
create index cps_product_idx    on public.crm_pos_surveys (organization_id, product_id, created_at desc);
create index cps_rupture_idx    on public.crm_pos_surveys (organization_id, created_at desc)
  where is_available = false;
```

`cps_rupture_idx` alimenta o indicador de ruptura por produto/região — um dos dados mais acionáveis para
um distribuidor, e hoje inexistente no sistema.

#### 5.19.8 Leads e prospecção por IA

**Inbound** (formulário, landing page, indicação) e **outbound** (prospecção ativa) convergem para a mesma
tabela `crm_leads`. O diferencial é a origem.

```sql
create table public.crm_leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number          int not null,
  status          public.crm_lead_status not null default 'new',
  source          public.crm_lead_source not null default 'inbound_form',
  source_detail   text,
  -- dados capturados
  company_name    text,
  contact_name    text,
  email           citext,
  phone           text,
  whatsapp        text,
  document        text,
  website         text,
  segment         text,
  city            text,
  state           char(2),
  address         jsonb not null default '{}'::jsonb,
  message         text,
  -- atribuição e qualificação
  owner_id        uuid references public.users(id) on delete set null,
  territory_id    uuid,
  score           smallint check (score between 0 and 100),
  qualification   jsonb not null default '{}'::jsonb,     -- BANT / respostas do formulário
  -- rastreamento de campanha
  utm             jsonb not null default '{}'::jsonb,     -- {source, medium, campaign, term, content}
  referrer_url    text,
  landing_url     text,
  ip_address      inet,
  -- conversão
  converted_at    timestamptz,
  converted_account_id uuid,
  converted_contact_id uuid,
  converted_opportunity_id uuid,
  lost_reason     text,
  -- origem por IA
  prospect_id     uuid,
  first_contacted_at timestamptz,
  last_contacted_at  timestamptz,
  contact_attempts int not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint crm_leads_number_unique unique (organization_id, number),
  constraint crm_leads_id_org_key    unique (id, organization_id),
  constraint crm_leads_reach_ck check (email is not null or phone is not null or whatsapp is not null),
  constraint crm_leads_converted_ck check (
    (status = 'converted') = (converted_at is not null)
  ),
  constraint crm_leads_converted_account_fk foreign key (converted_account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null,
  constraint crm_leads_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null
);

create index crm_leads_org_status_idx on public.crm_leads (organization_id, status, created_at desc)
  where deleted_at is null;
create index crm_leads_owner_idx      on public.crm_leads (organization_id, owner_id, status)
  where deleted_at is null;
create index crm_leads_source_idx     on public.crm_leads (organization_id, source, created_at desc);
create index crm_leads_geo_idx        on public.crm_leads (organization_id, state, city)
  where deleted_at is null;
create unique index crm_leads_email_idx on public.crm_leads (organization_id, email)
  where email is not null and status not in ('converted','lost') and deleted_at is null;
```

##### Prospecção assistida por IA

O agente recebe um **briefing geográfico e setorial** e devolve uma lista de empresas candidatas, que entra
numa **fila de curadoria humana** antes de virar lead. Nenhum registro é criado automaticamente na base
comercial — a IA sugere, a pessoa aprova.

```sql
create table public.crm_prospecting_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 140),
  mode            text not null default 'outbound' check (mode in ('outbound','inbound_enrich')),
  status          public.crm_prospecting_status not null default 'queued',
  -- briefing
  criteria        jsonb not null default '{}'::jsonb,
  target_count    int not null default 25 check (target_count between 1 and 200),
  -- execução
  requested_by    uuid references public.users(id) on delete set null,
  assign_to_id    uuid references public.users(id) on delete set null,
  territory_id    uuid,
  provider        public.ai_provider,
  model           text,
  prompt_version  text,
  started_at      timestamptz,
  finished_at     timestamptz,
  -- resultado
  found_count     int not null default 0,
  approved_count  int not null default 0,
  duplicate_count int not null default 0,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  estimated_cost  numeric(12,4) not null default 0,
  error_message   text,
  created_at      timestamptz not null default now(),

  constraint cpj_id_org_key unique (id, organization_id),
  constraint cpj_territory_fk foreign key (territory_id, organization_id)
    references public.crm_territories (id, organization_id) on delete set null
);

create index cpj_org_status_idx on public.crm_prospecting_jobs (organization_id, status, created_at desc);
```

**Formato de `criteria`** — o briefing que o vendedor preenche na tela:

```jsonc
{
  "geography": {
    "states":  ["MG", "SP"],
    "cities":  ["Belo Horizonte", "Contagem"],
    "region":  "sudeste",
    "radiusKm": 50,
    "centerAddress": "Av. Amazonas, 1000, Belo Horizonte"
  },
  "segment": {
    "keywords":  ["supermercado", "mercearia", "atacado alimentício"],
    "cnaeCodes": ["4711302", "4712100"],
    "sizeTier":  ["small", "medium"]
  },
  "filters": {
    "excludeExistingAccounts": true,
    "excludeLostLeads":        true,
    "requirePhoneOrEmail":     true,
    "minEmployees":            5
  },
  "enrichment": { "findDecisionMaker": true, "summarizeBusiness": true, "suggestApproach": true }
}
```

```sql
create table public.crm_prospects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id          uuid not null,
  status          public.crm_prospect_status not null default 'new',
  -- dados retornados pelo agente
  company_name    text not null,
  trade_name      text,
  document        text,
  segment         text,
  cnae_code       text,
  size_estimate   text,
  website         text,
  email           citext,
  phone           text,
  whatsapp        text,
  address         jsonb not null default '{}'::jsonb,
  city            text,
  state           char(2),
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  social_handles  jsonb not null default '{}'::jsonb,
  -- enriquecimento e avaliação da IA
  decision_maker  jsonb not null default '{}'::jsonb,   -- {name, role, linkedin}
  business_summary text,
  fit_score       smallint check (fit_score between 0 and 100),
  fit_rationale   text,
  suggested_approach text,
  sources         jsonb not null default '[]'::jsonb,   -- [{url, title, retrievedAt}]
  confidence      numeric(4,3) check (confidence between 0 and 1),
  raw_response    jsonb not null default '{}'::jsonb,
  -- deduplicação e curadoria
  dedupe_hash     text not null,
  duplicate_of_account_id uuid,
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_notes    text,
  converted_lead_id uuid,
  created_at      timestamptz not null default now(),

  constraint cp_job_fk foreign key (job_id, organization_id)
    references public.crm_prospecting_jobs (id, organization_id) on delete cascade,
  constraint cp_dup_account_fk foreign key (duplicate_of_account_id, organization_id)
    references public.crm_accounts (id, organization_id) on delete set null,
  constraint cp_lead_fk foreign key (converted_lead_id, organization_id)
    references public.crm_leads (id, organization_id) on delete set null,
  constraint cp_reviewed_ck check (
    (status in ('approved','rejected','duplicate')) = (reviewed_at is not null)
  )
);

create index cp_job_idx        on public.crm_prospects (job_id, status);
create index cp_org_status_idx on public.crm_prospects (organization_id, status, fit_score desc);
create unique index cp_dedupe_idx on public.crm_prospects (organization_id, dedupe_hash);

alter table public.crm_leads
  add constraint crm_leads_prospect_fk foreign key (prospect_id, organization_id)
  references public.crm_prospects (id, organization_id) on delete set null;
```

**Deduplicação** — `dedupe_hash` é `sha256(lower(coalesce(document, normalize(company_name) || '|' || lower(city))))`,
calculado por trigger. O índice único impede que a mesma empresa entre duas vezes, mesmo entre execuções
diferentes. Antes de apresentar, um passo compara com `crm_accounts` e `crm_leads` existentes e marca
`duplicate` automaticamente.

**Fluxo completo da prospecção:**

```
1. Vendedor preenche o briefing (cidade/estado/região + segmento + filtros) e dispara.
2. Server Action valida (Zod), checa a cota do plano e o rate limit da organização, cria
   crm_prospecting_jobs (status 'queued') e enfileira em job_queue (queue 'ai').
3. Worker carrega a credencial BYOK da organização (§5.20) — se não houver, o job falha com mensagem clara.
4. O agente executa com ferramentas de busca web habilitadas e um schema de saída estrito
   (tool use com JSON schema), em lotes, respeitando target_count.
5. Cada item vira crm_prospects; o trigger calcula dedupe_hash; o passo de comparação marca duplicatas.
6. Custo e tokens são registrados no job E em ai_usage (§5.20.4).
7. O vendedor revisa a fila: Aprovar → cria crm_leads (source='ai_prospecting', prospect_id preenchido)
   e atribui ao dono. Rejeitar → guarda o motivo (alimenta o refinamento do prompt).
8. Aprovações em lote são permitidas; conversão para conta segue o fluxo normal de lead.
```

**Salvaguardas — não negociáveis:**

| Risco | Salvaguarda |
|---|---|
| Dado inventado (alucinação) | `sources` obrigatório por prospect; item sem fonte verificável entra com `confidence < 0.5` e é destacado na fila. A UI mostra a fonte ao lado de cada campo |
| Custo descontrolado | Cota por plano (§5.22) + rate limit por organização + `target_count ≤ 200` + estimativa de custo exibida **antes** de disparar |
| Contato sem consentimento (LGPD) | Prospect é **dado público de empresa**, não de pessoa física. `decision_maker` guarda cargo e nome público; e-mail pessoal só é registrado se vier de fonte pública, e o primeiro contato inclui a base legal e opção de descadastro (§7.10) |
| Poluição da base | Nada entra em `crm_accounts` sem revisão humana; `crm_prospects` é uma área de espera, não a base comercial |
| Chave de IA exposta | A chave nunca sai do servidor; o worker roda em Edge Function/Route Handler com `service_role` (§7.6) |

**RLS do módulo CRM (resumo):**

| Tabela | select | insert/update | delete |
|---|---|---|---|
| `crm_accounts`, `crm_contacts` | dono, território permitido, `manager+`, distribuidor (só a própria carteira) | dono ou `member+` do comercial | `admin+` |
| `crm_opportunities`, `crm_activities` | dono, `manager+`, território | dono ou `member+` | `manager+` |
| `crm_orders` | dono, `manager+`, distribuidor do pedido, financeiro | `member+`; após `invoiced`, só `manager+` | `admin+` (e nunca após faturado) |
| `crm_targets`, `crm_commissions` | o beneficiário e `manager+` | `manager+` | `admin+` |
| `crm_visits`, `crm_pos_surveys` | o visitante e `manager+` | o visitante | `manager+` |
| `crm_leads`, `crm_prospects` | dono, `manager+` | comercial `member+` | `manager+` |
| `crm_prospecting_jobs` | quem solicitou e `manager+` | comercial `member+` | `manager+` |

---
### 5.20 IA — assistente, BYOK e uso

O modelo **BYOK (Bring Your Own Key)** já validado em produção é mantido: cada organização configura sua
própria chave de API (Anthropic, OpenAI ou Google) e paga o próprio consumo. Isso resolve custo, LGPD
(o dado da empresa vai para o provedor contratado por ela) e limite de escala.

#### 5.20.1 Credenciais

```sql
create table public.ai_credentials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        public.ai_provider not null,
  vault_secret_id uuid not null,             -- referência a vault.secrets; a chave NUNCA fica aqui
  key_last4       text not null,
  default_model   text not null,
  fallback_model  text,
  is_active       boolean not null default true,
  monthly_token_limit bigint,                -- teto opcional definido pela própria organização
  last_validated_at timestamptz,
  last_error      text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_credentials_unique unique (organization_id, provider)
);

create unique index ai_credentials_one_active_idx
  on public.ai_credentials (organization_id) where is_active;
```

**RLS: nenhuma policy de `select`.** A tabela é ilegível para `authenticated`. A tela de configuração lê uma
view que expõe apenas `provider`, `key_last4`, `default_model`, `is_active` e `last_validated_at` — nunca o
`vault_secret_id`. A chave é descriptografada exclusivamente dentro do Route Handler/Edge Function que faz a
chamada ao provedor (§7.6).

```sql
create view public.ai_credentials_public with (security_invoker = true) as
  select organization_id, provider, key_last4, default_model, is_active, last_validated_at, last_error
    from public.ai_credentials;
```

#### 5.20.2 Conversas e mensagens

```sql
create table public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  title           text,
  feature         public.ai_feature not null default 'assistant',
  -- contexto da conversa: a que entidade ela está ancorada
  entity_type     text,
  entity_id       uuid,
  provider        public.ai_provider,
  model           text,
  system_prompt_version text,
  message_count   int not null default 0,
  total_input_tokens  int not null default 0,
  total_output_tokens int not null default 0,
  is_pinned       boolean not null default false,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint ai_conversations_id_org_key unique (id, organization_id)
);

create index ai_conv_user_idx   on public.ai_conversations (organization_id, user_id, last_message_at desc)
  where deleted_at is null;
create index ai_conv_entity_idx on public.ai_conversations (organization_id, entity_type, entity_id)
  where entity_id is not null;
```

```sql
create table public.ai_messages (
  id              uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  role            public.ai_role not null,
  content         text,
  tool_calls      jsonb,                      -- chamadas de ferramenta emitidas pelo modelo
  tool_call_id    text,                       -- resposta de ferramenta
  tool_name       text,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  latency_ms      int,
  stop_reason     text,
  is_error        boolean not null default false,
  error_message   text,
  created_at      timestamptz not null default now(),

  primary key (created_at, id)
) partition by range (created_at);

create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_org_idx  on public.ai_messages (organization_id, created_at desc);
```

#### 5.20.3 Ferramentas do assistente (function calling)

O assistente do sistema atual já executa ações reais. As ferramentas expostas são declaradas em código
(`lib/ai/tools/`), com **três garantias obrigatórias** por ferramenta:

| Garantia | Implementação |
|---|---|
| **Escopo do usuário** | A ferramenta executa com a **identidade do usuário da conversa**, passando pelo mesmo `can()` e pelo mesmo RLS de uma ação manual. A IA nunca recebe `service_role` |
| **Confirmação de efeito** | Ferramentas que criam ou alteram dado retornam uma *proposta* que a UI renderiza para confirmação; só após o clique a mutação acontece. Somente leitura executa direto |
| **Auditoria** | Toda execução grava `activity_log` com `actor_type = 'ai'` e o `conversation_id` no `context` |

Catálogo inicial de ferramentas: `search_knowledge`, `search_tickets`, `get_ticket`, `create_ticket`,
`suggest_reply`, `summarize_thread`, `create_task`, `get_my_agenda`, `get_indicators`, `search_accounts`,
`get_account_360`, `draft_email`, `transcribe_audio`, `analyze_patterns`, `prospect_leads`.

#### 5.20.4 Uso, custo e segurança

```sql
create table public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  feature         public.ai_feature not null,
  provider        public.ai_provider not null,
  model           text not null,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  cached_tokens   int not null default 0,
  estimated_cost  numeric(12,6) not null default 0,
  latency_ms      int,
  was_successful  boolean not null default true,
  error_code      text,
  entity_type     text,
  entity_id       uuid,
  occurred_on     date not null default current_date,
  created_at      timestamptz not null default now()
);

create index ai_usage_org_day_idx     on public.ai_usage (organization_id, occurred_on desc);
create index ai_usage_org_feature_idx on public.ai_usage (organization_id, feature, occurred_on desc);
create index ai_usage_user_idx        on public.ai_usage (organization_id, user_id, occurred_on desc);
```

```sql
-- Bloqueio progressivo contra prompt injection e sondagem (comportamento portado do sistema atual)
create table public.ai_security_blocks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  violation_count int not null default 1,
  last_violation  text,
  last_pattern    text,
  blocked_until   timestamptz,
  is_permanent    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_sec_unique unique (organization_id, user_id)
);

create index ai_sec_blocked_idx on public.ai_security_blocks (organization_id, blocked_until)
  where blocked_until is not null;
```

Escalonamento: 1ª violação → 5 min; 2ª → 24 h; 3ª → permanente até revisão de um `admin`. Cada violação
notifica os administradores da organização. Detalhes das defesas em §7.7.

#### 5.20.5 Relatórios de insight

```sql
create table public.ai_insight_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department      public.department not null,
  title           text not null,
  period_start    date not null,
  period_end      date not null,
  snapshot        jsonb not null default '{}'::jsonb,   -- métricas que embasaram a análise
  findings        text,
  recommendations text,
  provider        public.ai_provider,
  model           text,
  generated_by    uuid references public.users(id) on delete set null,
  file_id         uuid references public.files(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint ai_insight_period_ck check (period_end >= period_start)
);

create index ai_insight_org_idx on public.ai_insight_reports (organization_id, department, created_at desc);
```

> `snapshot` guarda os números usados na análise. Sem isso, um relatório de 3 meses atrás é
> irreproduzível — os dados de origem já mudaram. Reprodutibilidade é requisito, não luxo.

### 5.21 Workflows e automação

Capacidade **nova**. Substitui a dezena de triggers PL/pgSQL específicos que o sistema atual acumulou
(`create_offboarding_ti_ticket`, `sac_auto_status_on_reply`, `emit_sac_reply_event`, …) por um motor
configurável pelo próprio cliente, com builder visual em ReactFlow.

#### 5.21.1 `workflows`

```sql
create table public.workflows (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 2 and 140),
  description       text,
  department        public.department,
  is_active         boolean not null default false,
  version           int not null default 1,
  -- gatilho
  trigger_type      public.wf_trigger_type not null,
  trigger_config    jsonb not null default '{}'::jsonb,
  trigger_entity    text,                     -- 'ticket' | 'task' | 'crm_order' | ...
  -- agendamento (quando trigger_type = 'schedule')
  cron_expression   text,
  timezone          text not null default 'America/Sao_Paulo',
  -- webhook de entrada (quando trigger_type = 'webhook')
  webhook_token_hash text,
  -- execução
  max_executions_per_hour int not null default 100 check (max_executions_per_hour between 1 and 10000),
  timeout_seconds   int not null default 300 check (timeout_seconds between 5 and 3600),
  on_error          text not null default 'stop' check (on_error in ('stop','continue','retry')),
  max_retries       int not null default 2 check (max_retries between 0 and 5),
  -- canvas
  canvas            jsonb not null default '{}'::jsonb,   -- viewport, zoom (só apresentação)
  -- estatísticas desnormalizadas
  last_run_at       timestamptz,
  run_count         int not null default 0,
  failure_count     int not null default 0,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint workflows_name_unique unique (organization_id, name),
  constraint workflows_id_org_key  unique (id, organization_id),
  constraint workflows_cron_ck check (trigger_type <> 'schedule' or cron_expression is not null),
  constraint workflows_webhook_ck check (trigger_type <> 'webhook' or webhook_token_hash is not null)
);

create index workflows_org_active_idx  on public.workflows (organization_id, is_active)
  where deleted_at is null;
create index workflows_trigger_idx     on public.workflows (organization_id, trigger_type, trigger_entity)
  where is_active and deleted_at is null;
create index workflows_schedule_idx    on public.workflows (organization_id)
  where trigger_type = 'schedule' and is_active and deleted_at is null;
```

#### 5.21.2 `workflow_nodes` e `workflow_edges`

```sql
create table public.workflow_nodes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id     uuid not null,
  node_key        text not null check (node_key ~ '^[a-z0-9_-]{1,40}$'),  -- id estável no canvas
  type            public.wf_node_type not null,
  subtype         text,                       -- 'create_task' | 'send_email' | 'update_field' | ...
  label           text,
  config          jsonb not null default '{}'::jsonb,
  position_x      double precision not null default 0,
  position_y      double precision not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint wf_nodes_key_unique unique (workflow_id, node_key),
  constraint wf_nodes_id_org_key unique (id, organization_id),
  constraint wf_nodes_workflow_fk foreign key (workflow_id, organization_id)
    references public.workflows (id, organization_id) on delete cascade
);

create index wf_nodes_workflow_idx on public.workflow_nodes (workflow_id);
create unique index wf_nodes_one_trigger_idx on public.workflow_nodes (workflow_id)
  where type = 'trigger';
```

```sql
create table public.workflow_edges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id     uuid not null,
  source_node_id  uuid not null,
  target_node_id  uuid not null,
  source_handle   text,                       -- 'true' | 'false' | 'case:aprovado' | 'default'
  label           text,
  condition       jsonb,
  position        int not null default 0,

  constraint wf_edges_unique unique (workflow_id, source_node_id, target_node_id, source_handle),
  constraint wf_edges_no_self check (source_node_id <> target_node_id),
  constraint wf_edges_workflow_fk foreign key (workflow_id, organization_id)
    references public.workflows (id, organization_id) on delete cascade,
  constraint wf_edges_source_fk foreign key (source_node_id, organization_id)
    references public.workflow_nodes (id, organization_id) on delete cascade,
  constraint wf_edges_target_fk foreign key (target_node_id, organization_id)
    references public.workflow_nodes (id, organization_id) on delete cascade
);

create index wf_edges_workflow_idx on public.workflow_edges (workflow_id);
create index wf_edges_source_idx   on public.workflow_edges (source_node_id);
```

**Validação do grafo** (na ativação do workflow, não a cada salvamento):

1. Exatamente **um** nó `trigger` (garantido também por índice único).
2. Todo nó, exceto o trigger, é alcançável a partir dele.
3. Sem ciclos, **exceto** os que passam por um nó `delay` ou `approval` (senão o motor entra em laço).
4. Todo nó `condition` tem aresta `true` **e** `false`; todo `branch` tem uma aresta `default`.
5. `config` de cada nó valida contra o schema Zod do seu `subtype`.
6. Profundidade máxima de 50 nós e 200 arestas por workflow.

Falhar qualquer regra bloqueia a ativação com mensagem apontando o nó — nunca ativa "meio quebrado".

#### 5.21.3 `workflow_executions`

```sql
create table public.workflow_executions (
  id                uuid not null default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  workflow_id       uuid not null,
  workflow_version  int not null,
  status            public.wf_execution_status not null default 'queued',
  trigger_source    text not null,            -- 'event' | 'schedule' | 'manual' | 'webhook' | 'retry'
  trigger_payload   jsonb not null default '{}'::jsonb,
  entity_type       text,
  entity_id         uuid,
  context           jsonb not null default '{}'::jsonb,   -- variáveis acumuladas entre os nós
  current_node_id   uuid,
  waiting_for       jsonb,                    -- {kind:'approval'|'delay', until, approvalId}
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       int,
  error_message     text,
  error_node_key    text,
  retry_of_id       uuid,
  triggered_by      uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),

  primary key (created_at, id)
) partition by range (created_at);

create index wf_exec_workflow_idx on public.workflow_executions (organization_id, workflow_id, created_at desc);
create index wf_exec_status_idx   on public.workflow_executions (organization_id, status, created_at desc);
create index wf_exec_entity_idx   on public.workflow_executions (organization_id, entity_type, entity_id);
create index wf_exec_waiting_idx  on public.workflow_executions (organization_id, created_at)
  where status = 'waiting';
```

```sql
create table public.workflow_execution_steps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id    uuid not null,
  execution_created_at timestamptz not null,          -- necessário para FK em tabela particionada
  node_id         uuid,
  node_key        text not null,
  node_type       public.wf_node_type not null,
  status          public.wf_step_status not null default 'pending',
  attempt         int not null default 1,
  input           jsonb not null default '{}'::jsonb,
  output          jsonb not null default '{}'::jsonb,
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz,
  duration_ms     int,

  constraint wf_step_exec_fk foreign key (execution_created_at, execution_id)
    references public.workflow_executions (created_at, id) on delete cascade
);

create index wf_step_exec_idx on public.workflow_execution_steps (execution_id, started_at);
```

#### 5.21.4 Motor de execução

**Como um evento vira execução:**

```
Mutação de domínio (Server Action)
        │
        ▼
  emitDomainEvent({ type:'ticket.created', entity, before, after, orgId })
        │
        ▼
  Busca workflows ativos com trigger compatível (cache 60 s por organização)
        │
        ▼
  Filtro de trigger_config (ex.: só prioridade 'critical' e departamento 'ti')
        │
        ▼
  Cria workflow_executions (status 'queued') + job_queue (queue 'workflow')
        │
        ▼
  Worker: percorre o grafo nó a nó, gravando workflow_execution_steps
        │
        ├── delay/approval → status 'waiting', volta à fila no momento certo
        ├── erro           → on_error: stop | continue | retry (com backoff)
        └── fim            → status 'succeeded' | 'failed'
```

**Decisão:** o evento é emitido **pela aplicação**, não por trigger de banco. Trigger de banco não conhece o
usuário que fez a ação nem o "porquê", não pode ser testado sem banco, e roda dentro da transação — um
workflow lento travaria a mutação. A exceção são eventos que só existem no banco (expiração de SLA), gerados
por job de varredura.

**Tipos de nó `action` do catálogo inicial:**

`create_task` · `create_ticket` · `update_record` · `assign_to` · `send_notification` · `send_email` ·
`add_comment` · `add_tag` · `call_webhook` · `run_ai_step` · `create_approval` · `escalate` ·
`create_fin_entry` · `create_crm_activity` · `generate_document`

**Garantias do motor:**

| Garantia | Como |
|---|---|
| **Idempotência** | Cada passo grava `output`; em retry, passos já `succeeded` não reexecutam |
| **Isolamento de tenant** | O worker roda `withOrgContext(orgId)`; nós de ação usam a identidade `workflow` com permissões do criador do workflow, nunca `service_role` irrestrito |
| **Anti-loop** | Uma execução não pode disparar a si mesma; profundidade de encadeamento máxima 5; `max_executions_per_hour` por workflow |
| **Timeout** | `timeout_seconds` por execução; nó de IA e webhook têm timeout próprio menor |
| **Observabilidade** | Cada passo é uma linha; a UI mostra o caminho percorrido no próprio canvas, com input/output por nó |

**Retenção:** execuções com sucesso ficam 30 dias; com falha, 180 dias. Partições antigas são removidas.

### 5.22 Billing e assinaturas

Capacidade **nova**. Hoje existe apenas um `plan_config` JSON preenchido à mão, sem cobrança nem enforcement.

```sql
create table public.plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name            text not null,
  description     text,
  stripe_product_id text unique,
  monthly_price   numeric(10,2) not null default 0 check (monthly_price >= 0),
  yearly_price    numeric(10,2) check (yearly_price is null or yearly_price >= 0),
  stripe_price_month_id text unique,
  stripe_price_year_id  text unique,
  currency        char(3) not null default 'BRL',
  -- limites
  max_users       int not null default 5 check (max_users > 0),
  max_storage_gb  int not null default 5 check (max_storage_gb > 0),
  max_ai_calls_month int not null default 0,
  max_workflows   int not null default 0,
  max_prospecting_jobs_month int not null default 0,
  modules         text[] not null default '{}',
  features        jsonb not null default '{}'::jsonb,
  trial_days      int not null default 14 check (trial_days between 0 and 90),
  is_public       boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

> **Tabela global, sem `organization_id`** — os planos são do produto, não de um tenant.
> RLS: `select` para qualquer autenticado quando `is_public`; escrita só por migration/admin da plataforma.

```sql
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null unique references public.organizations(id) on delete cascade,
  plan_id              uuid not null references public.plans(id) on delete restrict,
  status               public.subscription_status not null default 'trialing',
  interval             public.billing_interval not null default 'month',
  seats                int not null default 1 check (seats > 0),
  -- Stripe
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  -- ciclo
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at          timestamptz,
  ended_at             timestamptz,
  -- controle
  grace_until          timestamptz,           -- tolerância após falha de pagamento
  last_payment_error   text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create index subscriptions_trial_idx  on public.subscriptions (trial_ends_at) where status = 'trialing';
```

```sql
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  stripe_invoice_id text unique,
  number           text,
  status           public.invoice_status not null default 'draft',
  amount_due       numeric(12,2) not null default 0,
  amount_paid      numeric(12,2) not null default 0,
  currency         char(3) not null default 'BRL',
  period_start     timestamptz,
  period_end       timestamptz,
  issued_at        timestamptz,
  due_at           timestamptz,
  paid_at          timestamptz,
  hosted_url       text,
  pdf_url          text,
  created_at       timestamptz not null default now()
);

create index invoices_org_idx on public.invoices (organization_id, issued_at desc);

create table public.usage_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric          text not null check (metric in
                    ('active_users','storage_gb','ai_calls','ai_tokens','workflow_executions',
                     'prospecting_jobs','emails_sent','api_calls')),
  value           numeric(16,4) not null default 0,
  period_start    date not null,
  period_end      date not null,
  recorded_at     timestamptz not null default now(),

  constraint usage_records_unique unique (organization_id, metric, period_start)
);

create index usage_records_org_idx on public.usage_records (organization_id, metric, period_start desc);

-- Idempotência de webhook: o Stripe reenvia eventos; processar duas vezes cobra duas vezes.
create table public.billing_events (
  id                uuid primary key default gen_random_uuid(),
  stripe_event_id   text not null unique,
  type              text not null,
  organization_id   uuid references public.organizations(id) on delete set null,
  payload           jsonb not null,
  processed_at      timestamptz,
  error             text,
  received_at       timestamptz not null default now()
);

create index billing_events_unprocessed_idx on public.billing_events (received_at)
  where processed_at is null;
```

**Enforcement de limites** — em três pontos, porque um só sempre vaza:

| Ponto | O que faz |
|---|---|
| **Server Action** | `assertWithinPlan(ctx, 'ai_calls')` antes da operação; erro amigável com CTA de upgrade |
| **Middleware** | `organizations.status <> 'active'` bloqueia o painel (exceto billing e logout) |
| **Banco** | Trigger em `memberships` recusa `insert` que exceda `plans.max_users` — a última barreira |

**Ciclo de vida da assinatura:**

```
trialing ──(pagamento ok)──► active ──(falha)──► past_due ──(grace 7d)──► suspended ──(30d)──► canceled
    │                           │                    │
    └──(trial expira sem pgto)──┴────────────────────┴──► suspended (dados preservados, acesso bloqueado)
```

Dados **nunca** são apagados por inadimplência: a organização fica `suspended`, com exportação completa
disponível por 90 dias.

### 5.23 Views e indicadores

Consultas analíticas **não** usam o query builder — usam views e RPC em SQL, versionadas em migrations
(§2.3). Todas com `security_invoker = true`, herdando o RLS.

| View / MV | Serve | Atualização |
|---|---|---|
| `v_ticket_metrics` | Contagens por status/prioridade, tempo médio de resolução, % SLA | Tempo real |
| `mv_ticket_daily` | Série diária por departamento e categoria (gráficos de tendência) | `pg_cron`, de hora em hora |
| `v_technician_performance` | Volume, tempo médio, satisfação e reaberturas por técnico | Tempo real (janela ≤ 90 dias) |
| `v_top_requesters` | Solicitantes com mais chamados no período | Tempo real |
| `mv_pop_effectiveness` | % de chamados resolvidos após consulta ao POP | Diária |
| `v_asset_summary` | Ativos por categoria/status, garantias vencendo | Tempo real |
| `v_fin_cashflow` | Fluxo de caixa projetado por competência e vencimento | Tempo real |
| `mv_fin_monthly` | Realizado × orçado por centro de custo | Diária |
| `v_crm_funnel` | Oportunidades por estágio, valor ponderado, tempo médio | Tempo real |
| `mv_crm_funnel_daily` | Conversão por estágio e coorte | Diária |
| `v_crm_target_progress` | Metas × realizado por vendedor/distribuidor/território | Tempo real |
| `v_crm_visit_compliance` | Visitas planejadas × realizadas, cobertura de roteiro | Tempo real |
| `mv_crm_rupture` | Ruptura por produto/região a partir de `crm_pos_surveys` | Diária |
| `v_sac_by_batch` | Reclamações por lote e produto (alerta de qualidade) | Tempo real |
| `v_hr_headcount` | Headcount, turnover, absenteísmo | Diária |
| `v_ai_usage_monthly` | Tokens e custo por organização, feature e usuário | Diária |

Regra: **materializar só quando a versão em tempo real passar de ~800 ms** na maior organização.
Materializar cedo demais cria dado desatualizado sem necessidade.

```sql
-- Exemplo: dashboards precisam de índice por dia, não de scan por linha
create materialized view public.mv_ticket_daily as
select organization_id, department, date_trunc('day', created_at)::date as day,
       count(*) filter (where true)                             as created_count,
       count(*) filter (where status in ('resolved','closed'))  as resolved_count,
       count(*) filter (where is_sla_breached)                  as breached_count,
       avg(extract(epoch from (resolved_at - created_at)) / 3600.0)
         filter (where resolved_at is not null)                 as avg_resolution_hours,
       avg(satisfaction_rating) filter (where satisfaction_rating is not null) as avg_rating
  from public.tickets
 group by 1, 2, 3;

create unique index mv_ticket_daily_pk on public.mv_ticket_daily (organization_id, department, day);
select cron.schedule('refresh-mv-ticket-daily', '7 * * * *',
  $$ refresh materialized view concurrently public.mv_ticket_daily $$);
```

> **Atenção:** materialized view **não** respeita RLS. Por isso ela nunca é consultada diretamente pelo
> cliente — é lida por uma view comum com `security_invoker` que filtra por `organization_id`, ou por uma
> função `stable` que aplica o filtro. Errar isso é vazar métricas entre empresas.

### 5.24 Retenção e expurgo

Cada tabela de alto volume declara sua política. Um job diário (`pg_cron`) executa.

| Tabela | Retenção | Ação |
|---|---|---|
| `activity_log` | 24 meses (60 no enterprise) | Exporta partição para storage, depois `drop partition` |
| `notifications` | 6 meses; lidas > 90 dias | Remove |
| `ai_messages` | 12 meses | Remove partição; `ai_conversations` mantém o resumo |
| `ai_usage` | 24 meses | Agrega em `usage_records` mensal e remove o cru |
| `workflow_executions` | 30 dias (sucesso), 180 dias (falha) | Remove partição |
| `job_queue` | 7 dias após `succeeded`; `dead` mantido 90 dias | Remove |
| `email_log` | 12 meses | Remove |
| `sac_otp_codes` | 24 horas | Remove |
| `pop_interactions` (`view`) | 90 dias | Agrega mensal e remove o cru |
| `crm_prospects` rejeitados | 12 meses | Remove |
| `files` com `deleted_at` | 30 dias | Remove do storage e da tabela |
| `files` órfãos (sem entidade) | 24 horas | Remove |

Dados de negócio (chamados, pedidos, folha, laudos) **não têm expurgo automático** — são o registro da
empresa. Exclusão só por solicitação explícita, com o fluxo de LGPD do §7.10.

---
## 6. ESTRUTURA DE PASTAS

### 6.1 Princípio: rotas finas, módulos gordos

A pasta `app/` contém **apenas roteamento e composição**. Toda lógica vive em `modules/{dominio}/`.
Um arquivo em `app/` que passe de ~80 linhas está no lugar errado.

Motivo prático: o roteamento do Next muda de versão para versão e reflete a navegação, não o negócio.
Manter o domínio fora de `app/` permite reorganizar rotas, reaproveitar a lógica em jobs, workers e Edge
Functions, e testar sem subir o framework.

### 6.2 Árvore completa

```
helpoint-saas/
├── .github/
│   └── workflows/
│       ├── ci.yml                      # lint, typecheck, testes, build, pgTAP
│       ├── deploy-preview.yml          # branch → Vercel preview + Supabase branch
│       ├── deploy-production.yml       # main → migrations + Vercel production
│       └── nightly.yml                 # advisors, dependências, e2e completo
│
├── supabase/
│   ├── config.toml
│   ├── migrations/                     # SQL versionado — FONTE DE VERDADE do schema
│   │   ├── 20260901000001_extensions.sql
│   │   ├── 20260901000002_enums.sql
│   │   ├── 20260901000003_core_organizations.sql
│   │   ├── 20260901000004_core_users_memberships.sql
│   │   ├── 20260901000005_core_rbac.sql
│   │   ├── 20260901000006_core_activity_notifications.sql
│   │   ├── 20260901000007_core_files_queue_email.sql
│   │   ├── 20260901000010_work_management.sql
│   │   ├── 20260901000020_helpdesk.sql
│   │   ├── 20260901000030_assets_licenses_contracts.sql
│   │   ├── 20260901000040_knowledge_pops.sql
│   │   ├── 20260901000050_catalog_products_suppliers.sql
│   │   ├── 20260901000060_hr.sql
│   │   ├── 20260901000070_finance.sql
│   │   ├── 20260901000080_marketing.sql
│   │   ├── 20260901000090_quality_sac.sql
│   │   ├── 20260901000100_crm.sql
│   │   ├── 20260901000110_ai.sql
│   │   ├── 20260901000120_workflows.sql
│   │   ├── 20260901000130_billing.sql
│   │   ├── 20260901000140_views_indicators.sql
│   │   └── 99999999999999_apply_conventions.sql   # RLS/trigger em massa (§4.4) — sempre por último
│   ├── functions/                      # Edge Functions Deno: só o que nasce do banco ou de fora
│   │   ├── _shared/
│   │   │   ├── cors.ts
│   │   │   ├── supabase-admin.ts
│   │   │   └── validate.ts
│   │   ├── sac-public-submit/          # formulário público (sem sessão)
│   │   ├── sac-send-otp/
│   │   ├── sac-verify-otp/
│   │   ├── domain-verify/              # verificação DNS de domínio customizado
│   │   ├── queue-worker/               # consome job_queue (chamada por pg_cron)
│   │   ├── social-publish/
│   │   └── sla-scan/
│   ├── seed.sql                        # dados de desenvolvimento
│   └── tests/
│       ├── rls/                        # pgTAP: um arquivo por tabela (§3.8)
│       │   ├── _helpers.sql
│       │   ├── _meta.test.sql
│       │   ├── tickets.test.sql
│       │   └── ...
│       └── functions/                  # testes de RPC e triggers
│
├── src/
│   ├── proxy.ts                        # resolução de organização + sessão (era middleware.ts no Next 15)
│   │
│   ├── app/
│   │   ├── layout.tsx                  # html, providers globais, fontes
│   │   ├── globals.css
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   │
│   │   ├── (marketing)/                # helpoint.com.br — sem organização
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── precos/page.tsx
│   │   │   └── termos/page.tsx
│   │   │
│   │   ├── (auth)/                     # login, cadastro, convite, recuperação
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── cadastro/page.tsx
│   │   │   ├── recuperar-senha/page.tsx
│   │   │   ├── nova-senha/page.tsx
│   │   │   ├── convite/[token]/page.tsx
│   │   │   └── onboarding/page.tsx     # criação da organização
│   │   │
│   │   ├── (portal)/sac/               # portal do consumidor — scope 'portal'
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── entrar/page.tsx         # OTP
│   │   │   ├── nova-reclamacao/page.tsx
│   │   │   ├── meus-chamados/page.tsx
│   │   │   ├── meus-chamados/[id]/page.tsx
│   │   │   └── ajuda/page.tsx          # base de conhecimento pública
│   │   │
│   │   ├── (partner)/parceiro/         # painel do distribuidor — scope 'partner'
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── clientes/
│   │   │   ├── pedidos/
│   │   │   └── metas/
│   │   │
│   │   ├── (app)/                      # painel interno — scope 'staff'
│   │   │   ├── layout.tsx              # AppShell: sidebar, header, guardas de sessão
│   │   │   ├── inicio/page.tsx         # curadoria diária + modo foco
│   │   │   ├── agenda/page.tsx
│   │   │   ├── busca/page.tsx
│   │   │   ├── notificacoes/page.tsx
│   │   │   │
│   │   │   ├── trabalho/               # Work Management
│   │   │   │   ├── projetos/page.tsx
│   │   │   │   ├── projetos/[id]/page.tsx
│   │   │   │   ├── projetos/[id]/quadro/page.tsx
│   │   │   │   ├── tarefas/page.tsx
│   │   │   │   └── tarefas/[id]/page.tsx
│   │   │   │
│   │   │   ├── atendimento/            # helpdesk transversal
│   │   │   │   ├── nova-solicitacao/page.tsx
│   │   │   │   ├── meus-chamados/page.tsx
│   │   │   │   └── chamados/[id]/page.tsx
│   │   │   │
│   │   │   ├── ti/
│   │   │   │   ├── chamados/
│   │   │   │   ├── inventario/
│   │   │   │   ├── licencas/
│   │   │   │   ├── contratos/
│   │   │   │   ├── manutencoes/
│   │   │   │   ├── indicadores/
│   │   │   │   └── configuracoes/
│   │   │   ├── comercial/              # CRM
│   │   │   │   ├── page.tsx            # dashboard comercial
│   │   │   │   ├── contas/
│   │   │   │   ├── contatos/
│   │   │   │   ├── funil/
│   │   │   │   ├── pedidos/
│   │   │   │   ├── distribuidores/
│   │   │   │   ├── territorios/
│   │   │   │   ├── tabelas-de-preco/
│   │   │   │   ├── metas/
│   │   │   │   ├── comissoes/
│   │   │   │   ├── roteiros/
│   │   │   │   ├── visitas/
│   │   │   │   ├── leads/
│   │   │   │   ├── prospeccao/         # briefing e fila de curadoria da IA
│   │   │   │   └── indicadores/
│   │   │   ├── rh/
│   │   │   ├── financeiro/
│   │   │   ├── marketing/
│   │   │   ├── qualidade/
│   │   │   ├── conhecimento/           # POPs
│   │   │   ├── automacoes/             # Workflows
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx       # canvas ReactFlow
│   │   │   │   └── [id]/execucoes/page.tsx
│   │   │   └── configuracoes/
│   │   │       ├── organizacao/
│   │   │       ├── usuarios/
│   │   │       ├── perfis-de-acesso/
│   │   │       ├── identidade-visual/
│   │   │       ├── dominios/
│   │   │       ├── produtos/
│   │   │       ├── ia/
│   │   │       ├── notificacoes/
│   │   │       ├── auditoria/
│   │   │       └── assinatura/         # billing
│   │   │
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── stripe/route.ts
│   │       │   ├── resend/route.ts
│   │       │   └── meta/route.ts
│   │       ├── ai/
│   │       │   ├── chat/route.ts       # streaming SSE
│   │       │   └── suggest/route.ts
│   │       ├── workflows/
│   │       │   ├── webhook/[token]/route.ts
│   │       │   └── execute/route.ts
│   │       ├── files/
│   │       │   ├── upload-url/route.ts
│   │       │   └── [id]/download/route.ts
│   │       ├── export/[entity]/route.ts
│   │       ├── cron/                   # Vercel Cron
│   │       │   ├── sla-scan/route.ts
│   │       │   ├── alerts/route.ts
│   │       │   ├── metrics-refresh/route.ts
│   │       │   └── retention/route.ts
│   │       └── health/route.ts
│   │
│   ├── modules/                        # DOMÍNIO — organizado por negócio, não por rota
│   │   ├── _template/                  # esqueleto copiado ao criar um módulo novo
│   │   │   ├── actions/
│   │   │   ├── queries/
│   │   │   ├── domain/
│   │   │   ├── schemas/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── types.ts
│   │   │
│   │   ├── organizations/
│   │   ├── auth/
│   │   ├── access/                     # RBAC: perfis, permissões, convites
│   │   ├── work/                       # projetos, tarefas, comentários
│   │   ├── helpdesk/
│   │   │   ├── actions/                # 'use server' — mutações
│   │   │   │   ├── create-ticket.ts
│   │   │   │   ├── assign-ticket.ts
│   │   │   │   └── resolve-ticket.ts
│   │   │   ├── queries/                # leitura para RSC (sem 'use server')
│   │   │   │   ├── list-tickets.ts
│   │   │   │   └── get-ticket.ts
│   │   │   ├── domain/                 # REGRA PURA — sem I/O, 100% testável
│   │   │   │   ├── sla.ts
│   │   │   │   ├── status-machine.ts
│   │   │   │   └── priority.ts
│   │   │   ├── schemas/                # Zod compartilhado client/server
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── types.ts
│   │   ├── assets/
│   │   ├── knowledge/
│   │   ├── catalog/                    # produtos, lotes, fornecedores
│   │   ├── hr/
│   │   │   └── domain/payroll/         # INSS, IRRF, FGTS, férias — o coração testável do RH
│   │   ├── finance/
│   │   ├── marketing/
│   │   ├── quality/
│   │   ├── sac/
│   │   ├── crm/
│   │   │   ├── domain/
│   │   │   │   ├── pricing.ts          # resolução de preço (§5.19.3)
│   │   │   │   ├── commission.ts
│   │   │   │   ├── territory.ts
│   │   │   │   └── route-optimizer.ts
│   │   │   └── prospecting/            # briefing, agente, deduplicação, curadoria
│   │   ├── ai/
│   │   ├── workflows/
│   │   │   ├── engine/                 # runner, avaliador de condição, registry de nós
│   │   │   ├── nodes/                  # um arquivo por subtype de ação
│   │   │   └── components/             # nós customizados do ReactFlow
│   │   ├── billing/
│   │   └── notifications/
│   │
│   ├── components/                     # UI genérica, sem conhecimento de domínio
│   │   ├── ui/                         # shadcn/ui — não editar à mão além do theming
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── page-header.tsx
│   │   │   ├── global-search.tsx
│   │   │   └── notification-bell.tsx
│   │   ├── data/
│   │   │   ├── data-table.tsx          # TanStack Table + filtros + colunas + densidade
│   │   │   ├── keyset-pagination.tsx
│   │   │   ├── empty-state.tsx
│   │   │   └── export-button.tsx
│   │   ├── form/
│   │   │   ├── form-field.tsx
│   │   │   ├── dynamic-form.tsx        # renderiza ticket_form_fields / sac_form_fields
│   │   │   ├── file-upload.tsx
│   │   │   └── currency-input.tsx
│   │   ├── charts/
│   │   ├── comments/                   # thread genérica reusada por todos os módulos
│   │   ├── activity/                   # timeline de activity_log
│   │   └── ai/
│   │
│   ├── lib/                            # infraestrutura — sem regra de negócio
│   │   ├── supabase/
│   │   │   ├── browser.ts
│   │   │   ├── server.ts
│   │   │   ├── admin.ts                # service_role — importar aqui é revisado no PR
│   │   │   └── types.generated.ts      # gerado pelo CI; NÃO editar
│   │   ├── tenant/
│   │   │   ├── resolve.ts
│   │   │   ├── context.ts              # getOrgContext() (§3.5)
│   │   │   └── reserved.ts
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── rbac.ts                 # can(), assertCan()
│   │   │   └── guards.ts
│   │   ├── data/                       # helpers de acesso: paginação, filtros, ordenação
│   │   ├── audit/log.ts
│   │   ├── storage/                    # interface própria (troca Supabase→R2 sem tocar módulos)
│   │   ├── queue/                      # enqueue, dequeue, workers
│   │   ├── cache/                      # Upstash + unstable_cache
│   │   ├── mail/
│   │   │   ├── client.ts
│   │   │   └── templates/              # React Email
│   │   ├── ai/
│   │   │   ├── byok.ts                 # carrega credencial do Vault, escolhe provedor
│   │   │   ├── providers/
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── openai.ts
│   │   │   │   └── google.ts
│   │   │   ├── tools/                  # function calling (§5.20.3)
│   │   │   ├── prompts/                # versionados; mudança de prompt é mudança de código
│   │   │   └── guard.ts                # detecção de prompt injection
│   │   ├── billing/
│   │   │   ├── stripe.ts
│   │   │   └── limits.ts               # assertWithinPlan()
│   │   ├── realtime/
│   │   ├── security/
│   │   │   ├── rate-limit.ts
│   │   │   ├── rate-limit-edge.ts
│   │   │   ├── sanitize.ts
│   │   │   └── csp.ts
│   │   ├── validation/                 # schemas Zod compartilhados (cnpj, cpf, telefone, cep)
│   │   ├── format/                     # moeda, data, documento, número — pt-BR
│   │   ├── errors/                     # AppError, códigos, mapeamento para HTTP e toast
│   │   └── utils.ts
│   │
│   ├── hooks/                          # hooks genéricos (use-debounce, use-media-query…)
│   ├── i18n/pt-BR/                     # dicionários por módulo
│   ├── config/
│   │   ├── navigation.ts               # sidebar declarativa (módulo, permissão, ícone)
│   │   ├── modules.ts                  # catálogo de módulos e dependências
│   │   └── env.ts                      # validação Zod das variáveis de ambiente no boot
│   ├── styles/
│   └── types/
│
├── tests/
│   ├── unit/                           # Vitest — espelha modules/*/domain/
│   ├── integration/                    # Server Actions contra Supabase local
│   ├── e2e/                            # Playwright
│   │   ├── auth.spec.ts
│   │   ├── tenant-isolation.spec.ts    # dois tenants no mesmo teste
│   │   ├── helpdesk.spec.ts
│   │   └── crm-order-to-invoice.spec.ts
│   └── fixtures/
│
├── scripts/
│   ├── gen-types.ts                    # supabase gen types + verificação de drift
│   ├── gen-rls-test.ts                 # esqueleto de teste pgTAP para tabela nova
│   ├── check-imports.ts                # regras de dependência entre camadas (§6.5)
│   └── seed-demo.ts
│
├── docker/                             # preparado para a Fase 2; testado no CI desde já
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx/helpoint.conf
│
├── docs/
│   ├── arquitetura.md                  # ESTE DOCUMENTO
│   ├── adr/                            # decisões novas, uma por arquivo
│   └── runbook.md
│
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.mjs
└── package.json
```

### 6.3 Anatomia de um módulo

Todo módulo em `src/modules/` tem a mesma forma. Copiar `_template/` é o ponto de partida.

| Pasta | Responsabilidade | Pode importar | Não pode |
|---|---|---|---|
| `domain/` | Regra de negócio pura: cálculo, máquina de estados, validação semântica | Apenas outros `domain/` e utilitários puros | Supabase, `next/*`, React, `fetch`, `Date.now()` sem injeção |
| `schemas/` | Zod de entrada e saída | `zod`, `lib/validation` | Qualquer I/O |
| `queries/` | Leitura para RSC | `lib/supabase/server`, `lib/tenant`, `domain/` | `'use server'`, mutação |
| `actions/` | Mutação (`'use server'`) | `queries/`, `domain/`, `schemas/`, `lib/*` | Ser importado por outro módulo diretamente |
| `components/` | UI do módulo | `components/ui`, `hooks/`, tipos do módulo | Importar `actions/` de **outro** módulo |
| `hooks/` | Estado de cliente do módulo | TanStack Query, tipos | Acesso direto a banco |
| `types.ts` | Tipos derivados de `types.generated.ts` | — | Redefinir tipo de tabela à mão |

**Comunicação entre módulos:** um módulo **não** importa `actions/` de outro. Ele importa `queries/` (leitura)
ou emite um **evento de domínio** (`emitDomainEvent`) que o outro módulo escuta via workflow. Isso mantém o
acoplamento visível e testável — e é o que impede o efeito "mudar RH quebrou o Financeiro".

Exceção controlada: um módulo pode expor um `public.ts` com as funções que outros módulos podem usar
(`crm/public.ts` exporta `createReceivablesFromOrder`). O que não está em `public.ts` é privado.

### 6.4 Padrão de Server Action

Toda Server Action segue exatamente esta sequência. É o gabarito que o Claude Code replica:

```ts
'use server';

import { z } from 'zod';
import { getOrgContext } from '@/lib/tenant/context';
import { assertCan } from '@/lib/auth/rbac';
import { assertWithinPlan } from '@/lib/billing/limits';
import { rateLimit } from '@/lib/security/rate-limit';
import { logActivity } from '@/lib/audit/log';
import { emitDomainEvent } from '@/modules/workflows/emit';
import { createTicketSchema } from '../schemas/ticket';
import { calculateSlaDueAt } from '../domain/sla';

export async function createTicket(input: unknown) {
  // 1. Contexto (identidade + organização) — SEMPRE primeiro
  const ctx = await getOrgContext();

  // 2. Rate limit por usuário
  await rateLimit(`ticket:create:${ctx.userId}`, { limit: 30, window: '1m' });

  // 3. Validação de entrada
  const data = createTicketSchema.parse(input);

  // 4. Autorização de aplicação (RLS é a rede, não a primeira barreira)
  await assertCan(ctx, 'tickets', 'create');

  // 5. Limite de plano, quando aplicável
  await assertWithinPlan(ctx, 'tickets');

  // 6. Regra de negócio pura
  const slaDueAt = calculateSlaDueAt(data.priority, policy, businessHours, holidays);

  // 7. Persistência — organization_id vem do contexto, NUNCA do input
  const supabase = await createServerSupabase();
  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({ ...data, organization_id: ctx.organizationId, requester_id: ctx.userId, sla_due_at: slaDueAt })
    .select('id, number')
    .single();
  if (error) throw toAppError(error);

  // 8. Auditoria
  await logActivity(ctx, { action: 'created', entityType: 'ticket', entityId: ticket.id,
                           entityLabel: `#${ticket.number} ${data.title}` });

  // 9. Efeitos assíncronos (workflows, notificações, IA) — nunca bloqueiam a resposta
  await emitDomainEvent(ctx, { type: 'ticket.created', entityId: ticket.id, payload: ticket });

  // 10. Revalidação de cache
  revalidatePath('/ti/chamados');
  return { id: ticket.id, number: ticket.number };
}
```

Os dez passos são obrigatórios; os que não se aplicam são **omitidos**, nunca reordenados.

### 6.5 Regras de dependência (verificadas por lint)

`scripts/check-imports.ts` roda no CI e falha o build:

| Regra | Motivo |
|---|---|
| `lib/supabase/admin` só pode ser importado por `app/api/**`, `supabase/functions/**` e `lib/queue/**` | `service_role` ignora RLS; cada uso é revisado |
| `modules/*/domain/**` não importa nada de `lib/supabase`, `next/*` ou `react` | Garante que a regra de negócio é testável sem infraestrutura |
| `app/**` não importa de `modules/*/queries` ou `actions` de módulo diferente do da rota | Evita acoplamento entre módulos por conveniência de rota |
| Nenhum arquivo fora de `lib/tenant/context.ts` lê o header `x-organization-id` | Fonte única do tenant |
| `components/ui/**` não importa de `modules/**` | Componentes genéricos não conhecem domínio |
| Nada importa `types.generated.ts` diretamente exceto `modules/*/types.ts` | Tipos de tabela passam por uma camada de nomes de domínio |

### 6.6 Convenções de nome de arquivo

| Tipo | Convenção | Exemplo |
|---|---|---|
| Componente React | `kebab-case.tsx`, export nomeado em `PascalCase` | `ticket-detail-sheet.tsx` → `TicketDetailSheet` |
| Server Action | `kebab-case.ts`, verbo no infinitivo | `create-ticket.ts` → `createTicket` |
| Query | `kebab-case.ts`, prefixo `get`/`list` | `list-tickets.ts` → `listTickets` |
| Domínio | `kebab-case.ts`, substantivo | `sla.ts`, `commission.ts` |
| Schema Zod | `kebab-case.ts`, sufixo `Schema` | `ticket.ts` → `createTicketSchema` |
| Hook | `use-kebab-case.ts` | `use-ticket-filters.ts` |
| Migration | `YYYYMMDDHHMMSS_snake_case.sql` | `20260901000020_helpdesk.sql` |
| Teste | espelha o arquivo + `.test.ts` | `sla.test.ts` |

---
## 7. PLANO DE SEGURANÇA

### 7.0 Modelo de ameaça

Antes dos controles, o que estamos defendendo e de quem:

| Ativo | Ameaça | Impacto | Controle principal |
|---|---|---|---|
| Dados de outra organização | Vazamento cross-tenant por bug de query | **Catastrófico** — fim do produto | RLS + FK composta + trigger + teste pgTAP obrigatório (§3) |
| Folha, salários, CPF, atestados | Acesso indevido de colega ou gestor | Alto — legal e humano | Policy P3 + view sem colunas sensíveis + auditoria de leitura (§5.14) |
| Chave de IA (BYOK) do cliente | Exfiltração e uso por terceiro | Alto — custo e confiança | Supabase Vault, nunca em coluna legível, nunca no client (§7.6) |
| Tokens OAuth de redes sociais | Publicação não autorizada em nome do cliente | Alto — imagem | Vault + tabela sem policy (§5.17.3) |
| Portal SAC (aberto à internet) | Spam, enumeração de e-mail, DoS | Médio — operacional | Rate limit por IP e e-mail, CAPTCHA, OTP com hash (§7.4) |
| Assistente de IA | Prompt injection para extrair dados ou system prompt | Médio-alto | Ferramentas com escopo do usuário + guard + bloqueio progressivo (§7.7) |
| Sessão de usuário | Roubo de cookie, XSS, CSRF | Alto | Cookies `httpOnly`+`Secure`+`SameSite`, CSP, Server Actions com token (§7.8) |
| Anexos | Upload de executável, path traversal, XSS via SVG | Médio | Validação tripla + bucket privado + `Content-Disposition` (§7.9) |

### 7.1 Autenticação

#### 7.1.1 Fluxo do staff (painel interno)

```
1. Usuário acessa {org}.helpoint.com.br → proxy resolve a organização pelo host.
2. Tela de login exibe a marca da organização (branding vem da resolução, antes do login).
3. Supabase Auth valida e-mail + senha (Argon2id gerenciado pelo GoTrue).
4. Cookies de sessão (access ~1h + refresh) são gravados httpOnly/Secure/SameSite=Lax pelo @supabase/ssr.
5. Callback de pós-login verifica a MEMBERSHIP:
     - sem membership ativa nesta organização → 403 com a lista de organizações às quais pertence
     - membership suspensa                     → tela explicativa, sem detalhar o motivo
     - organização suspensa                    → tela de billing (§5.22)
6. Atualiza memberships.last_used_at e users.last_seen_at.
7. Grava activity_log (action='login', context com IP e user-agent).
```

**Decisões e por quê:**

- **Um usuário, várias organizações.** O e-mail é único globalmente (`users.email`), e o acesso vem da
  `membership`. Isso é diferente do sistema atual, onde o `profile` amarra o usuário a um tenant.
  Ganho concreto: consultores, contadores e grupos econômicos deixam de precisar de contas duplicadas.
- **Login é escopado pelo host.** Autenticar em `acme.helpoint.com.br` e não ter membership na Acme falha,
  mesmo com credencial válida — evita o vazamento de "essa conta existe aqui".
- **Sessão expira** conforme `organization_settings.session_max_hours` (padrão 12 h).
- **MFA (TOTP)** disponível para todos e **obrigatório para `owner`/`admin`** quando
  `require_mfa_for_admins = true`.
- **Domínios de e-mail permitidos**: `allowed_email_domains` bloqueia convite e cadastro fora do domínio
  corporativo, quando a organização exigir.

#### 7.1.2 Fluxo do portal SAC (consumidor)

Sessão **separada e de escopo mínimo**. O consumidor nunca compartilha sessão com o staff.

```
1. Consumidor informa o e-mail em {org}.helpoint.com.br/sac/entrar.
2. Rate limit: 3 códigos por e-mail/hora e 10 por IP/hora (§7.4).
3. Gera código de 6 dígitos; grava APENAS o hash em sac_otp_codes; expira em 10 min.
4. Envia por e-mail (Resend). A resposta é sempre a mesma, exista o e-mail ou não
   — não confirmar existência de cadastro.
5. Validação compara o hash, incrementa attempts (máx. 5) e marca consumed_at.
6. Cria/recupera o usuário no Supabase Auth, cria crm_contacts + membership scope='portal'.
7. Sessão do portal: só acessa as rotas /sac e apenas os próprios chamados.
```

**Abertura anônima** (sem login), que o produto oferece: Edge Function com `service_role`, protegida por
rate limit por IP, verificação de formato, CAPTCHA (Turnstile) acima do limiar e validação de anexos.
O protocolo é enviado por e-mail, e o acompanhamento exige OTP — impedindo enumeração de protocolos.

#### 7.1.3 Fluxo do parceiro (distribuidor)

Mesmo mecanismo do staff (e-mail + senha), com `membership.scope = 'partner'` e `crm_account_id` obrigatório.
O proxy roteia para `(partner)/parceiro`, e as policies limitam a visão à carteira do distribuidor
(§5.19.2). Um parceiro **nunca** acessa rotas de `(app)` — o layout verifica o scope e redireciona.

#### 7.1.4 Onboarding e convites

**Criação de organização** (self-service) — RPC `SECURITY DEFINER` atômica:

```
Valida slug (formato, reservados, disponibilidade)
  → cria organizations (status 'trialing')
  → cria membership do criador como 'owner'
  → cria organization_settings com padrões
  → semeia: perfis de acesso do sistema, categorias de chamado, políticas de SLA,
            pipeline comercial padrão, plano de contas básico
  → cria subscriptions em 'trialing' com o plano free
  → grava activity_log
```

Tudo em uma transação: uma organização sem owner ou sem configurações é um estado inválido que trava a UI.

**Convite:**

```
Admin informa e-mail + papel + departamento + perfis de acesso
  → valida limite de seats do plano
  → gera token aleatório de 32 bytes; grava só o hash (§5.3.5)
  → envia e-mail com link contendo o token cru
  → tela pública lê os dados via RPC get_invite_public(token) (nome da org + e-mail mascarado)
  → aceite: valida token e expiração, cria/loga o usuário, cria membership,
            vincula perfis, marca convite, grava activity_log
```

Convite expira em 7 dias e pode ser reenviado até 5 vezes. Revogar invalida imediatamente.

#### 7.1.5 Senhas e recuperação

| Controle | Regra |
|---|---|
| Comprimento mínimo | `organization_settings.password_min_length` (padrão 10) |
| Complexidade | Não exigimos símbolo obrigatório; exigimos **verificação contra vazamentos** (HIBP k-anonymity) e bloqueio de senhas óbvias |
| Hash | Argon2id, gerenciado pelo Supabase Auth |
| Recuperação | Link de uso único, 1 h de validade, invalida todas as sessões ativas ao concluir |
| Troca de senha | Invalida as demais sessões; notifica por e-mail |
| Tentativas | 5 falhas por e-mail em 15 min → bloqueio temporário progressivo; `activity_log` com `login_failed` |

### 7.2 Uso do `service_role`

A chave `service_role` **ignora RLS**. Ela existe para exatamente estes casos, e o lint impede outros (§6.5):

| Caso | Onde | Por quê |
|---|---|---|
| Formulário público do SAC | `supabase/functions/sac-public-submit` | Não há sessão ainda |
| OTP do SAC (gerar, validar) | `sac-send-otp`, `sac-verify-otp` | O cliente não pode ler a tabela nem a própria linha |
| Webhooks (Stripe, Resend, Meta) | `app/api/webhooks/*` | Requisição vem de terceiro, sem sessão |
| Worker de fila e cron | `lib/queue/*`, `app/api/cron/*` | Executa em nome do sistema |
| Leitura de segredos (Vault) | `lib/ai/byok.ts`, `social-publish` | Nenhum usuário pode ler segredo |

Regras invioláveis para esses pontos:
1. **Sempre** filtram por `organization_id` explicitamente — perder o RLS não pode virar perder o tenant.
2. **Nunca** recebem `organization_id` do corpo da requisição sem validação contra uma chave secreta,
   assinatura de webhook ou token com hash.
3. **Sempre** gravam `activity_log` com `actor_type = 'system'`.

#### 7.2.1 O papel `anon` não recebe nada

Todo acesso não autenticado passa por Edge Function com `service_role`. O papel `anon` não tem grant
de tabela, sequência ou função — com **uma** exceção nominal: `resolve_organization_by_host`, que o
`proxy.ts` precisa chamar antes de existir sessão e que devolve apenas identidade visual (§3.3).

> ⚠️ **`REVOKE ... FROM anon` não basta em funções.**
> O PostgreSQL concede `EXECUTE` ao papel **`PUBLIC`** por padrão em toda função criada, e `PUBLIC`
> inclui `anon`. Revogar de `anon` é um **no-op** enquanto o grant de `PUBLIC` existir.
>
> Isso passou despercebido em duas migrations e foi pego por verificação empírica: `POST
> /rest/v1/rpc/role_rank` respondia **200** para um cliente anônimo. Grave, porque `dequeue_jobs` e
> `next_sequence` **escrevem** — um anônimo podia consumir a fila de jobs e girar as sequências.
>
> A forma correta, e o modelo daqui em diante:
> ```sql
> revoke execute on all routines in schema public from public;
> alter default privileges in schema public revoke execute on functions from public;
> -- e então grant nominal só para quem precisa
> ```
> Nada é executável por padrão; cada função que **precisa** ser chamável recebe grant explícito.
> Verificação: chamar a RPC como `anon` e exigir **401** (§9.4).

**Resíduo aceito:** os helpers de RLS continuam executáveis por `authenticated`, e o
`get_advisors` os reporta. Não é opcional — a expressão de uma policy é avaliada com os privilégios de
quem faz a consulta; revogar quebraria todo o RLS. Essas funções só leem a identidade do próprio
chamador, então expô-las a um usuário já autenticado não revela nada que ele não possa deduzir.

### 7.3 Autorização (RBAC)

Três camadas, avaliadas nesta ordem:

```
Camada 1 — PLANO:      o módulo está habilitado para esta organização? (plans.modules)
Camada 2 — PAPEL:      owner > admin > manager > member > viewer | partner | portal
Camada 3 — PERFIL:     access_profiles.permissions[recurso][ação] + restrictions
```

```ts
// src/lib/auth/rbac.ts
export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
export type Scope  = false | 'own' | 'assigned' | 'team' | 'department' | 'all';

export function can(ctx: OrgContext, resource: string, action: Action): Scope {
  if (!isModuleEnabled(ctx, resourceModule(resource))) return false;   // camada 1
  if (ctx.role === 'owner') return 'all';                              // camada 2
  if (ctx.role === 'admin') return resource === 'billing' ? false : 'all';
  if (ctx.role === 'viewer' && action !== 'view') return false;
  const perm = ctx.permissions[resource]?.[action];                    // camada 3
  if (perm === undefined || perm === false) return false;              // default deny
  return perm === true ? 'all' : perm;
}

export async function assertCan(ctx: OrgContext, resource: string, action: Action) {
  const scope = can(ctx, resource, action);
  if (!scope) throw new ForbiddenError(resource, action);
  return scope;
}
```

**O escopo retornado é aplicado à query**, não apenas ao botão:

```ts
const scope = await assertCan(ctx, 'tickets', 'view');
let q = supabase.from('tickets').select('*').eq('organization_id', ctx.organizationId);
if (scope === 'own')        q = q.eq('requester_id', ctx.userId);
if (scope === 'assigned')   q = q.or(`assigned_to.eq.${ctx.userId},requester_id.eq.${ctx.userId}`);
if (scope === 'department') q = q.eq('department', ctx.department);
```

**Princípios:**

- **Negar por omissão.** Permissão não declarada é permissão negada.
- **A UI esconde, a API decide.** Esconder o botão é UX; a checagem que importa é a do servidor.
- **RLS é a rede final.** Toda mutação passa por `assertCan()` **e** por RLS. Nunca só um dos dois.
- **Alçada.** `restrictions.max_amount` bloqueia aprovação acima do limite mesmo com `approve: true`.
- **Toda negação é registrada** em `activity_log` — negação repetida é sinal de bug de UI ou de ataque.

### 7.4 Rate limiting

Três camadas: borda (proxy), aplicação (Server Action/Route Handler) e banco (constraints).

| Alvo | Chave | Limite | Onde |
|---|---|---|---|
| Login | IP + e-mail | 5 / 15 min | Middleware |
| Recuperação de senha | e-mail | 3 / hora | Server Action |
| OTP do SAC | e-mail | 3 / hora | Edge Function |
| OTP do SAC | IP | 10 / hora | Edge Function |
| Formulário público do SAC | IP | 5 / hora | Edge Function |
| Formulário público do SAC | e-mail | 3 / dia | Edge Function |
| Convite | organização | 50 / dia | Server Action |
| API autenticada (geral) | `userId` | 300 / min | Wrapper de Route Handler |
| Mutação de escrita | `userId` + recurso | 30 / min | Server Action |
| Chamada de IA | `organizationId` | conforme plano (§5.22) | `lib/ai/byok.ts` |
| Chamada de IA | `userId` | 60 / hora | `lib/ai/byok.ts` |
| Prospecção por IA | `organizationId` | conforme plano; máx. 5 jobs simultâneos | Server Action |
| Exportação | `userId` | 10 / hora | Route Handler |
| Upload | `userId` | 100 arquivos / hora, 500 MB / dia | Route Handler |
| Webhook de workflow | `token` | `max_executions_per_hour` do workflow | Route Handler |

Implementação com `@upstash/ratelimit` (sliding window). Resposta `429` com `Retry-After`. Estouro
repetido gera evento no Sentry e notificação ao `admin` da organização.

```ts
// src/lib/security/rate-limit.ts
const limiters = new Map<string, Ratelimit>();
export async function rateLimit(key: string, opts: { limit: number; window: Duration }) {
  const limiter = getLimiter(opts);
  const { success, reset, remaining } = await limiter.limit(key);
  if (!success) throw new RateLimitError(reset);
  return { remaining };
}
```

> Se o Redis estiver indisponível, o comportamento é **fail-open com log de alerta** nas rotas autenticadas
> (não derrubar o produto por um cache) e **fail-closed** nas rotas públicas de login/OTP (onde o rate limit
> é o próprio controle de segurança). Essa assimetria é deliberada.

### 7.5 Validação de entrada

**Zod em toda fronteira**, sem exceção: Server Actions, Route Handlers, Edge Functions, webhooks, variáveis
de ambiente e resposta de IA.

```ts
// modules/helpdesk/schemas/ticket.ts — o MESMO schema no formulário e no servidor
export const createTicketSchema = z.object({
  title:       z.string().trim().min(3).max(300),
  description: z.string().trim().min(1).max(20_000),
  department:  z.enum(DEPARTMENTS),
  priority:    z.enum(TICKET_PRIORITIES).default('medium'),
  categoryId:  z.string().uuid().optional(),
  assetId:     z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  // organizationId NÃO existe aqui — vem do contexto, sempre
});
```

| Fronteira | Controle |
|---|---|
| Server Action | `schema.parse(input)` antes de qualquer outra coisa (passo 3 do §6.4) |
| Route Handler | `schema.parse(await req.json())`, com limite de tamanho de corpo |
| Webhook | **Verificação de assinatura primeiro** (Stripe `stripe-signature`, Resend/Meta HMAC), depois o schema |
| Variáveis de ambiente | `config/env.ts` valida no boot; variável faltando derruba o build, não a produção |
| Resposta de IA | Toda saída estruturada valida contra Zod; falha → retry com mensagem de correção, depois erro |
| Campos dinâmicos | `ticket_form_fields.validation` gera o schema Zod em runtime, com allowlist de regras |
| Upload | Nome, extensão, MIME declarado, **magic bytes** e tamanho (§7.9) |
| Query string | Filtros, ordenação e paginação validados contra allowlist de colunas — nunca interpolados em SQL |

**Contra injeção:** o cliente Supabase parametriza tudo; nenhuma Server Action monta SQL por concatenação.
Onde há SQL cru (views, RPC), os parâmetros são tipados e a função é `SECURITY INVOKER` salvo justificativa.

**Sanitização de saída:** conteúdo em Markdown (POPs, comentários) é renderizado com allowlist de tags e
atributos, sem `dangerouslySetInnerHTML` de conteúdo de usuário. SVG enviado por usuário nunca é servido
inline.

### 7.6 Segredos e criptografia

| Segredo | Onde fica | Quem lê |
|---|---|---|
| Chave BYOK de IA | **Supabase Vault** (`vault.secrets`), referência em `ai_credentials.vault_secret_id` | Só Route Handler/Edge Function de IA, via `service_role` |
| Token OAuth de rede social | Vault, referência em `mkt_social_account_secrets` | Só o worker de publicação |
| Chave de licença de software | Coluna criptografada (AES-256-GCM, chave em env) | Server Action com `assertCan('licenses','view')` |
| Dados bancários de colaborador | `hr_employees.bank_data` criptografado na aplicação | RH com permissão explícita |
| `service_role`, Stripe secret, Resend key | Variáveis de ambiente da Vercel/Supabase | Runtime do servidor |
| Token de convite / OTP / webhook | **Só o hash** no banco | Comparação por hash |

**Regras:**

1. Nenhum segredo em `NEXT_PUBLIC_*`. O lint falha se uma variável com nome sugestivo de segredo tiver
   esse prefixo.
2. Nenhum segredo trafega para o client, nem parcialmente. A UI mostra `key_last4`, e só.
3. Rotação: chave de aplicação com versionamento (`v1:`, `v2:` no prefixo do ciphertext) para permitir
   rotação sem downtime.
4. Segredo em log é incidente: o logger tem *scrubbing* por lista de chaves (`apiKey`, `password`, `token`,
   `authorization`, `cpf`, `cnpj`, `bank_data`) antes de qualquer saída (§9.2).

```ts
// src/lib/ai/byok.ts — a chave nunca sai desta função
export async function callTenantAI(orgId: string, opts: AICallOptions): Promise<AIResult> {
  const cred = await loadCredential(orgId);            // admin client + vault
  if (!cred) throw new AIError('no_ai_credentials');
  const provider = getProvider(cred.provider);
  try {
    return await provider.call(cred.apiKey, opts);     // a chave existe só neste escopo
  } finally {
    scrub(cred);                                       // limpa a referência
  }
}
```

### 7.7 Segurança do assistente de IA

O assistente executa ações reais no sistema. As defesas, em camadas:

| Camada | Controle |
|---|---|
| **Escopo de identidade** | Ferramentas executam com a identidade do usuário; passam por `can()` e por RLS. A IA nunca recebe `service_role` |
| **Confirmação humana** | Ferramentas de escrita retornam proposta; a mutação só ocorre após o clique do usuário |
| **Separação de canais** | O conteúdo trazido por ferramentas (chamado, POP, e-mail) entra no prompt marcado como **dado não confiável**, com instrução explícita de nunca ser interpretado como comando |
| **Guard de entrada** | Padrões de injeção conhecidos (tentativa de extrair system prompt, credencial, ou de assumir outro papel) são detectados antes da chamada |
| **Bloqueio progressivo** | 1ª violação 5 min · 2ª 24 h · 3ª permanente até revisão de admin (`ai_security_blocks`, §5.20.4) |
| **Saída estruturada** | Resposta de ferramenta valida contra Zod; nada de `eval`, nada de SQL gerado por IA executado |
| **Sem dado sensível no prompt** | Salário, CPF, dado bancário e CID são removidos do contexto antes de ir ao provedor, salvo se o usuário tiver permissão **e** a feature exigir |
| **Auditoria** | Toda execução de ferramenta grava `activity_log` com `actor_type='ai'` e `conversation_id` |
| **Custo** | Cota por plano, limite por usuário/hora, teto opcional por organização (`monthly_token_limit`) |

> **Nota importante:** as defesas contra prompt injection são mitigação, não garantia. Por isso a arquitetura
> não depende delas: mesmo que a injeção passe, a ferramenta continua limitada pelo RBAC e pelo RLS do
> usuário. **A segurança vem do escopo, não do prompt.**

### 7.8 Sessão, cabeçalhos e proteções de navegador

| Controle | Configuração |
|---|---|
| Cookies | `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`; domínio por organização (não compartilhado entre subdomínios) |
| CSRF | Server Actions do Next validam origem e token automaticamente; Route Handlers de mutação exigem `Origin` da mesma origem |
| CSP | `default-src 'self'`; `script-src 'self' 'nonce-{...}'`; `img-src 'self' data: blob: {storage}`; `connect-src 'self' {supabase} {upstash} {sentry}`; `frame-ancestors 'none'`; sem `unsafe-inline` |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| Outros | `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `X-Frame-Options: DENY` · `Permissions-Policy` restritiva (geolocation apenas nas rotas de visita) |
| CORS | API sem CORS aberto. Webhooks validam assinatura, não origem |
| Clickjacking | `frame-ancestors 'none'` — o painel nunca é embutido |
| Cache | Toda resposta com dado de tenant marcada `private, no-store`. Nenhum dado de organização em cache de CDN |

> **Geolocalização** é solicitada apenas nas rotas de visita do CRM, com justificativa exibida ao usuário —
> e a `Permissions-Policy` a bloqueia no resto do app.

### 7.9 Upload e armazenamento de arquivos

**Buckets, todos privados:**

| Bucket | Conteúdo | Observação |
|---|---|---|
| `attachments` | Anexos de chamados, tarefas, SAC, CRM | Privado; URL assinada de 5 min |
| `documents` | RH, contratos, laudos, notas fiscais | Privado; auditoria de download |
| `media` | Imagens de POPs, marketing, produtos | Privado; servido via proxy com cache |
| `branding` | Logo e ícone da organização | **Único público**, e só depois de validação de imagem |
| `exports` | Relatórios gerados | Privado; expira em 7 dias |

**Caminho obrigatório:** `org/{organization_id}/{scope}/{entity_id}/{uuid}-{slug}.{ext}`.
O `organization_id` no início do path é o que permite a policy de storage:

```sql
create policy "attachments_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_org_member(((storage.foldername(name))[2])::uuid)
  );

create policy "attachments_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'org'
    and public.is_org_member(((storage.foldername(name))[2])::uuid)
    and public.is_allowed_extension(name)
  );
```

**Validação em quatro pontos** (o mesmo arquivo é checado quatro vezes, de propósito):

1. **Client** — extensão e tamanho, para dar erro rápido.
2. **Server Action** — allowlist de MIME, tamanho, e leitura dos **magic bytes** (não confiar na extensão
   nem no `Content-Type` declarado).
3. **Policy de storage** — extensão e caminho.
4. **`CHECK` da tabela `files`** — MIME e tamanho (§5.8).

**Regras adicionais:** nome de arquivo é normalizado (sem `../`, sem caractere de controle, sem unicode
enganoso); download sempre com `Content-Disposition: attachment` exceto imagem em contexto conhecido; SVG
enviado por usuário é convertido para PNG ou servido como download; e um scan antivírus (ClamAV em job
assíncrono) marca o arquivo como `quarantined` até a liberação, para os buckets `documents` e `attachments`.

### 7.10 LGPD e privacidade

| Requisito | Implementação |
|---|---|
| **Base legal** | Registrada por finalidade: contrato (staff), legítimo interesse (prospecção B2B), consentimento (marketing) — `crm_contacts.opted_in_at`, `consent_source` |
| **Minimização** | Prospecção por IA coleta dado **público de empresa**. Dado pessoal só o necessário para contato profissional |
| **Direito de acesso** | Exportação completa dos dados de um titular em JSON+CSV, por RPC, disponível ao `admin` |
| **Direito de exclusão** | Anonimização (não `DELETE`): nome → "Usuário removido", e-mail → hash, CPF/telefone/endereço → null. O histórico transacional permanece (obrigação legal e integridade contábil) |
| **Dados sensíveis** | CID (`hr_absences.cid_code`) e dados de saúde: permissão explícita `hr.medical.view`, e **toda leitura** gera `activity_log` com `action='viewed'` |
| **Retenção** | Declarada por tabela (§5.24) |
| **Encarregado (DPO)** | Campo em `organization_settings` e canal de contato no rodapé do portal |
| **Sub-processadores** | Lista pública: Supabase, Vercel, Resend, Stripe, Upstash, Sentry, provedor de IA escolhido pelo cliente |
| **Incidente** | Runbook com prazo de comunicação, template de notificação e trilha em `activity_log` (§8.9) |
| **Transferência internacional** | Banco em `sa-east-1` (Brasil). Provedor de IA é escolha da organização, declarada na tela de configuração |

### 7.11 Checklist de segurança por PR

Bloqueante no CI e na revisão:

- [ ] Toda tabela nova tem `organization_id`, RLS `enable` + `force` e 4 policies.
- [ ] Toda tabela nova tem arquivo de teste pgTAP provando isolamento (§3.8).
- [ ] Toda FK entre tabelas de tenant é **composta** com `organization_id` (§4.4).
- [ ] Toda Server Action começa por `getOrgContext()` e chama `assertCan()`.
- [ ] Nenhum `organization_id` vem do input do usuário.
- [ ] Nenhum novo import de `lib/supabase/admin` fora dos caminhos permitidos.
- [ ] Toda entrada validada por Zod; nenhum `any` novo.
- [ ] Nenhum segredo em `NEXT_PUBLIC_*`, em log ou em mensagem de erro exposta.
- [ ] Mutação relevante grava `activity_log`.
- [ ] Endpoint público novo tem rate limit declarado.
- [ ] `supabase db lint` e `get_advisors` sem alerta novo de segurança.

---
## 8. PLANO DE DEPLOY

### 8.1 Ambientes

| Ambiente | App | Banco | Domínio | Dados |
|---|---|---|---|---|
| **Local (sem Docker)** | `next dev` | Projeto **`test-helpoint`** (sa-east-1) | `localhost:3000` | `npm run db:test:setup` + fixtures |
| **Local (com Docker)** | `next dev` | Supabase CLI local | `*.localhost:3000` | `supabase db reset` → `seed.sql` |
| **CI** | GitHub Actions | Supabase CLI local (Docker do runner) | — | `db reset` a cada execução |
| **Preview** | Vercel Preview (por PR) | Supabase Branch efêmero | `pr-{n}.preview.helpoint.com.br` | Seed de demonstração |
| **Produção** | Vercel (branch `main`) | Projeto **`helpoint-saas`** (sa-east-1) | `helpoint.com.br` + `*.helpoint.com.br` + domínios de clientes | Real |

**Dois projetos Supabase, papéis distintos:**

| Projeto | Ref | Papel |
|---|---|---|
| `test-helpoint` | `gmvvxulubthkagmsngas` | Desenvolvimento e testes. É onde as migrations são validadas primeiro e de onde os tipos são gerados |
| `helpoint-saas` | `joafqgmiirggohxkomrl` | **Produção.** Só recebe `db push`. Nunca é alvo de script de teste — o `db-test-setup` aborta se a URL contiver este ref |

> **Docker deixou de ser pré-requisito local.** A suíte pgTAP roda contra o `test-helpoint`, então o
> requisito de §7.11 (teste de isolamento bloqueante) continua satisfeito sem Docker na máquina do
> desenvolvedor. O Docker segue necessário para `supabase db reset` — e é o que o CI usa, o que garante
> que as migrations continuam aplicáveis do zero. Quem tiver Docker ganha o laço mais rápido; quem não
> tiver, não fica bloqueado.

**Sobre subdomínio em desenvolvimento:** `*.localhost` **não resolve no Windows**. Testar
multi-tenancy por subdomínio localmente exige entrada no arquivo `hosts` ou Docker com DNS próprio. Por
isso o guarda do §3.3 contra vazamento do `organization_id` é um **teste unitário do proxy**, e não E2E:
o E2E local nunca resolve organização nenhuma e passaria mesmo com o defeito presente.

**Wildcard de subdomínio** é requisito, não detalhe: sem `*.helpoint.com.br` apontado para a Vercel, a
resolução de tenant por subdomínio (§3.3) não funciona. Configurado no dia 1, inclusive em staging — testar
multi-tenancy em `localhost:3000` sem subdomínio esconde exatamente a classe de bug que mais importa.

Desenvolvimento local usa `*.localhost` (resolvido nativamente pelos navegadores modernos):
`acme.localhost:3000` funciona sem editar `/etc/hosts`.

### 8.2 Variáveis de ambiente

```bash
# ─────────── Público (exposto ao browser) ───────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ROOT_DOMAIN=helpoint.com.br
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SENTRY_DSN=

# ─────────── Servidor (NUNCA com prefixo NEXT_PUBLIC_) ───────────
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                      # migrations e jobs
APP_ENCRYPTION_KEY=                # AES-256 para colunas cifradas (v1:...)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
EMAIL_FROM=nao-responda@helpoint.com.br
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
TURNSTILE_SECRET_KEY=
VERCEL_DOMAINS_TOKEN=              # provisionamento de domínio customizado
CRON_SECRET=                       # autentica as rotas /api/cron/*
SENTRY_AUTH_TOKEN=
```

Validadas no boot por Zod (`src/config/env.ts`). Variável faltando **derruba o build**, não a produção:

```ts
export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),
    APP_ENCRYPTION_KEY:        z.string().length(64),
    STRIPE_WEBHOOK_SECRET:     z.string().startsWith('whsec_'),
    CRON_SECRET:               z.string().min(32),
    // ...
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_ROOT_DOMAIN:  z.string().min(3),
  },
});
```

### 8.3 Estratégia de migrations

**Regra absoluta: o schema muda apenas por arquivo em `supabase/migrations/`, revisado em PR.**
Nenhuma alteração pelo dashboard, em nenhum ambiente — inclusive local.

```
Desenvolvedor escreve a migration
        ↓
supabase db reset (local)  → aplica tudo do zero + seed
        ↓
supabase test db           → pgTAP: RLS, triggers, RPC
        ↓
npm run gen:types          → regenera types.generated.ts
        ↓
PR → CI cria Supabase Branch, aplica migrations, roda testes, publica preview
        ↓
Merge em main → deploy-production.yml → supabase db push → deploy Vercel
```

**Migrations expand/contract** — obrigatório para qualquer mudança destrutiva, porque durante um deploy a
versão antiga e a nova do app coexistem por alguns segundos:

| Fase | O que faz | Quando |
|---|---|---|
| **Expand** | Adiciona coluna nova (nullable), cria índice `CONCURRENTLY`, duplica dado | Deploy N |
| **Migrate** | App escreve nas duas, lê da nova | Deploy N |
| **Contract** | Remove a coluna antiga, aplica `NOT NULL` | Deploy N+1, dias depois |

Nunca renomear ou remover coluna no mesmo deploy que altera o código. Nunca `ALTER TYPE ... DROP VALUE`.
Índice em tabela grande sempre `CREATE INDEX CONCURRENTLY` (fora de transação, em migration própria).

**Rollback de banco:** `supabase migration repair` só corrige o histórico. Para reverter dado, o caminho é
**forward fix** (uma migration nova que desfaz) ou PITR (§8.8). Toda migration destrutiva exige backup
manual verificado antes do merge — passo explícito no checklist do PR.

### 8.4 CI — `ci.yml`

```yaml
name: CI
on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run check:imports        # regras de dependência (§6.5)
      - run: npm run test:unit -- --coverage

  database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset            # aplica TODAS as migrations do zero
      - run: supabase db lint --level warning
      - run: supabase test db             # pgTAP: RLS + triggers + RPC
      - run: npm run gen:types && git diff --exit-code src/lib/supabase/types.generated.ts
      - run: npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx playwright install --with-deps chromium
      - run: supabase start && supabase db reset
      - run: npm run build
      - run: npm run test:e2e

  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci && npm run build
      - run: docker build -f docker/Dockerfile .   # valida a imagem da Fase 2 desde já
```

**O passo `git diff --exit-code` nos tipos gerados é o que mata a dívida §1.4.3:** se alguém alterou o
schema e não regenerou os tipos, o CI reprova.

### 8.5 Deploy de produção — `deploy-production.yml`

```yaml
name: Deploy Production
on:
  push: { branches: [main] }
concurrency: { group: production, cancel-in-progress: false }

jobs:
  migrate:
    environment: production        # exige aprovação manual no GitHub
    steps:
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      - run: supabase db push --linked
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}

  deploy:
    needs: migrate
    steps:
      - run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}

  verify:
    needs: deploy
    steps:
      - run: npm run smoke:production      # health, login, criar+ler chamado, isolamento
      - name: Rollback automático se falhar
        if: failure()
        run: vercel rollback --token=${{ secrets.VERCEL_TOKEN }}
```

**Ordem importa: migration antes do deploy do app.** Como as migrations são expand-only (§8.3), o app antigo
continua funcionando com o schema novo durante a janela. O inverso — app novo com schema velho — quebra.

**Rollback:** o app volta em segundos (`vercel rollback`, deployment imutável). O banco **não** volta: por
isso migrations são aditivas. Um deploy ruim é revertido no app; o schema segue adiante.

### 8.6 Jobs agendados

Dois mecanismos, com critério claro:

| Mecanismo | Usar quando | Exemplos |
|---|---|---|
| **Vercel Cron** → `/api/cron/*` | O job precisa da lógica de negócio em TypeScript | Varredura de SLA, alertas de vencimento, recálculo de metas, `refresh` de materialized views, expurgo |
| **`pg_cron` + `pg_net`** → Edge Function | O job nasce do banco ou precisa rodar mesmo com o app fora do ar | Criação de partições, consumo de `job_queue`, publicação social agendada |

```jsonc
// vercel.json
{ "crons": [
  { "path": "/api/cron/sla-scan",        "schedule": "*/5 * * * *"  },
  { "path": "/api/cron/queue-worker",    "schedule": "* * * * *"    },
  { "path": "/api/cron/alerts",          "schedule": "0 8 * * *"    },
  { "path": "/api/cron/metrics-refresh", "schedule": "7 * * * *"    },
  { "path": "/api/cron/targets-recalc",  "schedule": "0 * * * *"    },
  { "path": "/api/cron/retention",       "schedule": "0 3 * * *"    },
  { "path": "/api/cron/domain-verify",   "schedule": "0 4 * * *"    }
]}
```

Toda rota de cron valida `Authorization: Bearer ${CRON_SECRET}`, é **idempotente** (rodar duas vezes não
duplica efeito) e registra início/fim/erro em `job_queue` ou `activity_log`.

### 8.7 Domínios, DNS e SSL

**Fase 1 (Vercel):**

| Item | Configuração |
|---|---|
| Apex | `helpoint.com.br` → Vercel (A/ALIAS) |
| Wildcard | `*.helpoint.com.br` → Vercel (CNAME) — **essencial** para o multi-tenant |
| SSL | Certificado automático da Vercel, incluindo wildcard |
| Domínio customizado do cliente | Cliente cria `CNAME → cname.vercel-dns.com` + `TXT _helpoint-verify`; após a verificação, o domínio é adicionado ao projeto via Vercel Domains API e o certificado é emitido automaticamente |
| Redirecionamentos | `www` → apex; HTTP → HTTPS; domínio antigo → novo |

**Fase 2 (VPS + Cloudflare):** ver §8.10.

### 8.8 Backup e recuperação

| Item | Fase 1 | Verificação |
|---|---|---|
| Backup do banco | Diário automático (Supabase) + **PITR** de 7 dias (plano Pro) | **Restauração testada mensalmente** em projeto descartável |
| Backup lógico | `pg_dump` semanal para bucket externo (retenção 90 dias) | Checksum + restauração trimestral |
| Storage | Replicação do provedor + cópia semanal dos buckets `documents` e `attachments` | Amostragem mensal |
| Segredos | Cofre da equipe (1Password/Bitwarden), com procedimento de rotação documentado | Semestral |
| Código | GitHub + tags de release | — |

**Metas declaradas:** **RPO ≤ 5 min** (PITR) · **RTO ≤ 2 h** (restauração completa).

> Um backup nunca restaurado não é um backup. O teste mensal de restauração é um item do runbook, com
> responsável e registro — não uma intenção.

### 8.9 Runbook — incidentes

| Situação | Ação imediata | Depois |
|---|---|---|
| Deploy quebrou produção | `vercel rollback` (segundos) | Post-mortem; teste que teria pego |
| Migration ruim | Forward fix; se houver perda de dado, PITR para o instante anterior | Revisar por que passou no CI |
| Vazamento cross-tenant suspeito | **Desativar o endpoint afetado**, auditar `activity_log`, notificar afetados | pgTAP reproduzindo o caso; comunicação LGPD se confirmado |
| Banco em 100% de CPU | Identificar por `pg_stat_statements`, matar a consulta, subir o compute | Índice ou consulta corrigida; avaliar gatilho da Fase 2 |
| Storage/egress explodindo | Verificar hotlink e loop de download; ativar limite | Avaliar migração para R2 |
| Provedor de IA fora do ar | Fallback para o `fallback_model`/provedor secundário; degradar sem quebrar a UI | Revisar timeouts |
| Stripe webhook falhando | Reprocessar por `billing_events` (idempotente, §5.22) | Alertar antes de suspender qualquer organização |
| Fila travada | Inspecionar `job_queue` com `status='running'` e `locked_at` antigo; liberar lock | Corrigir o worker; ajustar `max_attempts` |
| Suspeita de conta comprometida | Invalidar sessões do usuário, forçar troca de senha, revisar `activity_log` | MFA obrigatório para o papel |

Severidades: **SEV1** (produção fora, ou vazamento) — resposta imediata, comunicação em 1 h.
**SEV2** (módulo degradado) — mesmo dia. **SEV3** (defeito isolado) — próximo ciclo.
Todo SEV1/SEV2 gera post-mortem sem culpados, com ação corretiva rastreada.

### 8.10 Evolução para alta escala (Fase 2)

Executada quando um gatilho do §2.4.1 se sustentar por ~30 dias.

#### 8.10.1 Docker

```dockerfile
# docker/Dockerfile — multi-stage; usado em produção na Fase 2, validado no CI desde a Fase 1
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm ci && npm run build          # next.config.ts: output: 'standalone'

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

```yaml
# docker/docker-compose.yml
services:
  app:
    image: ghcr.io/${ORG}/helpoint:${TAG}
    env_file: .env.production
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_started } }
    deploy: { replicas: 2 }
    restart: unless-stopped

  worker:
    image: ghcr.io/${ORG}/helpoint:${TAG}       # mesma imagem, comando diferente
    command: ["node", "server.js", "--worker"]
    env_file: .env.production
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment: { POSTGRES_DB: helpoint, POSTGRES_USER: helpoint }
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U helpoint"], interval: 10s, retries: 5 }
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "allkeys-lru"]
    volumes: [redisdata:/data]
    restart: unless-stopped

  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/helpoint.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on: [app]
    restart: unless-stopped

  backup:
    image: postgres:17-alpine
    entrypoint: ["/bin/sh", "/backup.sh"]        # pg_dump → R2, diário, com verificação
    volumes: ["./scripts/backup.sh:/backup.sh:ro"]
    restart: unless-stopped

volumes: { pgdata: {}, redisdata: {} }
```

#### 8.10.2 Nginx

```nginx
# docker/nginx/helpoint.conf
limit_req_zone  $binary_remote_addr zone=general:20m rate=30r/s;
limit_req_zone  $binary_remote_addr zone=auth:10m    rate=1r/s;
limit_conn_zone $binary_remote_addr zone=conn:10m;

upstream helpoint_app { least_conn; server app:3000 max_fails=3 fail_timeout=20s; keepalive 64; }

server {                       # redireciona HTTP e responde ao ACME
  listen 80 default_server;
  server_name _;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl;
  http2 on;
  server_name helpoint.com.br *.helpoint.com.br;     # wildcard cobre todos os tenants

  ssl_certificate     /etc/nginx/certs/fullchain.pem;   # Cloudflare Origin Certificate
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_session_cache   shared:SSL:20m;

  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options    "nosniff" always;
  add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

  client_max_body_size 100m;                 # limite de upload (§5.8)
  limit_conn conn 40;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  location /_next/static/ {                  # assets imutáveis
    proxy_pass http://helpoint_app;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location ~ ^/(login|api/auth|sac/entrar) { # rotas sensíveis: limite estrito
    limit_req zone=auth burst=5 nodelay;
    proxy_pass http://helpoint_app;
    include /etc/nginx/proxy_params;
  }

  location /api/ai/ {                        # streaming SSE: sem buffer, timeout longo
    proxy_pass http://helpoint_app;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    include /etc/nginx/proxy_params;
  }

  location / {
    limit_req zone=general burst=60 nodelay;
    proxy_pass http://helpoint_app;
    include /etc/nginx/proxy_params;
  }
}
```

```nginx
# /etc/nginx/proxy_params — o Host original é o que carrega o tenant
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_redirect off;
```

> **Ponto crítico:** `proxy_set_header Host $host` (e não `$proxy_host`). Perder o host original quebra a
> resolução de tenant do §3.3 — e o sintoma é "todo mundo cai na organização errada".

### 8.11 SSL na Fase 2

- **Cloudflare na frente**, modo *Full (strict)*. A Cloudflare emite o certificado de borda para
  `*.helpoint.com.br` (incluído no plano gratuito) e a VPS usa um **Origin Certificate** de 15 anos.
  Isso evita o desafio DNS-01 do Let's Encrypt para wildcard, que é a parte chata de operar.
- **Domínios customizados de clientes** não passam pelo wildcard: cada um recebe certificado Let's Encrypt
  via `certbot` com desafio HTTP-01, emitido **após** a verificação DNS (§3.3.2). Renovação automática, com
  alerta 20 dias antes do vencimento.
- Cloudflare também fornece a primeira camada de proteção (WAF, bot fight, rate limit de borda), antes do
  Nginx e do Redis da aplicação.

### 8.12 CI/CD na Fase 2

```
push em main
   → CI (idêntico à Fase 1)
   → build da imagem Docker → push para GHCR com tag = SHA
   → SSH na VPS: docker compose pull && docker compose up -d --no-deps --scale app=2 app
     (rolling: sobe a nova réplica, healthcheck passa, derruba a antiga)
   → migrations aplicadas ANTES, por um job dedicado (mesma regra expand/contract)
   → smoke test → rollback para a tag anterior se falhar
```

Alternativa operacional recomendada: **Coolify** ou **Dokploy** na VPS, para ganhar painel de deploy,
rollback e logs sem construir tudo à mão. Vale a pena a menos que haja alguém dedicado a infraestrutura.

### 8.13 Custos estimados

| Fase | Itens | Ordem de grandeza mensal |
|---|---|---|
| **Fase 1 — início** | Vercel Pro, Supabase Pro, Upstash, Resend, Sentry, domínio | **US$ 80–150** |
| **Fase 1 — crescimento** | + compute add-on do Supabase, mais storage/egress, Stripe | **US$ 250–600** |
| **Fase 2 — alta escala** | VPS (8–16 vCPU, 32–64 GB), Cloudflare, R2, Resend, Sentry | **US$ 150–400 + operação** |

A Fase 2 é mais barata em infraestrutura e mais cara em **tempo de gente**. O gatilho econômico do §2.4.1
compara os dois lados — não apenas a fatura.

---
## 9. OBSERVABILIDADE E QUALIDADE

### 9.1 O que medimos

| Camada | Ferramenta | O que responde |
|---|---|---|
| Erros de aplicação | **Sentry** (browser + server + Edge) | "O que quebrou, para quem, em qual organização" |
| Performance web | **Vercel Analytics** + Speed Insights | LCP, INP, CLS por rota |
| Banco | **Supabase Logs** + `pg_stat_statements` | Consultas lentas, locks, conexões |
| Segurança do schema | **`get_advisors`** no CI e diariamente | Tabela sem RLS, função sem `search_path`, índice faltando em FK |
| Negócio | Views e materialized views (§5.23) | SLA, funil, metas, ruptura, custo de IA |
| Disponibilidade | Monitor externo (Better Stack/Upptime) | Uptime do apex, de um subdomínio de tenant e de `/api/health` |
| Fila | Consulta a `job_queue` + alerta | Backlog, jobs `dead`, tempo médio |

### 9.2 Logs estruturados

JSON, um evento por linha, com contexto obrigatório e **scrubbing de segredos** (§7.6):

```ts
// src/lib/observability/logger.ts
log.info('ticket.created', {
  requestId, organizationId, userId,
  entity: 'ticket', entityId, durationMs, source: 'server-action',
});
```

Campos obrigatórios em todo log de servidor: `requestId`, `organizationId`, `userId`, `route`, `durationMs`.
Sem `organizationId`, um erro em produção é impossível de investigar em um sistema multi-tenant.

**Nunca logar:** senha, token, chave de API, CPF/CNPJ completo, dado bancário, CID, conteúdo de mensagem de
IA (só metadados: tokens, latência, feature).

O `requestId` nasce no proxy, viaja por header, entra em toda Server Action e é gravado em
`activity_log.context` — permitindo cruzar erro do Sentry com a ação de negócio correspondente.

### 9.3 Alertas

| Alerta | Condição | Canal | Severidade |
|---|---|---|---|
| Taxa de erro | > 1% das requisições em 5 min | Sentry → Slack/e-mail | SEV1 |
| Erro novo em produção | Primeira ocorrência de uma issue | Sentry | SEV2 |
| Latência p95 | > 2 s em rota crítica por 10 min | Vercel → Slack | SEV2 |
| CPU do banco | > 80% por 15 min | Supabase | SEV2 |
| Fila travada | `job_queue` com > 500 `queued` ou algum `dead` | Cron → Slack | SEV2 |
| Webhook Stripe falhando | Qualquer falha de processamento | Sentry | SEV1 |
| SLA em massa | > 10 chamados violados na mesma hora | Cron → admin do tenant | SEV3 |
| Advisor de segurança | Qualquer alerta novo | CI | Bloqueia merge |
| Custo de IA | Organização > 80% da cota | In-app + e-mail ao admin | SEV3 |
| Certificado expirando | < 20 dias | Monitor | SEV2 |
| Backup falhou | Qualquer falha | Monitor | SEV1 |

### 9.4 Estratégia de testes

```
        ╱╲          E2E (Playwright) — ~20 fluxos críticos
       ╱──╲         Integração — Server Actions contra Supabase local
      ╱────╲        RLS (pgTAP) — uma suíte por tabela, OBRIGATÓRIA
     ╱──────╲       Unidade (Vitest) — modules/*/domain/**
```

| Nível | Cobre | Meta | Bloqueia merge |
|---|---|---|---|
| **Unidade** | Toda `domain/`: SLA, folha, comissão, precificação, máquina de estados, validadores | ≥ 90% em `domain/` | Sim |
| **RLS (pgTAP)** | Isolamento por tabela + policies não triviais + triggers de integridade | 100% das tabelas com `organization_id` | Sim |
| **Integração** | Server Actions: validação, autorização, persistência, auditoria, evento | Caminho feliz + 2 de erro por action crítica | Sim |
| **E2E** | Fluxos ponta a ponta com dois tenants simultâneos | ~20 cenários | Sim |
| **Visual** | Componentes de `components/ui` | Opcional | Não |

**Cenários E2E obrigatórios** (a lista mínima):

1. Cadastro → criação de organização → onboarding semeado.
2. Convite → aceite → primeiro login → acesso conforme perfil.
3. **Isolamento:** dois tenants no mesmo teste; A não vê nada de B, em nenhuma tela.
4. Abertura de chamado com formulário dinâmico → SLA calculado → atribuição → resolução → avaliação.
5. Checklist obrigatório bloqueia o fechamento.
6. POP: criar → publicar → buscar (texto e semântica) → vincular a chamado → feedback.
7. RH: solicitar férias → aprovar → refletir no saldo.
8. Folha: calcular → conferir memória → aprovar → gerar contas a pagar.
9. Financeiro: importar extrato → conciliar → não duplicar na reimportação.
10. Compra: requisitar → cotar → aprovar por alçada → gerar lançamento.
11. **CRM:** criar conta → oportunidade → avançar estágio → ganhar → gerar pedido → faturar → conferir
    `fin_entries` gerados.
12. CRM: visita com check-in geolocalizado → pesquisa de PDV → check-out → indicador de ruptura.
13. CRM: prospecção por IA → curadoria → aprovar → virar lead → converter em conta.
14. SAC: abertura anônima → protocolo por e-mail → login OTP → acompanhamento → **não** ver comentário interno.
15. SAC + Qualidade: reclamação com lote → laudo → chamado não fecha sem laudo aprovado.
16. Workflow: criar no canvas → ativar → disparar por evento → conferir execução passo a passo.
17. Billing: limite de seats bloqueia convite → upgrade → desbloqueia.
18. Permissões: usuário `viewer` não consegue criar; botão escondido **e** action recusa.
19. Domínio customizado: verificação DNS → acesso pelo domínio próprio.
20. Assistente de IA: pergunta → ferramenta de leitura → proposta de escrita → confirmação → auditoria.

**Dados de teste:** `tests/fixtures/` cria duas organizações completas com usuários de todos os papéis.
Nenhum teste depende de dado de produção. O E2E de isolamento é o mais importante da suíte — se ele quebrar,
nada mais entra em produção.

### 9.5 Definition of Done (por módulo)

Um módulo só é considerado pronto quando **todos** os itens estão marcados:

- [ ] Migrations aplicadas, revisadas e com `db reset` do zero funcionando.
- [ ] RLS `enable` + `force` com 4 policies em cada tabela.
- [ ] Suíte pgTAP de isolamento passando para cada tabela.
- [ ] `domain/` com ≥ 90% de cobertura de teste unitário.
- [ ] Server Actions seguindo os 10 passos do §6.4.
- [ ] Auditoria (`activity_log`) em toda mutação relevante.
- [ ] Notificações e eventos de domínio emitidos.
- [ ] Estados de UI completos: carregando, vazio, erro, sem permissão, offline.
- [ ] Responsivo e navegável por teclado; contraste AA.
- [ ] Textos em `i18n/pt-BR`.
- [ ] Paginação keyset em toda lista.
- [ ] Exportação (CSV/PDF) quando o módulo substitui uma planilha (princípio "Zero Planilhas").
- [ ] Ao menos um cenário E2E.
- [ ] Documentação da seção correspondente deste arquivo atualizada, se algo divergiu.

### 9.6 Acessibilidade e desempenho

| Item | Meta |
|---|---|
| Contraste | WCAG AA (4.5:1) — a estética escura e densa **não** é desculpa |
| Teclado | Todo fluxo operável sem mouse; foco visível; atalhos nas telas de alto uso (fila de chamados, funil) |
| Leitores de tela | Landmarks, `aria-label` em ícone sem texto, anúncio de mudança de estado |
| LCP | < 2,5 s em 4G na rota de listagem |
| INP | < 200 ms |
| JS por rota | < 200 KB gzip (RSC por padrão; `use client` só onde há interatividade) |
| Tabelas grandes | Virtualização acima de 100 linhas |

---

## 10. ROADMAP DE IMPLEMENTAÇÃO

Ordem de construção com dependências explícitas. Cada fase termina em algo **utilizável**, não em
"infraestrutura pronta". As durações são referência para uma pessoa trabalhando com Claude Code.

### Portão de QA — como uma fase fecha

Nenhuma fase fecha só com os testes verdes. Teste prova **comportamento**; conformidade com este
documento não tem asserção que a pegue — "isto divergiu do §7.2" passa por qualquer suíte. O portão
existe para essa lacuna, e roda uma vez por fase:

```bash
npm run phase:review   # resolve o ponto fixo e imprime o que esta seção prometeu
```

| Passo | O quê | Bloqueia? |
|---|---|---|
| 1 | `npm run verify` e `npx playwright test` | sim |
| 2 | `code-review` contra a tag da fase anterior — eixo **Standards** (conformidade com este documento) e eixo **Spec** (o que a fase prometeu aqui) | violação dura, sim |
| 3 | `ponytail-review` no mesmo diff — o eixo de excesso | violação dura, sim |
| 4 | `ponytail-debt` — junta os adiamentos num registro só | não |
| 5 | `git tag fase-N` | — |

**Violação dura bloqueia; julgamento não.** Um achado de julgamento vira decisão explícita e
registrada, nunca silêncio. Adiar exige comentário `ponytail:` nomeando o teto e a saída — é o que o
passo 4 colhe.

A **tag por fase** é o que torna isso repetível. Sem ponto fixo confiável o `code-review` compara o
intervalo errado e devolve a sensação de ter revisado. `fase-0` = `d32ba36`.

### Fase 0 — Fundação (1–2 semanas)

Sem fundação correta, tudo depois fica torto.

1. Repositório Next.js 16 + TS strict + Tailwind + shadcn/ui; ESLint, Prettier, Vitest, Playwright.
2. Projeto Supabase; Supabase CLI local; `config/env.ts` validado.
3. Migrations do núcleo: extensões, enums, `organizations`, `users`, `memberships`, `access_profiles`,
   `activity_log`, `notifications`, `files`, `job_queue`, `sequences`.
4. Funções de segurança (`current_user_id`, `is_org_member`, `has_min_role`, …) + script de convenções (§4.4).
5. `proxy.ts` com resolução por subdomínio + cache; `getOrgContext()`; `rbac.ts`.
6. Helpers de teste pgTAP + suíte `_meta` + gerador de teste de RLS.
7. CI completo (§8.4); deploy em staging e produção funcionando com uma página em branco.
8. Wildcard DNS e SSL configurados nos três ambientes.

**Critério de saída:** duas organizações criadas manualmente, dois usuários, e o teste de isolamento
passando — com o app ainda praticamente vazio.

> **✅ Concluída em 2026-08-30**, mas não na primeira tentativa. A fase foi declarada pronta e a revisão
> de código encontrou **cinco defeitos bloqueantes**. Ficam registrados porque cada um é uma armadilha
> que volta:
>
> | Defeito | Lição |
> |---|---|
> | `proxy.ts` gravava `x-organization-*` na resposta, não na requisição | `NextResponse.next({request:{headers}})` congela os headers na construção. O app quebrava no Edge **e** o id vazava |
> | `revoke ... from anon` em funções era no-op | `EXECUTE` é concedido a `PUBLIC`, não a `anon` (§7.2.1) |
> | `seed.sql` usava um slug da lista de reservados | O `db reset` do CI falharia — a regra existia e foi violada pelo próprio seed |
> | Cabeçalho do `gen-types` divergia do arquivo gerado | Comparação de igualdade precisa de fonte única |
> | CI disparava em `main`, o branch era `master` | Job configurado nunca roda, e ninguém percebe |
>
> Os três primeiros só apareceram porque houve verificação **empírica** — chamada real à API e leitura
> do que o código realmente faz, não do que pretendia fazer. É por isso que a §9.4 exige provar que um
> teste falha antes de confiar que ele passa.

### Fase 1 — Identidade e shell (1–2 semanas)

9. Auth: login, cadastro, recuperação, MFA; guarda de sessão e de membership.
10. Onboarding: criação de organização com seed atômico; convites e aceite.
11. AppShell: sidebar declarativa por módulo/permissão, header, busca global, sino de notificações.
12. Configurações: organização, identidade visual, usuários, perfis de acesso, domínios.
13. Componentes base: `data-table`, `dynamic-form`, `file-upload`, `comments`, `activity-timeline`.
14. Auditoria e notificações ponta a ponta (in-app + e-mail via Resend).

**Critério de saída:** um admin cria a empresa, convida alguém, define permissões e vê o log de tudo.

> **✅ Concluída em 2026-08-31.** O portão pegou dois defeitos que suíte verde nenhuma pegaria, e
> ambos ficam registrados porque são armadilhas que voltam:
>
> | Defeito | Lição |
> |---|---|
> | Nada escrevia em `membership_access_profiles`: `inviteMember` não preenchia `access_profile_ids`, e `accept_invite` só percorre esse array | `effective_permissions` devolvia `{}` para sempre e o `can()` negava tudo para `manager`, `member` e `viewer`. Invisível de dentro, porque owner e admin passam pela camada 2 antes. A tela de perfis existia e editava o vazio |
> | Duas migrations existiam só no `test-helpoint`, nunca no repositório | Uma quebrava a exclusão de organização (§7.10); a outra, sem os grants ao `supabase_auth_admin`, deixa o **cadastro de usuário sem funcionar** em ambiente novo. Os testes não pegam porque rodam contra o banco que já tem a correção aplicada à mão |
>
> O primeiro só apareceu porque o eixo **Spec** do `code-review` perguntou "o critério de saída existe
> no código?" em vez de "os testes passam?". O E2E que eu tinha escrito provava que a matriz era
> **salva**, nunca que ela se **aplicava** — provava a metade errada, e por isso passava. A asserção que
> faltava vive agora em pgTAP, onde a regra mora.
>
> O segundo só apareceu porque o repositório foi comparado com o banco. Nenhum teste compara os dois.
>
> **Produção foi zerada em 2026-08-31**: o projeto `helpoint-saas` rodava um schema de outra geração
> (`core_work`, `core_system`, `workflows`, `ai`), com 0 usuários e 0 linhas. A Fase 0 dava "deploy em
> produção funcionando" como concluída, e o que existia lá não correspondia a estas migrations. O
> schema foi derrubado e o histórico de migrations limpo; o projeto recebe as migrations do
> repositório no deploy.

> **Dois adiamentos decididos em 2026-08-30**, registrados aqui porque o portão de QA exige que
> julgamento vire decisão explícita e não silêncio. Nenhum dos dois é violação dura; ambos têm teto
> nomeado e saída definida.
>
> | Adiado | Teto que o sustenta | Saída |
> |---|---|---|
> | **Item 13 — os cinco componentes base** | Nenhum deles tem consumidor real na Fase 1. O primeiro é a fila de chamados, na Fase 2. Componente genérico desenhado antes do primeiro caso de uso nasce com a API errada e é reescrito na primeira vez que encontra a realidade | Cada um é extraído quando seu primeiro consumidor existir, na Fase 2. As três tabelas de Configurações são consumidoras candidatas do `data-table` — quando a fila de chamados exigir a quarta, a abstração se paga |
> | **Item 9 — MFA** | Nenhum tenant em produção, nenhum dado real de cliente no sistema. O custo de exposição hoje é zero | **Antes do primeiro cliente real.** É bloqueio de go-live, não de fase — entra no §7 como pré-requisito de produção |
>
> **Três adiamentos a mais, decididos em 2026-08-31 no portão da fase**, depois que o `code-review`
> encontrou o que nem os testes nem eu tínhamos visto:
>
> | Adiado | Teto que o sustenta | Saída |
> |---|---|---|
> | **Item 11 — busca global** | O header tem o lugar reservado, mas não há o que indexar: existem usuários, perfis e log de auditoria, e cada um já tem a própria tela com filtro. Uma busca sobre três coisas que cabem numa página é enfeite | Fase 2, com chamados e POPs — aí a busca deixa de ser conveniência e vira o único caminho prático até um registro entre milhares |
> | **§4.1 / §9.6 — textos em `i18n/pt-BR`** | Violação dura e **antiga**: o repositório inteiro tem string embutida em componente desde a Fase 0, e `src/i18n/` nunca existiu. Mover tudo agora seria reescrever 20+ arquivos sem um único teste que prove equivalência de texto, no momento de fechar a fase — troca de risco ruim. O produto é monolíngue pt-BR e nenhum cliente pediu outro idioma | **Antes do primeiro cliente que exija `en` ou `es`**, ou antes de a base de telas dobrar (o que vier primeiro). Enquanto isso, `modules/*/labels.ts` concentra os rótulos de enum, que é a parte que mais se repete |
> | **§5.6 — `login_failed` na auditoria** | Não há sessão numa tentativa que falhou, e `log_activity` exige usuário autenticado. Registrar exigiria uma RPC `SECURITY DEFINER` que aceita chamada anônima — ou seja, um caminho pelo qual um atacante escreve linhas no log da empresa que está atacando. O rate limit do §7.4 já barra a repetição | Junto com o MFA, quando o §7 ganhar a trilha de eventos de autenticação com limite e retenção próprios |

### Fase 2 — Atendimento (2–3 semanas) — *o coração do produto*

15. Categorias, políticas de SLA, formulários dinâmicos, checklists.
16. `tickets`: abertura, fila, atribuição, conversação pública/interna, resolução, avaliação.
17. Cálculo de SLA em `domain/` com testes; varredura por cron; alerta e escalonamento.
18. Portal do colaborador ("meus chamados") e visão do técnico.
19. Indicadores de TI: views + dashboard.

**Critério de saída:** uma organização real consegue operar helpdesk apenas no sistema novo.

### Fase 3 — Trabalho e conhecimento (2 semanas)

20. Work Management: projetos, quadro, tarefas, subtarefas, dependências, apontamento de horas.
21. `comments` genérico ligado a chamados e tarefas.
22. POPs: editor em blocos, versões, anexos, feedback, busca textual.
23. Embeddings com `pgvector` + busca semântica; vínculo POP ↔ chamado.

### Fase 4 — Catálogo, Qualidade e SAC (2–3 semanas)

24. Catálogo unificado: produtos, categorias, lotes, fornecedores.
25. Portal SAC: OTP, cadastro, formulário público, acompanhamento, base pública.
26. `sac_tickets` + produtos/lotes reclamados; alerta por lote.
27. Laudos técnicos; bloqueio de fechamento sem laudo.

### Fase 5 — Comercial / CRM (3–4 semanas) — *o módulo novo maior*

28. Territórios, contas, contatos — **unificando o cliente do SAC**.
29. Distribuidores, territórios exclusivos, painel do parceiro.
30. Tabelas de preço e motor de precificação.
31. Funil: pipelines, estágios, oportunidades, histórico, atividades.
32. Pedidos + itens + **integração com o Financeiro** (§5.19.6).
33. Metas e comissões, com apuração testada.
34. Roteiros, visitas com check-in geolocalizado, pesquisa de PDV, indicador de ruptura.
35. Leads (inbound) e **prospecção por IA** com fila de curadoria.

> A Fase 5 depende da 4 (catálogo e SAC) e da 6 (Financeiro, para o faturamento). Se o Financeiro ainda não
> existir, os pedidos ficam prontos e a geração de `fin_entries` entra como último passo — nunca ao contrário.

### Fase 6 — Financeiro e RH (3–4 semanas)

36. Plano de contas, centros de custo, contas bancárias.
37. Contas a pagar/receber, recorrência, parcelamento, fluxo de caixa.
38. Importação de extrato e conciliação com deduplicação.
39. Compras: requisição, cotação, aprovação por alçada.
40. Orçamento por centro de custo com alerta.
41. RH: colaboradores, solicitações, ausências, benefícios, documentos.
42. Folha: faixas de imposto, cálculo em `domain/` com memória, holerites, geração de contas a pagar.

### Fase 7 — Marketing (1–2 semanas)

43. Talentos, contratos e entregáveis.
44. Eventos e participantes.
45. Contas sociais (OAuth), calendário e publicação agendada.
46. Cotações, UGC com direitos de uso, biblioteca de assets.

### Fase 8 — IA e automação (2–3 semanas)

47. BYOK: credenciais no Vault, validação, tela de configuração, medição de uso e custo.
48. Assistente com function calling, streaming, confirmação de escrita, guard e bloqueio progressivo.
49. Sugestão de resposta, análise de padrões, transcrição, curadoria diária, modo foco.
50. Workflows: canvas ReactFlow, validação de grafo, motor de execução, catálogo de nós, histórico.
51. Migração dos automatismos das fases anteriores para workflows onde fizer sentido.

### Fase 9 — Billing e lançamento (1–2 semanas)

52. Planos, Stripe Checkout e Billing Portal, webhooks idempotentes.
53. Enforcement de limites em três pontos (§5.22).
54. Trial, suspensão, exportação de dados.
55. Site institucional, página de preços, termos e política de privacidade.
56. Hardening final: pentest interno com o checklist do §7.11, revisão de advisors, teste de restauração.

### Ordem de dependência

```
Fase 0 ──► Fase 1 ──┬──► Fase 2 ──┬──► Fase 3
                    │             ├──► Fase 4 ──► Fase 5 ──┐
                    │             └──► Fase 6 ─────────────┤
                    │                                      ├──► Fase 8 ──► Fase 9
                    └──► Fase 7 ───────────────────────────┘
```

**Regra do roadmap:** nenhuma tabela entra em migration sem a fatia de UI correspondente na mesma fase.
Foi assim que o sistema atual acumulou 11 tabelas de Kanban sem tela (§1.4.7).

---

## 11. ADRs — registro de decisões arquiteturais

Formato curto: contexto → decisão → consequência. Decisões novas entram em `docs/adr/NNN-titulo.md`.

**ADR-001 — Reconstruir do zero em vez de refatorar**
*Contexto:* o sistema atual funciona, mas nasceu de prompts no Lovable, sem padrão de schema, testes ou
controle de deploy.
*Decisão:* recomeçar com engenharia própria, usando o sistema atual como especificação viva.
*Consequência:* custo alto de reconstrução; em troca, dívida zerada e base sustentável. Mitigado por manter
o legado rodando e não migrar dados (ADR-002).

**ADR-002 — Base de dados nova, sem migração**
*Contexto:* migrar ~110 tabelas com drift de tipos e três modelos de RBAC é um projeto por si só.
*Decisão:* começar limpo; cada organização entra por onboarding novo.
*Consequência:* liberdade total de modelagem; histórico antigo não vem junto. Importação por módulo,
via CSV, se alguma organização precisar.

**ADR-003 — Supabase + Vercel na Fase 1, VPS na Fase 2 com gatilhos objetivos**
*Contexto:* o documento anterior planejava sair do Supabase imediatamente para VPS.
*Decisão:* inverter — plataforma gerenciada agora, infra própria quando gatilhos numéricos dispararem (§2.4.1).
*Consequência:* saída para produção em semanas, não meses. Exige as cinco disciplinas do §2.4.3 para manter
a Fase 2 barata.

**ADR-004 — `supabase-js` + RLS em vez de ORM na Fase 1**
*Contexto:* Prisma e Drizzle dão tipagem melhor, mas conectam com usuário privilegiado, e o RLS deixa de
valer sem `SET LOCAL` disciplinado em toda transação.
*Decisão:* `supabase-js` com o JWT do usuário; RLS aplicado pelo banco automaticamente. Migrations em SQL
puro pela CLI. Tipos gerados no CI.
*Consequência:* menos açúcar sintático em consultas complexas — resolvido com views e RPC (§5.23).
O schema é portável, então a Fase 2 pode adotar ORM sem reescrever o banco.

**ADR-005 — `organization_id` + RLS, banco único**
*Contexto:* três estratégias possíveis de isolamento.
*Decisão:* banco único, coluna de tenant, RLS nativo, FK composta e trigger de imutabilidade.
*Consequência:* operação simples e custo baixo; exige teste de isolamento obrigatório (§3.8) e disciplina de
índice liderado por `organization_id`.

**ADR-006 — Nenhuma policy chama `auth.uid()` diretamente**
*Contexto:* `auth.uid()` é específico do Supabase e apareceria em centenas de policies.
*Decisão:* indireção por `public.current_user_id()`, com `coalesce` para variável de sessão.
*Consequência:* trocar de provedor de auth passa a ser trocar **uma função**. Também torna as policies
testáveis fora do Supabase.

**ADR-007 — Identificadores em inglês, interface em português**
*Contexto:* o schema atual mistura os dois idiomas, gerando inconsistência de nomes.
*Decisão:* schema e código em inglês; UI em pt-BR via `i18n`; termos fiscais brasileiros mantidos no original.
*Consequência:* pequena curva para quem lê o schema pela primeira vez; ganho grande de consistência e de
qualidade na geração assistida por IA.

**ADR-008 — RBAC unificado em um único `access_profiles`**
*Contexto:* três modelos coexistentes hoje (TI, geral, Qualidade), mais duas tabelas de controle sobreposto.
*Decisão:* um modelo genérico por departamento, com `permissions` de formato fixo e escopo de linha
(`own`/`assigned`/`team`/`department`/`all`).
*Consequência:* nenhum módulo cria tabela de permissão própria. Exige que o formato JSON seja estável.

**ADR-009 — Regra de negócio em TypeScript, não em PL/pgSQL**
*Contexto:* cálculo de INSS, IRRF e folha estão hoje no banco, sem testes.
*Decisão:* `modules/*/domain/` puro e testável; no banco só RLS, integridade e operações atômicas.
*Consequência:* mais código na aplicação; em troca, teste unitário rápido, versionamento junto da UI e
portabilidade de banco.

**ADR-010 — Comentários e tarefas genéricos**
*Contexto:* o sistema atual tem três implementações de comentário e nenhuma de tarefa genérica.
*Decisão:* tabelas `comments` e `tasks` polimórficas por `entity_type`/`entity_id`, com policy delegando ao
RLS da entidade dona.
*Consequência:* uma UI, um conjunto de bugs. Custo: FK polimórfica não existe, então há um job de
verificação de órfãos.

**ADR-011 — Evento de domínio emitido pela aplicação, não por trigger**
*Contexto:* o sistema atual usa triggers PL/pgSQL para automações.
*Decisão:* `emitDomainEvent()` na Server Action alimenta o motor de workflows.
*Consequência:* o evento conhece o usuário e a intenção, é testável e não roda dentro da transação.
Exceção: eventos que só existem no banco (expiração de SLA) vêm de job de varredura.

**ADR-012 — Stripe como provedor de pagamento inicial**
*Contexto:* o mercado brasileiro exige PIX e boleto, que não são o forte do Stripe.
*Decisão:* Stripe primeiro, pela qualidade de API e Billing Portal, com a camada isolada em `lib/billing/`.
*Consequência:* pode ser necessário um segundo provedor (Asaas/Pagar.me) para PIX e boleto.
**Ponto em aberto** — decidir antes da Fase 9.

**ADR-013 — Prospecção por IA com curadoria humana obrigatória**
*Contexto:* um agente que cria contas automaticamente poluiria a base comercial e criaria risco de LGPD.
*Decisão:* resultados entram em `crm_prospects` (área de espera), com fonte obrigatória, `fit_score`,
deduplicação e aprovação humana antes de virar lead.
*Consequência:* mais um passo no fluxo; em troca, base comercial confiável e responsabilidade clara sobre
o contato.

**ADR-014 — Particionamento por mês desde o dia 1 nas tabelas de log**
*Contexto:* `activity_log`, `notifications`, `ai_messages` e `workflow_executions` crescem sem limite.
*Decisão:* particionar por `range` de data desde a primeira migration.
*Consequência:* complexidade adicional em FK e PK composta; em troca, expurgo é `drop partition` (instantâneo)
em vez de `DELETE` de milhões de linhas.

**ADR-016 — Resolução de tenant por RPC, não por `service_role` na borda**
*Contexto:* o `proxy.ts` precisa resolver host → organização antes de existir sessão, e o papel `anon`
não tem `SELECT` em `organizations` (§7.2.1).
*Decisão:* uma função `SECURITY DEFINER` `resolve_organization_by_host`, com grant nominal para `anon`,
devolvendo apenas `id`, `slug`, `status` e identidade visual.
*Consequência:* a chave `service_role` nunca entra no caminho percorrido por visitante anônimo, e a
tabela `organizations` continua fechada. Custo: uma função a mais na superfície pública — aceitável,
porque quem acessa `acme.helpoint.com.br` já sabe que a Acme existe.

**ADR-017 — Validação de ambiente preguiçosa, com verificação no CI**
*Contexto:* `clientEnv` e `serverEnv` moram no mesmo módulo, e o `proxy.ts` roda no Edge, onde os
segredos de servidor não existem. Validar `serverEnv` no carregamento do módulo derrubava o middleware
só por ele importar `clientEnv`.
*Decisão:* `serverEnv` é um `Proxy` que valida no primeiro acesso a uma propriedade. A garantia perdida
("variável faltando derruba o build") volta como passo de CI: `npm run check:env`.
*Consequência:* o Edge funciona; a validação continua acontecendo antes do deploy, não na primeira
requisição do usuário. Exige lembrar de manter o `check:env` no pipeline.

**ADR-018 — `test-helpoint` como banco de desenvolvimento, Docker opcional**
*Contexto:* a máquina de desenvolvimento não tem Docker, e o fluxo do §8.3 pressupunha `supabase start`.
*Decisão:* um segundo projeto Supabase (`test-helpoint`) serve como banco de dev e teste; `helpoint-saas`
fica exclusivamente para produção.
*Consequência:* a suíte pgTAP roda sem Docker, então o requisito de teste de isolamento bloqueante
continua satisfeito. O CI mantém o `db reset` com Docker, garantindo que as migrations continuam
aplicáveis do zero — o que o fluxo remoto sozinho não provaria. Custo: mais um projeto (US$ 0) e a
disciplina de nunca apontar script de teste para o ref de produção.

**ADR-015 — Catálogo único de produtos e fornecedores**
*Contexto:* o sistema atual tem catálogos separados para SAC, Compras e Marketing.
*Decisão:* `products`, `product_batches` e `suppliers` compartilhados entre todos os módulos.
*Consequência:* um cadastro serve reclamação, pedido e compra do mesmo item — pré-requisito para a ficha
360° do cliente e para o indicador de qualidade por lote.

---

## 12. Pontos em aberto

Registrados explicitamente para não virarem decisão implícita:

| # | Questão | Precisa decidir até |
|---|---|---|
| 1 | Provedor de pagamento para PIX e boleto (ADR-012) | Fase 9 |
| 2 | Emissão fiscal (NF-e/NFS-e) integrada ou apenas registro do número da nota | Fase 5 |
| 3 | App mobile para o vendedor em campo (PWA offline-first vs. nativo) — check-in em área sem sinal é caso real | Fase 5 |
| 4 | Integração com ERP existente do cliente (estoque e faturamento) | Após Fase 5 |
| 5 | Fonte de dados da prospecção: só busca web via IA, ou também base pública (Receita Federal/CNPJ) e provedor pago | Fase 5 |
| 6 | Modelo de cobrança: por seat, por módulo, ou híbrido com consumo de IA | Fase 9 |
| 7 | WhatsApp como canal de atendimento (API oficial) | Após Fase 9 |
| 8 | Tier "enterprise dedicado" com banco isolado | Comercial, sem prazo |

---

*Documento de arquitetura do Helpoint · versão 2.0 · Substitui `ARQUITETURA_MIGRACAO.md` e
`ARQUITETURA_HELPOINT_V3.md`. Alterações estruturais devem ser refletidas aqui antes de entrarem no código.*
