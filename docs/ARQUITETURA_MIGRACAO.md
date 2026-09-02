# Arquitetura Helpoint — Documento de Referência para Migração (Lovable/Supabase → Next.js/Prisma)

## Contexto

O Helpoint hoje é um SaaS multi-tenant construído no Lovable (React 18 + Vite SPA + Supabase), já em produção, cobrindo múltiplos módulos de gestão corporativa (TI/Helpdesk, RH, Financeiro, Marketing, Qualidade, SAC). O objetivo deste documento é **sair do Lovable e do Supabase por completo** e formalizar uma arquitetura robusta e autônoma em Next.js 14 + Prisma + PostgreSQL, hospedada em infraestrutura própria, que sirva de referência para toda a evolução futura do produto.

Este documento foi escrito **após leitura direta do código-fonte real** em `helpoint-main/` (não do zero) — 3 explorações dedicadas cobriram documentação/stack, schema do banco (125 migrations SQL) e arquitetura de frontend (rotas, auth, multi-tenancy, IA). As decisões abaixo foram confirmadas com o dono do produto:

1. **Schema**: modelar o domínio real completo (todos os módulos já construídos), não o exemplo genérico de "projects/tasks". `tenant_id` é renomeado para `organization_id` na nova stack.
2. **Estratégia de migração**: **incremental / strangler-fig** — o Next.js novo é construído com a stack-alvo completa desde o início (Prisma, PostgreSQL com RLS, NextAuth.js), roda em paralelo ao sistema legado, e os módulos são cortados um a um para produção, minimizando o risco de parar o sistema para os tenants atuais (detalhes em §7).
3. **Infraestrutura**: hospedagem própria na **VPS Hostinger** (Docker + Nginx), com **Cloudflare** na frente (DNS/SSL/CDN) e **Cloudflare R2** para armazenamento de arquivos.
4. **Billing**: desenhar um módulo de assinatura real com Stripe (hoje não existe — só um `plan_config` JSON manual).

Duas capacidades são **novas** em relação ao sistema atual: o **módulo de Workflows/Automação** (builder visual com ReactFlow) e o **módulo de Billing** (Stripe). Tudo o mais é o domínio de negócio já existente, redesenhado na nova stack.

---

## 0. Resumo Executivo

| Decisão | Escolha |
|---|---|
| Escopo do schema | Domínio real completo (~90 tabelas) + Workflows (novo) + Billing (novo) |
| Estratégia de migração | Incremental / strangler-fig, módulo por módulo (§7) |
| Multi-tenancy | `organization_id` (renomeado de `tenant_id`) + RLS nativo do Postgres |
| Resolução de tenant | Subdomain (`{org}.helpoint.com.br`) como padrão + domínio customizado (mantido) |
| Hospedagem | **VPS Hostinger** — Docker Compose (app + Postgres + Redis + Nginx) |
| DNS / SSL / CDN | **Cloudflare** (plano gratuito) na frente da VPS |
| Storage de arquivos | **Cloudflare R2** (S3-compatible) |
| Auth | **NextAuth.js** (Prisma Adapter), com migração de senha via redefinição obrigatória (§7) |
| RLS sem Supabase | Session variables via `SET LOCAL` + `current_setting()`, substituindo `auth.uid()` |
| Billing | Novo módulo com Stripe (Plan, Subscription, Invoice, UsageRecord) |
| Automação | Novo módulo Workflow/WorkflowNode/WorkflowEdge/WorkflowExecution com ReactFlow |
| IA | Mantém modelo BYOK (Anthropic/OpenAI/Google) já validado em produção |

---

## 1. OVERVIEW

### 1.1 O que é o Helpoint hoje

Segundo a documentação interna (`docs/SYSTEM_DOCUMENTATION.md`) e o `README.md`, o Helpoint se define como um **"Sistema Operacional Corporativo Unificado"**: um SaaS multi-tenant onde cada empresa (tenant) tem seu ambiente isolado, com módulos habilitáveis por plano. Princípios de produto declarados: "Zero Planilhas" (o sistema deve ser autossuficiente, sem depender de Excel externo) e "Auditoria Total" (toda ação relevante deve registrar quem/quando/o quê).

O sistema está em produção real, com 125 migrations SQL aplicadas entre janeiro e agosto de 2026, e cobre um escopo muito mais amplo do que "gestão de projetos para equipes" — é uma suíte de gestão departamental completa.

### 1.2 Módulos e capacidades atuais

| Módulo | O que faz | Maturidade (arquivos de componentes) | Tabelas-chave |
|---|---|---|---|
| **TI / Helpdesk** | Chamados com SLA, atribuição, comentários, avaliação de satisfação, formulários dinâmicos por categoria | 22 (+ 8 em `ti/`) | `tickets`, `ticket_comments`, `sla_policies`, `ti_categories`, `ticket_patterns` |
| **Inventário/CMDB** | Ativos de TI (hardware/software/rede), manutenções vinculadas | 4 | `assets`, `asset_maintenances` |
| **Licenças** | Licenças de software, chaves, renovações, atribuição a usuários/ativos | 6 | `software_licenses`, `software_license_keys`, `license_assignments` |
| **Contratos** | Contratos de fornecedores de TI | 3 | `software_contracts` |
| **Manutenções** | Preventivas/corretivas/upgrade de ativos | 3 | `asset_maintenances` |
| **POPs / Base de Conhecimento** | Procedimentos operacionais com editor em blocos, versionamento, anexos, busca semântica via IA, feedback | 18 | `pops`, `pop_versions`, `pop_attachments`, `pop_feedbacks` |
| **RH** | Colaboradores, férias, atestados, holerites, folha, benefícios (VT/VR/combustível), documentos, "Meu RH" self-service | 2 componentes + 10 páginas dedicadas | `rh_employee_profiles`, `rh_payslips`, `rh_payroll_entries`, `rh_vacation_requests`, `rh_benefit_plans` |
| **Financeiro** | Contas a pagar/receber, fluxo de caixa, compras/requisições, orçamento por departamento | 7 | `fin_entries`, `fin_imports`, `fin_purchase_requests`, `fin_department_budgets` |
| **Marketing** | Influenciadores/artistas, eventos, calendário social (com publicação via Meta OAuth), fornecedores/cotações, UGC | 3 | `mkt_influencers`, `mkt_social_posts`, `mkt_events`, `mkt_suppliers` |
| **Qualidade** | Dashboard de qualidade, laudos técnicos, chamados de qualidade | 4 | `sac_technical_reports`, perfis próprios de acesso |
| **SAC (portal público do cliente final)** | Login por OTP, cadastro, abertura pública de chamado, acompanhamento, base de conhecimento do cliente — é uma segunda porta de entrada, separada do painel interno | 7 | `customer_profiles`, `sac_tickets`, `sac_products`, `sac_otp_codes` |
| **Access / RBAC** | Perfis de acesso granulares por departamento (ver/criar/editar/excluir/aprovar) | 2 | `access_profiles`, `user_access_profiles` (+ 2 modelos legados coexistindo, ver §1.4) |
| **IA / "Lyra"** | Assistente virtual com function-calling (cria chamados, sugere respostas, analisa padrões, busca semântica, transcreve áudio, gera relatórios de insight), modelo **BYOK** (cada tenant usa sua própria chave Anthropic/OpenAI/Google) | 4 | `tenant_ai_credentials`, `lyra_security_blocks`, `ti_insight_reports` |
| **Notificações** | Notificações in-app + eventos | — | `notifications`, `notification_events` |
| **Auditoria** | Log genérico de INSERT/UPDATE/DELETE em qualquer tabela relevante | — | `audit_logs` |
| **Kanban** | Tabelas completas existem no banco (`kanban_boards/columns/cards/...`), mas **não há UI correspondente** no código atual — módulo órfão | — | `kanban_*` (11 tabelas) |
| **Checklists** | Templates de checklist aplicáveis a chamados, bloqueiam fechamento se pendentes | — | `checklist_templates`, `ticket_checklists` |
| **E-mail transacional** | Fila própria via `pgmq`, envio via Resend, supressão/unsubscribe | — | `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens` |
| **Domínios customizados** | White-label: tenant pode usar domínio próprio, com verificação DNS (CNAME/A + TXT) | — | `tenant_domains` |

### 1.3 O que muda na arquitetura-alvo

**Mantém-se (portado, não recriado do zero):** todos os módulos de negócio acima, o modelo de isolamento por tenant + RLS, o modelo BYOK de IA, o fluxo de domínio customizado, a auditoria genérica, o sistema de notificações.

**Sai de cena (dependências específicas do Supabase/Lovable a substituir):**
- Supabase Auth → **NextAuth.js** (com migração de senha, ver §7)
- Supabase Edge Functions (Deno) → **Next.js Route Handlers / Server Actions**
- Supabase Storage → **Cloudflare R2**
- Fila `pgmq` para e-mail → **Redis + BullMQ** (rodando na VPS)
- RLS baseada em `auth.uid()` (específico do Supabase) → **RLS baseada em session variables** (`current_setting`)
- Hospedagem gerenciada do Lovable → **VPS Hostinger** (Docker + Nginx) atrás do Cloudflare

**Novo (não existe hoje):**
- **Módulo de Billing** com Stripe (planos pagos, assinaturas, seats, webhooks) — hoje só existe um JSON manual de plano/trial.
- **Módulo de Workflows/Automação** com builder visual (ReactFlow) — motor de automações do tipo "quando X acontece, faça Y" (ex.: "quando chamado crítico é aberto → notificar responsável → se não atendido em 30min → escalar").

### 1.4 Dívida técnica identificada (a resolver durante a migração, não antes)

Estes pontos foram encontrados na exploração do código real e devem ser tratados explicitamente no plano de migração, não ignorados:

1. **Três modelos de RBAC coexistindo**: `ti_access_profiles`/`ti_user_profiles` (legado, só TI), `access_profiles`/`user_access_profiles` (atual, multi-departamento), `qualidade_access_profiles`/`qualidade_user_profiles` (paralelo, só Qualidade). Há inclusive uma proposta de simplificação de UI ainda não decidida em `.lovable/plan.md` (reduzir "nível de acesso" a um único checkbox "administra a empresa"). **Decisão para a nova stack**: unificar em um único modelo `AccessProfile` genérico por departamento (ver §4).
2. **Tabelas Kanban órfãs**: schema completo existe, UI não. Decidir explicitamente na migração: revivê-lo (ex.: como visualização alternativa do Workflow/automação) ou descartá-lo.
3. **Inconsistência enum vs. `TEXT + CHECK`**: módulos mais antigos (TI, Marketing) usam `ENUM` nativo do Postgres; módulos mais novos (RH, SAC, `access_profiles.department`) usam `TEXT` com `CHECK`. Padronizar em Prisma `enum` na nova stack.
4. **Drift entre tipos TypeScript e enums do banco**: ex. `AssetStatus` no TS tem `in_use`/`in_stock` que não existem no `ENUM` SQL localizado; `TicketStatus` no TS tem `rejected` que não está no enum SQL. Precisa de auditoria pontual antes de gerar o schema Prisma definitivo (rodar introspecção `prisma db pull` contra o banco real de produção, não confiar cegamente neste documento).
5. **Histórico de migração de enum já aconteceu uma vez**: `app_role` já foi renomeado de `colaborador/tecnico/supervisor/diretor` para `owner/admin/manager/member/viewer` via `DROP ... CASCADE` + recriação manual de todas as policies. Sinal de que trocar enums em produção é arriscado — planejar migrations com o mesmo cuidado.
6. **Validação de tenant slug duplicada** em 3 componentes de frontend (`StaffRoute`, `TenantSlugGuard`, `LegacyTenantRedirect`), cada um refazendo a mesma query. Resolver com o padrão de middleware único (§3).

---

## 2. STACK TECNOLÓGICA

| Camada | Atual (Supabase/Lovable) | Alvo (nova stack) | Racional |
|---|---|---|---|
| Framework | React 18 + Vite (SPA, React Router) | **Next.js 14 (App Router)** | SSR/RSC, roteamento por middleware, API routes nativas, melhor SEO para portal público (Landing, SAC) |
| Linguagem | TypeScript 5.8 (config permissiva) | **TypeScript 5.x (strict)** | Reduzir a dívida de tipos já identificada (§1.4.4) |
| Hospedagem do app | Lovable Cloud (gerenciado) | **VPS Hostinger** (Docker Compose + Nginx) | Controle total de infraestrutura, custo previsível, reaproveita infraestrutura já contratada |
| ORM/DB access | Supabase JS client (queries diretas via RLS) | **Prisma** | Tipagem ponta-a-ponta, migrations versionadas, introspecção do banco atual como ponto de partida |
| Banco de dados | Postgres gerenciado pelo Supabase | **PostgreSQL** self-hosted na VPS (container Docker) **com RLS nativo** | RLS é mantido, só muda quem gerencia a instância e como a identidade é injetada (§3) |
| Cache/filas/rate limit | — (usa `pgmq` para e-mail) | **Redis** (container na VPS) + BullMQ para filas (e-mail, execução de workflows, jobs de IA assíncronos) | Substitui `pgmq`; também usado para cache de resolução de tenant e rate limiting |
| Automação visual | `@xyflow/react` já usado para diagramas de rede (não para automação) | **ReactFlow (`@xyflow/react`)** reaproveitado para o builder de Workflows | Já validado no produto atual para outro propósito — reduz risco de adoção |
| Styling | Tailwind 3.4 + shadcn/ui + Radix | **Tailwind + shadcn/ui** (mantido) | Design system já maduro (52 componentes `ui/`), portar praticamente 1:1 |
| Auth | Supabase Auth (GoTrue) + tabelas `profiles`/`customer_profiles`/`user_roles` custom | **NextAuth.js** (Prisma Adapter, Credentials + OAuth opcional) | Necessário porque saímos do Supabase; ver plano de migração de senhas em §7 |
| Pagamentos | Nenhum (só `plan_config` JSON) | **Stripe** (Checkout + Billing Portal + Webhooks) | Novo módulo, ver §4.11 |
| IA | Edge Functions Deno chamando Anthropic/OpenAI/Google via BYOK | **API Anthropic** como provedor primário via Route Handlers, mantendo abstração multi-provedor BYOK | Preserva o padrão já validado (`callTenantAI`/`streamTenantAI`), só troca o runtime de Deno para Node/Edge do Next.js |
| Testes | Vitest + Testing Library | **Vitest + Testing Library** (mantido) | Sem motivo para trocar |
| E-mail transacional | Resend + fila própria `pgmq` | **Resend** (mantido) + fila via **BullMQ/Redis** | Provedor de envio mantido, só a fila muda de mecanismo |
| Storage de arquivos | Supabase Storage | **Cloudflare R2** (S3-compatible) | Egress gratuito, não ocupa disco da VPS, SDK S3 padrão |
| DNS / CDN / SSL | Domínio próprio do Lovable | **Cloudflare** (plano gratuito) na frente da VPS | Simplifica wildcard SSL para subdomínios de tenant e dá uma camada extra de proteção/rate limiting |
| Deploy | Lovable Cloud (gerenciado) | **Docker + Nginx + CI/CD próprio** (§7) | Controle total de infraestrutura |

---

## 3. MULTI-TENANCY

### 3.1 Nomenclatura

`tenant_id` → **`organization_id`** em toda a stack nova (Prisma models, colunas, session variables, headers). A tabela `tenants` vira `organizations`.

### 3.2 Resolução de tenant

**Padrão primário: subdomain** — `{org-slug}.helpoint.com.br`. **Mantido: domínio customizado** (`tenant_domains` → `organization_domains`), já que é uma feature em uso real por tenants white-label hoje — não faz sentido descartá-la na migração. O padrão atual de path (`/t/:slug/...`) e a camada de redirecionamento legado (`LegacyTenantRedirect`) são **descontinuados**: a resolução passa a ser 100% no `middleware.ts`, eliminando a necessidade das 3 verificações de slug duplicadas no frontend hoje (§1.4.6).

```ts
// middleware.ts (Next.js 14)
export async function middleware(req: NextRequest) {
  const host = req.headers.get('host')!;
  const orgSlug = extractSubdomain(host); // ex: "acme.helpoint.com.br" -> "acme"

  let organization: { id: string; slug: string } | null = null;

  if (orgSlug && !isReservedSubdomain(orgSlug)) {
    organization = await resolveOrgBySlug(orgSlug); // cache em Redis, TTL curto
  } else if (!isDefaultHost(host)) {
    organization = await resolveOrgByCustomDomain(host); // organization_domains, cache Redis
  }

  if (!organization) return NextResponse.next(); // marketing site / login genérico

  const res = NextResponse.next();
  res.headers.set('x-organization-id', organization.id);
  res.headers.set('x-organization-slug', organization.slug);
  return res;
}
```

Nas Server Actions/Route Handlers, um helper `getCurrentOrganization()` lê o header (ou, em Server Components, um `headers()` do `next/headers`) — nenhuma página precisa saber como o tenant foi resolvido.

### 3.3 RLS sem Supabase Auth

Hoje o RLS depende de `auth.uid()` (função nativa do GoTrue/Supabase) e de `get_user_tenant_id()` (que faz `SELECT tenant_id FROM profiles WHERE id = auth.uid()`). Sem o Supabase Auth, não existe mais `auth.uid()`. A solução padrão para Prisma + Postgres RLS é **session variables via `SET LOCAL`**, setadas em toda transação:

```ts
// lib/db/withOrgContext.ts
export async function withOrgContext<T>(orgId: string, userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}
```

```sql
-- Policies passam a usar current_setting() em vez de auth.uid()/get_user_tenant_id()
CREATE OR REPLACE FUNCTION public.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

CREATE POLICY "tickets_isolation" ON public.tickets
  USING (organization_id = current_organization_id());
```

Toda query de negócio passa obrigatoriamente por `withOrgContext(...)` — nunca chamar `prisma.ticket.findMany()` direto fora desse wrapper. Isso é reforçado com uma extensão do Prisma Client (`$extends`) que recusa queries em models "tenant-scoped" fora de um contexto ativo.

### 3.4 Onboarding e convites (portado)

O fluxo atual (self-service signup → `OnboardingCompany` → RPC `claim_new_tenant`; convite → `tenant_invites` + e-mail Resend → `AcceptInvite`) é conceitualmente bom e é **portado como está**, só trocando: RPC do Postgres → Server Action Prisma; `admin.auth.admin.createUser` do Supabase → criação de `User` + hash de senha (bcrypt/argon2) via NextAuth Credentials Provider.

---

## 4. SCHEMA DO BANCO (Prisma)

> Cobertura: tabelas centrais e de cada módulo de negócio real, com campos, tipos, constraints e índices. Tabelas mais periféricas (ex. variantes de benefícios de RH, sub-tabelas de anexos) seguem o mesmo padrão estrutural (`id`, `organizationId`, FKs, `createdAt`/`updatedAt`) e estão listadas com os campos específicos que as diferenciam — não é uma introspecção 1:1 de produção; antes de gerar a migration definitiva, rodar `prisma db pull` contra o banco de produção real para fechar qualquer campo divergente (ver dívida técnica §1.4.4).

### 4.1 Enums

```prisma
enum MemberRole {
  OWNER
  ADMIN
  MANAGER
  MEMBER
  VIEWER
}

enum Department {
  TI
  MARKETING
  RH
  FINANCEIRO
  QUALIDADE
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_USER
  WAITING_PARTS
  RESOLVED
  CLOSED
  CANCELLED
}

enum TicketPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum AssetStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
  DECOMMISSIONED
  IN_STOCK
}

enum AssetCategory {
  HARDWARE
  SOFTWARE
  NETWORK
  PERIPHERAL
  MOBILE
  OTHER
}

enum NotificationType {
  TICKET_ASSIGNED
  TICKET_UPDATED
  TICKET_COMMENT
  SLA_BREACH
  MENTION
  APPROVAL_REQUEST
  SYSTEM
}

enum FinEntryKind {
  PAYABLE
  RECEIVABLE
}

enum FinEntryStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}

enum SocialPlatform {
  INSTAGRAM
  TIKTOK
  YOUTUBE
  LINKEDIN
  TWITTER
  FACEBOOK
}

enum SocialPostStatus {
  DRAFT
  SCHEDULED
  PUBLISHED
  FAILED
}

enum SacTicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_CUSTOMER
  RESOLVED
  CLOSED
}

// ---- Novo: Billing ----
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}

// ---- Novo: Workflows ----
enum WorkflowNodeType {
  TRIGGER
  CONDITION
  ACTION
  DELAY
  AI_STEP
}

enum WorkflowTriggerType {
  TICKET_CREATED
  TICKET_STATUS_CHANGED
  SCHEDULE
  WEBHOOK
  MANUAL
  FORM_SUBMITTED
}

enum WorkflowExecutionStatus {
  RUNNING
  SUCCESS
  FAILED
  CANCELLED
}
```

*(demais enums de módulo — `AssetMaintenanceType`, `InfluencerCategory`, `MktEventType/Status`, `MktSupplierCategory/Status`, `MktQuotationStatus`, `MktUgcStatus`, `MktUgcMediaType`, `MktAiGenerationType`, `DeliverableFrequency`, `EventParticipantRole/Status` — seguem o mesmo padrão dos valores já mapeados na exploração do banco real e devem ser confirmados por introspecção antes da migration final.)*

### 4.2 Core / Tenancy / Identidade

```prisma
model Organization {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  cnpj        String?  @unique
  logoUrl     String?
  settings    Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships   Membership[]
  domains       OrganizationDomain[]
  invites       Invite[]
  subscription  Subscription?
  auditLogs     AuditLog[]

  @@index([slug])
  @@map("organizations")
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String?
  fullName      String
  avatarUrl     String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  memberships   Membership[]
  accounts      Account[]
  sessions      Session[]

  @@map("users")
}

model Membership {
  id             String     @id @default(uuid())
  organizationId String
  userId         String
  role           MemberRole @default(MEMBER)
  department     Department?
  isActive       Boolean    @default(true)
  archivedAt     DateTime?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([organizationId])
  @@map("memberships")
}

model OrganizationDomain {
  id                 String    @id @default(uuid())
  organizationId     String
  hostname           String    @unique
  isPrimary          Boolean   @default(false)
  verificationToken  String
  verifiedAt         DateTime?
  lastError          String?
  createdAt          DateTime  @default(now())

  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("organization_domains")
}

model Invite {
  id             String     @id @default(uuid())
  organizationId String
  email          String
  role           MemberRole
  department     Department?
  accessProfileId String?
  invitedById    String
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime   @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  accessProfile  AccessProfile? @relation(fields: [accessProfileId], references: [id])

  @@index([organizationId])
  @@map("invites")
}

// Unifica os 3 modelos legados (ti_access_profiles, access_profiles, qualidade_access_profiles)
model AccessProfile {
  id             String      @id @default(uuid())
  organizationId String
  department     Department
  name           String
  permissions    Json        // { view, create, edit, delete, approve } por recurso
  isTemplate     Boolean     @default(false) // "Gestor" / "Operador" / "Somente leitura"
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  userProfiles   UserAccessProfile[]
  invites        Invite[]

  @@index([organizationId, department])
  @@map("access_profiles")
}

model UserAccessProfile {
  id              String        @id @default(uuid())
  membershipId    String
  accessProfileId String
  overrides       Json?         // exceções pontuais de permissão
  createdAt       DateTime      @default(now())

  membership      Membership    @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  accessProfile   AccessProfile @relation(fields: [accessProfileId], references: [id], onDelete: Cascade)

  @@unique([membershipId, accessProfileId])
  @@map("user_access_profiles")
}

model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?
  tableName      String
  recordId       String
  action         String   // INSERT | UPDATE | DELETE
  oldData        Json?
  newData        Json?
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, tableName, recordId])
  @@index([organizationId, createdAt])
  @@map("audit_logs")
}

model Notification {
  id             String            @id @default(uuid())
  organizationId String
  userId         String
  type           NotificationType
  title          String
  body           String?
  link           String?
  readAt         DateTime?
  createdAt      DateTime          @default(now())

  @@index([organizationId, userId, readAt])
  @@map("notifications")
}
```

### 4.3 Helpdesk / TI

```prisma
model Ticket {
  id             String          @id @default(uuid())
  organizationId String
  ticketNumber   Int             @default(autoincrement())
  module         Department      @default(TI) // reaproveitado por TI/Marketing/RH/Financeiro/Qualidade
  title          String
  description    String
  status         TicketStatus    @default(OPEN)
  priority       TicketPriority  @default(MEDIUM)
  categoryId     String?
  requesterId    String
  assignedToId   String?
  slaPolicyId    String?
  slaDueAt       DateTime?
  satisfactionScore Int?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  resolvedAt     DateTime?
  closedAt       DateTime?

  comments       TicketComment[]
  attachments    TicketAttachment[]
  checklists     TicketChecklist[]
  formResponses  TicketFormResponse[]

  @@unique([organizationId, ticketNumber])
  @@index([organizationId, status])
  @@index([organizationId, module, status])
  @@index([organizationId, assignedToId])
  @@map("tickets")
}

model TicketComment {
  id             String   @id @default(uuid())
  organizationId String
  ticketId       String
  authorId       String
  body           String
  isInternal     Boolean  @default(false)
  createdAt      DateTime @default(now())

  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("ticket_comments")
}

model TicketAttachment {
  id             String   @id @default(uuid())
  organizationId String
  ticketId       String
  fileUrl        String
  fileName       String
  mimeType       String
  uploadedById   String
  createdAt      DateTime @default(now())

  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("ticket_attachments")
}

model TicketFormField {
  id             String   @id @default(uuid())
  organizationId String
  categoryId     String
  label          String
  fieldType      String   // text | select | number | date | checkbox
  options        Json?
  required       Boolean  @default(false)
  position       Int      @default(0)

  @@index([organizationId, categoryId])
  @@map("ticket_form_fields")
}

model TicketFormResponse {
  id       String @id @default(uuid())
  ticketId String
  fieldId  String
  value    Json

  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("ticket_form_responses")
}

model TiCategory {
  id             String @id @default(uuid())
  organizationId String
  name           String
  description    String?

  @@index([organizationId])
  @@map("ti_categories")
}

model SlaPolicy {
  id             String         @id @default(uuid())
  organizationId String
  priority       TicketPriority
  responseTimeMinutes Int
  resolutionTimeMinutes Int

  @@unique([organizationId, priority])
  @@map("sla_policies")
}

model TicketPattern {
  id             String  @id @default(uuid())
  organizationId String
  keyword        String
  suggestedPopId String?
  suggestedReply String?

  @@index([organizationId])
  @@map("ticket_patterns")
}

model ChecklistTemplate {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  department     Department

  items          ChecklistTemplateItem[]
  @@map("checklist_templates")
}

model ChecklistTemplateItem {
  id                  String @id @default(uuid())
  checklistTemplateId String
  label               String
  position            Int    @default(0)

  template            ChecklistTemplate @relation(fields: [checklistTemplateId], references: [id], onDelete: Cascade)
  @@map("checklist_template_items")
}

model TicketChecklist {
  id             String   @id @default(uuid())
  ticketId       String
  templateId     String?
  name           String

  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  items          TicketChecklistItem[]
  @@map("ticket_checklists")
}

model TicketChecklistItem {
  id                String   @id @default(uuid())
  ticketChecklistId String
  label             String
  isDone            Boolean  @default(false)
  position           Int     @default(0)

  checklist         TicketChecklist @relation(fields: [ticketChecklistId], references: [id], onDelete: Cascade)
  @@map("ticket_checklist_items")
}
```

### 4.4 Inventário / Ativos / Licenças / Contratos / Manutenções

```prisma
model Asset {
  id             String        @id @default(uuid())
  organizationId String
  assetTag       String
  name           String
  category       AssetCategory
  status         AssetStatus   @default(ACTIVE)
  specs          Json          @default("{}")
  assignedToId   String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  maintenances   AssetMaintenance[]
  licenseAssignments LicenseAssignment[]

  @@unique([organizationId, assetTag])
  @@index([organizationId, status])
  @@map("assets")
}

model AssetMaintenance {
  id             String   @id @default(uuid())
  organizationId String
  assetId        String
  type           String   // preventiva | corretiva | upgrade
  scheduledAt    DateTime
  completedAt    DateTime?
  notes          String?

  asset          Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  @@index([organizationId, assetId])
  @@map("asset_maintenances")
}

model SoftwareLicense {
  id             String   @id @default(uuid())
  organizationId String
  productName    String
  vendor         String
  seatsTotal     Int
  expiresAt      DateTime?
  createdAt      DateTime @default(now())

  keys           SoftwareLicenseKey[]
  renewals       SoftwareLicenseRenewal[]
  assignments    LicenseAssignment[]
  @@index([organizationId])
  @@map("software_licenses")
}

model SoftwareLicenseKey {
  id        String @id @default(uuid())
  licenseId String
  keyValue  String
  isUsed    Boolean @default(false)

  license   SoftwareLicense @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  @@map("software_license_keys")
}

model SoftwareLicenseRenewal {
  id        String   @id @default(uuid())
  licenseId String
  renewedAt DateTime
  cost      Decimal  @db.Decimal(12, 2)

  license   SoftwareLicense @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  @@map("software_license_renewals")
}

model LicenseAssignment {
  id        String   @id @default(uuid())
  licenseId String
  assetId   String?
  userId    String?
  assignedAt DateTime @default(now())

  license   SoftwareLicense @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  asset     Asset?          @relation(fields: [assetId], references: [id])
  @@map("license_assignments")
}

model SoftwareContract {
  id             String    @id @default(uuid())
  organizationId String
  vendorName     String
  description    String?
  startDate      DateTime
  endDate        DateTime?
  monthlyCost    Decimal   @db.Decimal(12, 2)

  @@index([organizationId])
  @@map("software_contracts")
}

model NetworkDiagram {
  id             String @id @default(uuid())
  organizationId String
  name           String
  data           Json   // nós/arestas do ReactFlow

  @@map("network_diagrams")
}

model FacilityMap {
  id             String @id @default(uuid())
  organizationId String
  name           String
  data           Json

  @@map("facility_maps")
}
```

### 4.5 POPs / Base de Conhecimento

```prisma
model Pop {
  id             String   @id @default(uuid())
  organizationId String
  title          String
  department     Department
  content        Json     // blocos de conteúdo estruturado
  status         String   @default("draft") // draft | published | archived
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  versions       PopVersion[]
  attachments    PopAttachment[]
  feedbacks      PopFeedback[]

  @@index([organizationId, department])
  @@map("pops")
}

model PopVersion {
  id        String   @id @default(uuid())
  popId     String
  content   Json
  version   Int
  createdAt DateTime @default(now())

  pop       Pop      @relation(fields: [popId], references: [id], onDelete: Cascade)
  @@unique([popId, version])
  @@map("pop_versions")
}

model PopAttachment {
  id       String @id @default(uuid())
  popId    String
  fileUrl  String
  mimeType String

  pop      Pop    @relation(fields: [popId], references: [id], onDelete: Cascade)
  @@map("pop_attachments")
}

model PopFeedback {
  id        String   @id @default(uuid())
  popId     String
  userId    String
  wasHelpful Boolean
  comment   String?
  createdAt DateTime @default(now())

  pop       Pop      @relation(fields: [popId], references: [id], onDelete: Cascade)
  @@map("pop_feedbacks")
}
```

### 4.6 RH

```prisma
model RhEmployeeProfile {
  id             String   @id @default(uuid())
  organizationId String
  membershipId   String   @unique
  cpf            String?
  admissionDate  DateTime?
  position       String?
  companyId      String?

  vacationRequests RhVacationRequest[]
  payslips         RhPayslip[]
  benefits         RhEmployeeBenefit[]
  documents        RhDocument[]

  @@index([organizationId])
  @@map("rh_employee_profiles")
}

model RhCompany {
  id             String @id @default(uuid())
  organizationId String
  legalName      String
  cnpj           String

  @@map("rh_companies")
}

model RhVacationRequest {
  id           String   @id @default(uuid())
  employeeId   String
  startDate    DateTime
  endDate      DateTime
  status       String   @default("pending") // pending | approved | rejected
  approvedById String?

  employee     RhEmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@map("rh_vacation_requests")
}

model RhMedicalCertificate {
  id         String   @id @default(uuid())
  employeeId String
  fileUrl    String
  startDate  DateTime
  days       Int

  @@map("rh_medical_certificates")
}

model RhPayslip {
  id           String   @id @default(uuid())
  employeeId   String
  referenceMonth DateTime
  fileUrl      String
  netAmount    Decimal  @db.Decimal(12, 2)

  employee     RhEmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@unique([employeeId, referenceMonth])
  @@map("rh_payslips")
}

model RhPayrollEntry {
  id             String   @id @default(uuid())
  organizationId String
  employeeId     String
  referenceMonth DateTime
  grossAmount    Decimal  @db.Decimal(12, 2)
  deductions     Json     @default("{}")

  @@map("rh_payroll_entries")
}

model RhBenefitPlan {
  id             String @id @default(uuid())
  organizationId String
  name           String
  type           String // transporte | refeicao | combustivel | saude

  employeeBenefits RhEmployeeBenefit[]
  @@map("rh_benefit_plans")
}

model RhEmployeeBenefit {
  id         String @id @default(uuid())
  employeeId String
  planId     String

  employee   RhEmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  plan       RhBenefitPlan     @relation(fields: [planId], references: [id])
  @@map("rh_employee_benefits")
}

model RhDocument {
  id         String @id @default(uuid())
  employeeId String
  fileUrl    String
  category   String

  employee   RhEmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@map("rh_documents")
}
```

*(`rh_absences`, `rh_monthly_deductions`, `rh_transport_vouchers`, `rh_meal_vouchers`, `rh_fuel_reimbursements`, `rh_departments_catalog` seguem o mesmo padrão — `id`, FK para `RhEmployeeProfile` ou `Organization`, campos financeiros/data — e devem ser confirmados por introspecção do banco real.)*

### 4.7 Financeiro

```prisma
model FinEntry {
  id             String          @id @default(uuid())
  organizationId String
  kind           FinEntryKind
  status         FinEntryStatus  @default(PENDING)
  description    String
  amount         Decimal         @db.Decimal(12, 2)
  competenceDate DateTime
  dueDate        DateTime
  costCenter     String?
  createdAt      DateTime        @default(now())

  @@index([organizationId, kind, status])
  @@map("fin_entries")
}

model FinImport {
  id             String   @id @default(uuid())
  organizationId String
  fileUrl        String
  status         String   @default("processing")
  importedCount  Int      @default(0)
  createdAt      DateTime @default(now())

  @@map("fin_imports")
}

model FinPurchaseRequest {
  id             String   @id @default(uuid())
  organizationId String
  requesterId    String
  status         String   @default("pending")
  totalEstimated Decimal  @db.Decimal(12, 2)

  quotes         FinPurchaseQuote[]
  @@index([organizationId, status])
  @@map("fin_purchase_requests")
}

model FinPurchaseQuote {
  id              String   @id @default(uuid())
  purchaseRequestId String
  supplierName    String
  amount          Decimal  @db.Decimal(12, 2)
  isSelected      Boolean  @default(false)

  request         FinPurchaseRequest @relation(fields: [purchaseRequestId], references: [id], onDelete: Cascade)
  @@map("fin_purchase_quotes")
}

model FinPurchaseProduct {
  id             String @id @default(uuid())
  organizationId String
  name           String
  unitCost       Decimal @db.Decimal(12, 2)

  @@map("fin_purchase_products")
}

model FinDepartmentBudget {
  id             String     @id @default(uuid())
  organizationId String
  department     Department
  month          DateTime
  amount         Decimal    @db.Decimal(12, 2)

  @@unique([organizationId, department, month])
  @@map("fin_department_budgets")
}
```

### 4.8 Marketing

```prisma
model MktInfluencer {
  id             String @id @default(uuid())
  organizationId String
  name           String
  category       String
  status         String @default("active")

  @@index([organizationId])
  @@map("mkt_influencers")
}

model MktEvent {
  id             String         @id @default(uuid())
  organizationId String
  name           String
  type           String
  status         String         @default("planning")
  startsAt       DateTime

  participants   MktEventParticipant[]
  @@map("mkt_events")
}

model MktEventParticipant {
  id       String @id @default(uuid())
  eventId  String
  name     String
  role     String
  status   String @default("invited")

  event    MktEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@map("mkt_event_participants")
}

model MktSocialAccount {
  id             String @id @default(uuid())
  organizationId String
  platform       SocialPlatform
  handle         String

  posts          MktSocialPost[]
  @@map("mkt_social_accounts")
}

model MktSocialAccountSecret {
  id                 String @id @default(uuid())
  socialAccountId    String @unique
  encryptedAccessToken String

  @@map("mkt_social_account_secrets")
}

model MktSocialPost {
  id             String            @id @default(uuid())
  organizationId String
  accountId      String
  type           String
  status         SocialPostStatus  @default(DRAFT)
  scheduledAt    DateTime?
  publishedAt    DateTime?
  content        Json

  account        MktSocialAccount  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([organizationId, status, scheduledAt])
  @@map("mkt_social_posts")
}

model MktSupplier {
  id             String @id @default(uuid())
  organizationId String
  name           String
  category       String
  status         String @default("active")

  quotations     MktQuotation[]
  @@map("mkt_suppliers")
}

model MktQuotation {
  id         String @id @default(uuid())
  supplierId String
  items      Json
  status     String @default("pending")
  totalAmount Decimal @db.Decimal(12, 2)

  supplier   MktSupplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  @@map("mkt_quotations")
}

model MktUgcContent {
  id             String @id @default(uuid())
  organizationId String
  mediaUrl       String
  mediaType      String
  status         String @default("pending")

  @@map("mkt_ugc_content")
}

model MktAiGeneration {
  id             String @id @default(uuid())
  organizationId String
  type           String // image | caption | idea | reminder
  prompt         String
  resultUrl      String?
  createdAt      DateTime @default(now())

  @@map("mkt_ai_generations")
}
```

*(`mkt_artists`, `mkt_artist_contracts`, `mkt_artist_deliverables`, `mkt_artist_deliveries`, `mkt_payout_rules`, `mkt_assets` seguem o mesmo padrão de `MktInfluencer`/`MktSupplier` — entidade + tabela filha de detalhamento contratual.)*

### 4.9 Qualidade / SAC (portal público do cliente)

```prisma
model CustomerProfile {
  id             String @id @default(uuid())
  organizationId String
  email          String
  fullName       String
  phone          String?
  createdAt      DateTime @default(now())

  tickets        SacTicket[]
  @@unique([organizationId, email])
  @@map("customer_profiles")
}

model SacCategory {
  id             String @id @default(uuid())
  organizationId String
  name           String

  @@map("sac_categories")
}

model SacTicket {
  id             String          @id @default(uuid())
  organizationId String
  customerId     String
  categoryId     String?
  subject        String
  status         SacTicketStatus @default(OPEN)
  createdAt      DateTime        @default(now())

  customer       CustomerProfile @relation(fields: [customerId], references: [id], onDelete: Cascade)
  comments       SacTicketComment[]
  technicalReport SacTechnicalReport?
  @@index([organizationId, status])
  @@map("sac_tickets")
}

model SacTicketComment {
  id       String @id @default(uuid())
  ticketId String
  authorType String // customer | staff
  body     String
  createdAt DateTime @default(now())

  ticket   SacTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@map("sac_ticket_comments")
}

model SacTechnicalReport {
  id        String @id @default(uuid())
  ticketId  String @unique
  findings  String
  createdById String

  ticket    SacTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@map("sac_technical_reports")
}

model SacProduct {
  id             String @id @default(uuid())
  organizationId String
  name           String
  sku            String

  @@map("sac_products")
}
```

### 4.10 IA

```prisma
model TenantAiCredential {
  id             String   @id @default(uuid())
  organizationId String   @unique
  provider       String   // anthropic | openai | google
  encryptedApiKey String  // criptografado em repouso (ver §6.6)
  keyLast4       String
  defaultModel   String
  createdAt      DateTime @default(now())

  @@map("tenant_ai_credentials")
}

model AiConversation {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  title          String?
  createdAt      DateTime @default(now())

  messages       AiMessage[]
  @@index([organizationId, userId])
  @@map("ai_conversations")
}

model AiMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // user | assistant | tool
  content        String
  toolCalls      Json?
  createdAt      DateTime @default(now())

  conversation   AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@map("ai_messages")
}

model LyraSecurityBlock {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  violationCount Int      @default(1)
  blockedUntil   DateTime?
  createdAt      DateTime @default(now())

  @@unique([organizationId, userId])
  @@map("lyra_security_blocks")
}
```

### 4.11 Billing (NOVO — Stripe)

```prisma
model Plan {
  id               String  @id @default(uuid())
  name             String  @unique // free | starter | business | enterprise
  stripePriceId    String? @unique
  maxUsers         Int
  availableModules String[] // ["ti","rh","financeiro","mkt","qualidade"]
  monthlyPrice     Decimal @db.Decimal(10, 2)

  subscriptions    Subscription[]
  @@map("plans")
}

model Subscription {
  id                   String              @id @default(uuid())
  organizationId       String              @unique
  planId               String
  stripeCustomerId     String              @unique
  stripeSubscriptionId String?             @unique
  status               SubscriptionStatus  @default(TRIALING)
  trialEndsAt          DateTime?
  currentPeriodEnd     DateTime?
  seats                Int                 @default(1)
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plan                 Plan         @relation(fields: [planId], references: [id])
  invoices             Invoice[]

  @@map("subscriptions")
}

model Invoice {
  id               String   @id @default(uuid())
  subscriptionId   String
  stripeInvoiceId  String   @unique
  amountPaid       Decimal  @db.Decimal(10, 2)
  status           String   // paid | open | void | uncollectible
  issuedAt         DateTime

  subscription     Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  @@map("invoices")
}

model UsageRecord {
  id             String   @id @default(uuid())
  organizationId String
  metric         String   // "active_users" | "ai_tokens" | "storage_mb"
  value          Int
  recordedAt     DateTime @default(now())

  @@index([organizationId, metric, recordedAt])
  @@map("usage_records")
}
```

### 4.12 Workflows / Automação (NOVO — ReactFlow)

```prisma
model Workflow {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  isActive       Boolean  @default(false)
  triggerType    WorkflowTriggerType
  triggerConfig  Json     @default("{}")
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  nodes          WorkflowNode[]
  edges          WorkflowEdge[]
  executions     WorkflowExecution[]

  @@index([organizationId, isActive])
  @@map("workflows")
}

model WorkflowNode {
  id         String            @id @default(uuid())
  workflowId String
  type       WorkflowNodeType
  config     Json              @default("{}") // parâmetros da ação/condição
  positionX  Float
  positionY  Float

  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@index([workflowId])
  @@map("workflow_nodes")
}

model WorkflowEdge {
  id           String @id @default(uuid())
  workflowId   String
  sourceNodeId String
  targetNodeId String
  condition    Json?  // ex: { "if": "true_branch" }

  workflow     Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@index([workflowId])
  @@map("workflow_edges")
}

model WorkflowExecution {
  id           String                   @id @default(uuid())
  workflowId   String
  status       WorkflowExecutionStatus  @default(RUNNING)
  triggerPayload Json
  startedAt    DateTime                 @default(now())
  finishedAt   DateTime?
  error        String?

  workflow     Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  logs         WorkflowExecutionLog[]
  @@index([workflowId, status])
  @@map("workflow_executions")
}

model WorkflowExecutionLog {
  id          String   @id @default(uuid())
  executionId String
  nodeId      String
  output      Json?
  createdAt   DateTime @default(now())

  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  @@map("workflow_execution_logs")
}
```

---

## 5. ESTRUTURA DE PASTAS

```
helpoint/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (marketing)/                 # Landing pública, sem tenant
│   │   │   └── page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── onboarding/page.tsx
│   │   │   └── convite/[id]/page.tsx
│   │   ├── (sac)/                        # Portal público do cliente final
│   │   │   ├── acesso/page.tsx
│   │   │   ├── entrar/page.tsx
│   │   │   ├── novo/page.tsx
│   │   │   └── meus-chamados/[id]/page.tsx
│   │   ├── (app)/                        # Painel interno (staff), org resolvida via middleware
│   │   │   ├── layout.tsx                # AppLayout + guard de sessão/role
│   │   │   ├── inicio/page.tsx
│   │   │   ├── helpdesk/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [ticketId]/page.tsx
│   │   │   ├── ti/
│   │   │   │   ├── chamados/
│   │   │   │   ├── licencas/
│   │   │   │   ├── contratos/
│   │   │   │   ├── manutencoes/
│   │   │   │   ├── pops/
│   │   │   │   └── indicadores/
│   │   │   ├── rh/
│   │   │   ├── financeiro/
│   │   │   ├── mkt/
│   │   │   ├── qualidade/
│   │   │   ├── automacoes/               # NOVO: builder de Workflows (ReactFlow)
│   │   │   │   ├── page.tsx              # lista de workflows
│   │   │   │   └── [workflowId]/page.tsx # canvas do builder
│   │   │   ├── configuracoes/
│   │   │   │   ├── sistema/
│   │   │   │   ├── identidade-visual/
│   │   │   │   ├── billing/              # NOVO: assinatura/Stripe portal
│   │   │   │   └── lyra/
│   │   │   └── inventario/
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   └── stripe/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── lyra/route.ts         # streaming SSE
│   │   │   │   └── suggest-reply/route.ts
│   │   │   └── workflows/
│   │   │       └── execute/route.ts
│   │   └── middleware.ts                 # resolução de organization (subdomain/domínio)
│   ├── modules/                          # lógica de domínio por módulo (não por rota)
│   │   ├── helpdesk/
│   │   │   ├── actions.ts                # Server Actions
│   │   │   ├── queries.ts
│   │   │   ├── schemas.ts                # validação Zod
│   │   │   └── components/
│   │   ├── ti/
│   │   ├── rh/
│   │   ├── financeiro/
│   │   ├── mkt/
│   │   ├── qualidade/
│   │   ├── sac/
│   │   ├── access/
│   │   ├── billing/
│   │   ├── workflows/
│   │   │   ├── engine/                   # motor de execução (BullMQ workers)
│   │   │   └── components/               # nós customizados do ReactFlow
│   │   └── ai/
│   ├── components/
│   │   └── ui/                           # shadcn/ui (portado ~1:1)
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts                 # Prisma Client singleton
│   │   │   └── withOrgContext.ts         # RLS session context (§3.3)
│   │   ├── auth/
│   │   │   ├── next-auth.config.ts
│   │   │   └── rbac.ts                   # checagem de AccessProfile
│   │   ├── redis.ts
│   │   ├── queue/                        # BullMQ (e-mail, workflows, IA async)
│   │   ├── ai/
│   │   │   ├── providers/                # anthropic.ts | openai.ts | google.ts
│   │   │   └── byok.ts
│   │   ├── stripe.ts
│   │   └── email/                        # templates + Resend client
│   ├── hooks/
│   └── types/
├── docker/
│   ├── Dockerfile
│   └── nginx/
│       └── helpoint.conf
├── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
└── tests/
```

---

## 6. PLANO DE SEGURANÇA

### 6.1 Fluxo de autenticação

1. Usuário acessa `{org}.helpoint.com.br/login` → middleware resolve `organizationId` pelo subdomínio.
2. `NextAuth` (Credentials Provider) valida `email`/`passwordHash` (bcrypt) escopado a `organizationId` — um mesmo e-mail pode existir em organizações diferentes como usuários distintos, replicando o comportamento atual de `profiles`.
3. Sessão NextAuth (JWT ou database session via Prisma Adapter) carrega `userId`, `organizationId`, `role`. Toda Server Action chama `withOrgContext(session.organizationId, session.userId, ...)` (§3.3) antes de tocar o banco.
4. Portal SAC (cliente final) usa fluxo **separado**: login por OTP (código por e-mail, tabela `sac_otp_codes` portada), sem senha, sessão própria com escopo restrito a `SacTicket`/`CustomerProfile` — nunca compartilha sessão com o painel interno (replica a separação `isCustomer` atual).

### 6.2 RBAC

Modelo único `AccessProfile` (§4.2), substituindo os 3 modelos coexistentes hoje. Checagem centralizada em `lib/auth/rbac.ts`:

```ts
export async function can(session: Session, resource: string, action: 'view'|'create'|'edit'|'delete'|'approve') {
  if (session.role === 'OWNER' || session.role === 'ADMIN') return true;
  const profile = await getUserAccessProfile(session.membershipId);
  return profile?.permissions?.[resource]?.[action] === true;
}
```

Toda Server Action/Route Handler sensível chama `can()` antes de mutar dados — nunca confiar só em RLS como única camada (RLS é a rede de segurança final, não a primeira checagem).

### 6.3 Rate limiting

Redis + `sliding window` por: IP (rotas públicas: login, SAC OTP, formulário público de chamado), por `userId` (APIs autenticadas), por `organizationId` (chamadas de IA — evita um tenant estourar custo/BYOK travado). Aplicado no `middleware.ts` para rotas públicas e em um wrapper de Route Handler para rotas autenticadas.

### 6.4 Validação de input

Zod em toda fronteira de entrada: schemas em `modules/*/schemas.ts`, validados em Server Actions (`schema.parse(formData)`) e em Route Handlers (`schema.parse(await req.json())`). Nenhuma query aceita payload não validado — mesmo padrão de disciplina que os hooks atuais (`useHelpdesk`, `useFinanceiro` etc.) já impõem no client, mas agora reforçado no servidor.

### 6.5 Domínios customizados (portado)

Fluxo de verificação DNS (CNAME/A + TXT `_helpoint-verify`) mantido como está hoje, migrado de Edge Function Deno para Route Handler Node, usando `dns/promises` do Node em vez de `Deno.resolveDns`.

### 6.6 Segredos e chaves de IA (BYOK)

Hoje a `api_key` do tenant fica em texto no Postgres, protegida só por RLS `service_role`-only. Na nova stack, sem o conceito de `service_role`, recomenda-se **criptografia em nível de aplicação** (envelope encryption com uma chave mestra em KMS/Vault) além do RLS — a coluna `encryptedApiKey` (§4.10) nunca é decifrada fora dos Route Handlers de IA, nunca trafega para o client.

### 6.7 Segurança do assistente Lyra (portado)

Detecção de padrões de prompt injection/probing (regex bloqueando tentativas de extração de system prompt/credenciais) + bloqueio progressivo por usuário (`LyraSecurityBlock`: 1ª violação 5 min, 2ª 24h, 3ª permanente) — lógica portada 1:1 do `_shared/ai.ts` atual para `lib/ai/byok.ts`.

### 6.8 Auditoria

Em vez de trigger de banco (`audit_trigger_fn`), usar uma extensão do Prisma Client (`$extends` com hook de `query`) que grava em `AuditLog` para models marcados como auditáveis — mais portável entre bancos e mais fácil de testar do que lógica em PL/pgSQL, mantendo o mesmo resultado funcional.

---

## 7. PLANO DE DEPLOY E MIGRAÇÃO

### 7.1 Infraestrutura: VPS Hostinger

Toda a stack nova roda numa única VPS via Docker Compose, atrás do Cloudflare:

```dockerfile
# docker/Dockerfile — multi-stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`docker-compose.yml` na VPS: `app` (Next.js), `postgres:16`, `redis:7`, `worker` (BullMQ, mesmo build da imagem, comando diferente), `nginx`. Backup automatizado do Postgres (`pg_dump` agendado via cron, enviado para um bucket externo — pode ser o mesmo R2 usado para storage de arquivos) é obrigatório desde o dia 1, já que não há mais um provedor gerenciado cuidando disso.

### 7.2 Nginx

- Reverse proxy com `server_name ~^(?<org>.+)\.helpoint\.com\.br$;` para capturar qualquer subdomínio de tenant.
- `server_name` adicional por domínio customizado verificado (config gerada dinamicamente ou via `map` lendo de uma lista sincronizada com `organization_domains`).
- Rate limiting em nível de edge (`limit_req_zone`) como primeira camada, antes do Redis da aplicação.
- Proxy para `app:3000`, timeouts adequados para streaming SSE (rotas de IA).

### 7.3 SSL / DNS

- **Cloudflare** (plano gratuito) na frente da VPS: DNS, proxy, e SSL simplificado para o wildcard de subdomínio (`*.helpoint.com.br`) sem precisar lidar com desafio DNS-01 do Let's Encrypt manualmente — Cloudflare emite certificado *edge* e a VPS usa um *Origin Certificate* do próprio Cloudflare para o túnel até o Nginx.
- Domínios customizados de tenant: verificação DNS (CNAME/A + TXT `_helpoint-verify`) mantida como está hoje (§6.5), com emissão de certificado sob demanda após verificação bem-sucedida.

### 7.4 CI/CD

`.github/workflows/ci.yml`: lint → typecheck → testes (Vitest) → build → `prisma migrate deploy` (ambiente de staging) em PRs. `deploy.yml`: build da imagem Docker → push para registry → deploy na VPS (rolling, via SSH + `docker compose pull && up -d`, ou uma ferramenta com painel como Coolify/Dokploy se preferir algo menos manual) → smoke test pós-deploy → rollback automático se falhar.

### 7.5 Estratégia de migração incremental (strangler-fig)

**Fase 0 — Fundação (sem impacto em produção)**
Repositório Next.js novo, `prisma db pull` contra o banco Supabase real de produção (fonte da verdade para fechar as divergências do §1.4.4), Prisma schema ajustado ao modelo-alvo (§4), NextAuth com Prisma Adapter, middleware de tenant (§3.2), RLS via session variables (§3.3) validada em ambiente isolado, VPS/Docker/Nginx/Cloudflare/CI-CD de staging funcionando ponta-a-ponta com um banco de teste (cópia).

**Fase 1 — Migração de dados e identidade**
Scripts de ETL (`pg_dump`/`pg_restore` ou replicação lógica) do Postgres do Supabase para o Postgres novo (container na VPS), preservando UUIDs. Migração de usuários: como hashes do Supabase GoTrue não são portáveis para bcrypt/argon2 do NextAuth, todos os usuários existentes passam por **fluxo de redefinição de senha obrigatória** no primeiro login pós-migração (e-mail com link, reaproveitando o template Resend já existente). Objetos do Supabase Storage copiados para Cloudflare R2 (bucket a bucket), URLs atualizadas.

**Fase 2 — Roteamento em paralelo (strangler real)**
Nginx/edge decide, por `organization_id` (feature flag em `organizations.settings`), se a requisição vai para o sistema legado (Vite/Supabase) ou para o Next.js novo na VPS. Primeiro tenant piloto (interno, baixo risco) migrado; módulo inicial: **Notificações + POPs** (menor acoplamento, bom para validar RLS/auth/multi-tenancy novos sem tocar em fluxos financeiros/RH críticos).

**Fase 3 — Módulos por ordem de prioridade**
1. TI/Helpdesk (módulo mais maduro e central — 22 arquivos, usado por todos os tenants)
2. Access/RBAC (unificação dos 3 modelos, §1.4.1 — pré-requisito para os módulos seguintes)
3. RH, Financeiro, Marketing, Qualidade (em paralelo, times diferentes se houver)
4. Portal SAC público (maior exposição externa, migrar com mais margem de teste)
5. E-mail: `pgmq` → BullMQ/Redis; Edge Functions restantes → Route Handlers

Cada módulo migrado passa por: paridade funcional validada em staging → tenant piloto em produção → expansão gradual (%) → 100%.

**Fase 4 — Cutover**
Todos os tenants apontando para o Next.js novo na VPS. Supabase (Postgres gerenciado, Auth, Edge Functions, Storage) descomissionado. DNS wildcard e domínios customizados repontados definitivamente via Cloudflare.

**Fase 5 — Capacidades novas**
Billing/Stripe (§4.11) e Workflows/Automação (§4.12) construídos direto na stack nova — não existem hoje, sem legado para conciliar.

### 7.6 Rollback

Cada fase de módulo mantém o sistema legado funcional em paralelo até a expansão atingir 100% + N dias de estabilidade — o flag de roteamento por `organization_id` permite reverter um tenant específico para o legado em minutos se um problema crítico for encontrado, sem afetar os demais tenants.

---

## 8. Próximos passos após aprovação deste documento

1. Rodar `prisma db pull` contra o banco de produção real para fechar as divergências de schema sinalizadas em §1.4.4 antes de escrever a primeira migration.
2. Decidir o destino das tabelas Kanban órfãs (§1.4.2) — revivê-las como parte do módulo de Workflows ou descartá-las formalmente.
3. Provisionar a VPS Hostinger (Docker + Docker Compose instalados), configurar o domínio no Cloudflare e criar o bucket no Cloudflare R2.
4. Iniciar a Fase 0 (fundação) em um repositório novo, sem tocar no sistema em produção.
