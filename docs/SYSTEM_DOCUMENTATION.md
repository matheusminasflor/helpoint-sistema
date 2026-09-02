# HELPOINT v2.0 - Documentacao Completa do Sistema

> Ultima atualizacao: 2026-02-23

---

## 1. Visao Geral

| Campo | Valor |
|-------|-------|
| Nome | HELPOINT v2.0 |
| Tipo | SaaS multi-tenant para gestao departamental |
| Frontend | React 18.3 + Vite + TypeScript + Tailwind CSS |
| Backend | Lovable Cloud (PostgreSQL, Edge Functions, Auth, Storage) |
| Repositorio | Gerenciado via Lovable |

O HELPOINT e uma plataforma SaaS completa para gestao departamental de empresas. Cada empresa (tenant) possui seu ambiente isolado com modulos configuráveis conforme o plano contratado.

---

## 2. Arquitetura Tecnica

### 2.1 Stack Frontend

| Tecnologia | Versao | Funcao |
|-----------|--------|--------|
| React | 18.3.1 | Framework UI |
| Vite | - | Build tool e dev server |
| TypeScript | - | Tipagem estatica |
| Tailwind CSS | - | Estilizacao utility-first |
| TanStack Query | v5.83 | Gerenciamento de estado server-side |
| React Router | v6.30 | Roteamento SPA |
| shadcn/ui + Radix UI | - | Componentes UI acessiveis |
| @dnd-kit | core 6.3 / sortable 10.0 | Drag-and-drop |
| Recharts | 2.15 | Graficos e visualizacoes |
| jsPDF | 4.0 | Geracao de relatorios PDF |
| Lucide React | 0.462 | Icones |
| date-fns | 3.6 | Manipulacao de datas |
| Zod | 3.25 | Validacao de schemas |
| React Hook Form | 7.61 | Formularios |
| Sonner | 1.7 | Notificacoes toast |
| @xyflow/react | 12.10 | Diagramas de rede interativos |
| Three.js + R3F | 0.169 | Visualizacoes 3D (mapas de instalacoes) |

### 2.2 Stack Backend (Lovable Cloud)

| Componente | Descricao |
|-----------|-----------|
| PostgreSQL | Banco de dados relacional com RLS |
| Edge Functions | Funcoes serverless Deno para logica backend |
| Auth | Autenticacao com email/senha |
| Storage | Armazenamento de arquivos (anexos, avatares) |

### 2.3 Estrutura de Diretorios

```
src/
├── components/
│   ├── ai/              # Componentes de IA (Lyra)
│   ├── contracts/        # Gestao de contratos
│   ├── dashboard/        # Dashboard TI (indicadores + widgets)
│   ├── helpdesk/         # Sistema de chamados
│   ├── inventory/        # Inventario de ativos
│   ├── kanban/           # Quadro Kanban
│   ├── layout/           # Layout (sidebar, header)
│   ├── licenses/         # Licencas de software
│   ├── maintenances/     # Manutencoes
│   ├── mkt/              # Marketing
│   ├── pops/             # Base de conhecimento (POPs)
│   ├── request/          # Nova solicitacao
│   ├── settings/         # Configuracoes
│   ├── ti/               # Configuracoes de TI
│   ├── ui/               # Componentes base (shadcn)
│   └── workos/           # Componentes genericos de tabela/cards
├── contexts/
│   └── AuthContext.tsx    # Contexto de autenticacao global
├── hooks/                # 35+ hooks customizados
├── integrations/
│   └── supabase/         # Cliente e tipos do banco
├── pages/                # Paginas da aplicacao
├── types/                # Tipos TypeScript
└── main.tsx              # Ponto de entrada
```

---

## 3. Modelo Multi-Tenant

### 3.1 Estrategia

O HELPOINT utiliza uma estrategia de **banco unico com isolamento por coluna `tenant_id`**. Todas as tabelas de dados possuem uma coluna `tenant_id` que referencia a tabela `tenants`.

### 3.2 Mecanismos de Isolamento

| Mecanismo | Descricao |
|-----------|-----------|
| `get_user_tenant_id()` | Funcao SQL que retorna o `tenant_id` do usuario autenticado via `auth.uid()` |
| RLS (Row Level Security) | Todas as tabelas possuem politicas que filtram por `tenant_id = get_user_tenant_id()` |
| `validate_tenant_insert` | Trigger que impede insercao de dados com `tenant_id` diferente do usuario autenticado |

### 3.3 Fluxo de Autenticacao

1. Usuario faz login com email/senha
2. O sistema busca o `profile` associado ao `auth.uid()`
3. O `tenant_id` do profile determina o ambiente do usuario
4. Todas as queries subsequentes sao filtradas automaticamente pelo RLS

---

## 4. Sistema de Permissoes (3 Camadas)

### Camada 1: Plano do Tenant

Define quais modulos estao disponiveis para a empresa.

| Plano | Descricao | Modulos |
|-------|-----------|---------|
| `free` | Trial gratuito | Todos (com limite de 5 usuarios) |
| `starter` | Plano inicial | Configuravel |
| `enterprise` | Plano completo | Todos |
| `custom` | Personalizado | Sob medida |

Configuracao armazenada em `tenants.plan_config` (JSONB):

```json
{
  "plan": "free",
  "max_users": 5,
  "trial_ends_at": null,
  "available_modules": ["ti", "comercial", "marketing", "rh", "financeiro", "producao", "expedicao", "educacional", "qualidade"],
  "features": {
    "lyra_advanced": true,
    "advanced_reports": true,
    "export_data": true
  }
}
```

### Camada 2: Role do Usuario

| Role | Nivel | Descricao |
|------|-------|-----------|
| `owner` | 1 | Proprietario da conta com controle total |
| `admin` | 2 | Pode gerenciar todos os usuarios e configuracoes |
| `manager` | 3 | Pode gerenciar equipes e modulos que tem acesso |
| `member` | 4 | Acesso operacional aos modulos liberados |
| `viewer` | 5 | Apenas visualizacao, sem edicao |

Funcoes auxiliares no banco:
- `is_admin_or_higher(uid)` - Verifica se e admin ou superior
- `is_supervisor_or_higher(uid)` - Verifica se e manager ou superior
- `is_diretor(uid)` - Verifica se e owner
- `has_role(uid, role)` - Verifica se possui role especifica

### Camada 3: Perfil de Modulo

Acesso granular dentro de cada modulo, controlado pelas tabelas:
- `ti_access_profiles` - Perfis de acesso para o modulo TI
- `ti_user_profiles` - Associacao usuario-perfil no modulo TI
- `user_module_access` - Quais modulos cada usuario pode acessar

---

## 5. Mapa de Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/login` | Login | Tela de autenticacao |
| `/` | Index | Pagina inicial / redirecionamento |
| `/helpdesk` | Helpdesk | Lista de chamados do usuario |
| `/helpdesk/:id` | TicketDetail | Detalhe de um chamado |
| `/ti` | TIDashboard | Dashboard TI (Indicadores + Dashboard visual) |
| `/ti/chamados` | HelpdeskTI | Visao tecnica dos chamados |
| `/ti/chamados/:id` | TicketDetail | Detalhe de chamado (rota TI) |
| `/ti/licencas` | Licenses | Gestao de licencas de software |
| `/ti/contratos` | Contracts | Gestao de contratos |
| `/ti/manutencoes` | Maintenances | Manutencoes programadas |
| `/ti/configuracoes` | TIConfiguracoes | Configuracoes do modulo TI |
| `/ti/pops` | POPs | Lista de POPs (procedimentos) |
| `/ti/pops/novo` | TutorialEditor | Criar novo POP |
| `/ti/pops/:id/editar` | TutorialEditor | Editar POP existente |
| `/inventario` | Inventory | Inventario de ativos (CMDB) |
| `/nova-solicitacao` | NewRequest | Formulario de nova solicitacao |
| `/kanban` | Kanban | Quadro Kanban de demandas |
| `/base-conhecimento` | Portal | Portal de base de conhecimento |
| `/base-conhecimento/:id` | TutorialViewer | Visualizar tutorial |
| `/mkt` | MKTDashboard | Dashboard de Marketing |
| `/mkt/influenciadores` | MKTInfluencers | Gestao de influenciadores |
| `/mkt/eventos` | MKTEvents | Gestao de eventos |
| `/mkt/social` | MKTSocialCalendar | Calendario de posts sociais |
| `/mkt/fornecedores` | MKTSuppliers | Gestao de fornecedores |
| `/mkt/ugc` | MKTUGC | Conteudo gerado por usuarios |
| `/mkt/configuracoes` | MKTConfiguracoes | Configuracoes de Marketing |
| `/configuracoes/sistema` | SystemSettings | Configuracoes gerais do sistema |
| `/configuracoes/lyra` | LyraSettings | Configuracoes da IA Lyra |
| `/portal` | Portal | Rota legada (redireciona) |
| `/portal/:id` | TutorialViewer | Rota legada (redireciona) |
| `*` | NotFound | Pagina 404 |

---

## 6. Modulos do Sistema

### 6.1 TI (Gestao de Tecnologia da Informacao)

#### Dashboard (`/ti`)

Dividido em duas abas:

**Aba Indicadores**: Visao objetiva com tabela de metricas:
- Chamados abertos, resolvidos, em andamento
- Tempo medio de resolucao
- Taxa de cumprimento de SLA
- SLAs violados
- Total de ativos, licencas expirando, contratos expirando, manutencoes agendadas
- Tabela de desempenho por tecnico
- Tabela de top solicitantes
- Filtros de periodo (7d, 30d, 90d, 12m, personalizado)

**Aba Dashboard**: Widgets visuais arrastaveis:
- KPIs com bordas coloridas e icones
- Grafico de tendencia (Area Chart com gradiente)
- Distribuicao por prioridade (Bar Chart horizontal)
- Distribuicao por categoria (Donut Chart)
- Desempenho de tecnicos
- Efetividade de POPs
- Top solicitantes
- Chamados vencidos
- Drag-and-drop via @dnd-kit para reorganizar widgets
- Personalizacao de quais widgets exibir
- Ordem salva em `dashboard_preferences`

#### Helpdesk (`/helpdesk`, `/ti/chamados`)

- Abertura de chamados com formulario dinamico
- Sistema de conversacao (mensagens tecnicas e publicas)
- Atribuicao automatica e manual de tecnicos
- SLA configuravel por prioridade (sla_policies)
- Transferencia de chamados entre tecnicos
- Resolucao com notas de resolucao
- Avaliacao de satisfacao (1-5 estrelas)
- Status: open, in_progress, waiting, resolved, closed
- Prioridades: critical, high, medium, low
- Categorias e subcategorias configuraveis
- Vinculacao com ativos do inventario
- Barra de progresso visual do ciclo de vida

#### Inventario / CMDB (`/inventario`)

- Cadastro de ativos com categorias: hardware, mobile, peripheral, network, software, other
- Subcategorias dinamicas por categoria
- Campos: tag, serial, fabricante, modelo, localizacao, departamento, responsavel
- Status: active, inactive, maintenance, retired, disposed
- Valor de compra, data de compra, garantia
- Especificacoes tecnicas (JSONB flexivel)
- Vinculacao com chamados e manutencoes
- Contagem de chamados por ativo

#### Contratos (`/ti/contratos`)

- Gestao de contratos de software e servicos
- Campos: fornecedor, tipo, valor, vigencia, renovacao
- Alertas de vencimento

#### Licencas (`/ti/licencas`)

- Gestao de licencas de software
- Tipos: subscription, perpetual, oem, freeware, trial
- Controle de quantidade total e atribuicoes
- Atribuicao a usuarios e/ou ativos
- Chaves de licenca
- Alertas de expiracao

#### Manutencoes (`/ti/manutencoes`)

- Tipos: preventive, corrective, upgrade
- Status: scheduled, in_progress, completed, cancelled
- Vinculacao com ativo e chamado
- Agendamento e custo
- Provedor externo opcional

#### Base de Conhecimento / POPs (`/ti/pops`)

- Editor de tutoriais com blocos (Markdown, midia, video)
- Versionamento com historico de alteracoes
- Sistema de feedback e avaliacoes por usuarios
- Busca semantica com IA
- Templates de tutoriais pre-definidos
- Categorias e subcategorias
- Keywords para busca
- Visibilidade configuravel (publico, interno, restrito)
- Conversao de video para GIF
- Upload de midias

### 6.2 Marketing

#### Dashboard (`/mkt`)
- Metricas consolidadas de campanhas
- Visao geral de influenciadores, eventos e posts

#### Influenciadores (`/mkt/influenciadores`)
- Cadastro com redes sociais (Instagram, TikTok, YouTube, LinkedIn, Twitter)
- Categorias: nano, micro, mid, macro, mega
- Status: prospect, active, inactive, blocked
- Taxa de engajamento e contagem de seguidores
- Tags e faixa de preco

#### Eventos (`/mkt/eventos`)
- Tipos: feira, conferencia, workshop, lancamento, webinar, meetup, outro
- Status: planning, confirmed, in_progress, completed, cancelled
- Participantes com roles (palestrante, patrocinador, expositor, convidado)
- Orcamento vs custo real
- Online ou presencial

#### Calendario Social (`/mkt/social`)
- Posts agendados por plataforma (Instagram, Facebook, TikTok, LinkedIn, YouTube, Twitter)
- Tipos: feed, stories, reels, shorts, carousel, live, article, tweet
- Status: draft, scheduled, published, failed
- Hashtags e midias
- Vinculacao com influenciadores e eventos

#### Fornecedores (`/mkt/fornecedores`)
- Categorias: grafica, audiovisual, digital, brindes, cenografia, buffet, logistica, outro
- Status: active, inactive, blocked
- CNPJ, contatos, servicos
- Sistema de avaliacao (rating)
- Cotacoes vinculadas

#### UGC - User Generated Content (`/mkt/ugc`)
- Curadoria de conteudo gerado por usuarios
- Tipos de midia: image, video, text, story
- Status de aprovacao: pending, approved, rejected, archived
- Direitos de uso
- Engajamento original (JSONB)
- Vinculacao com influenciadores

#### Integracao Meta
- OAuth com Facebook/Instagram
- Publicacao direta de posts
- Gerenciamento de contas e tokens

### 6.3 Demandas

#### Kanban (`/kanban`)
- Boards por departamento
- Colunas personalizaveis com cores e limite WIP
- Coluna "done" configuravel
- Cards com:
  - Titulo, descricao, prioridade (low, medium, high, urgent)
  - Responsavel e data de vencimento
  - Cor de capa
  - Checklists com itens marcaveis
  - Comentarios (publicos e internos)
  - Membros do card
  - Mencoes com permissao de edicao
  - Anexos
  - Origem (source_type + source_id) para vincular a chamados
- Drag-and-drop entre colunas
- Metricas do board

#### Nova Solicitacao (`/nova-solicitacao`)
- Formulario por departamento
- Campos dinamicos configuraveis (ticket_form_fields)
- Tipos de campo: text, textarea, select, checkbox, date, number, file
- Respostas salvas em ticket_form_responses

### 6.4 Conhecimento

#### Portal (`/base-conhecimento`)
- Listagem publica de tutoriais/POPs
- Busca semantica com IA (Edge Function ai-semantic-search)
- Visualizacao de tutoriais com Markdown renderizado
- Sistema de feedback (rating + comentarios)
- Interacoes rastreadas (pop_interactions)

---

## 7. Schema do Banco de Dados

### 7.1 Tabelas Core

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `tenants` | id, name, slug, plan, plan_config, settings, logo_url | Empresas/organizacoes |
| `profiles` | id, tenant_id, email, full_name, department, job_title, is_active | Perfis de usuario |
| `user_roles` | id, user_id, role, granted_by | Roles dos usuarios (owner/admin/manager/member/viewer) |
| `audit_logs` | id, tenant_id, user_id, action, table_name, record_id, old_data, new_data | Log de auditoria |
| `tasks` | id, tenant_id, user_id, title, priority, status, due_date, is_ai_suggested | Tarefas pessoais |
| `notifications` | id, tenant_id, user_id, type, title, message, is_read, reference_type/id | Notificacoes |
| `dashboard_preferences` | id, tenant_id, user_id, module, visible_widgets, widget_order, default_period | Preferencias do dashboard |

### 7.2 Tabelas Helpdesk

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `tickets` | id, tenant_id, ticket_number, title, description, priority, status, requester_id, assigned_to, sla_due_at | Chamados |
| `ticket_comments` | id, tenant_id, ticket_id, author_id, content, is_internal | Mensagens/comentarios dos chamados |
| `ticket_attachments` | id, tenant_id, ticket_id, file_name, file_url | Anexos de chamados |
| `ticket_form_fields` | id, tenant_id, department, field_name, field_type, is_required, options | Campos dinamicos de formulario |
| `ticket_form_responses` | id, tenant_id, ticket_id, field_id, value | Respostas dos campos dinamicos |
| `ticket_patterns` | id, tenant_id, pattern_name, keywords, occurrence_count, suggested_pop_id | Padroes detectados por IA |
| `sla_policies` | id, tenant_id, name, priority, first_response_time, resolution_time, is_active | Politicas de SLA |
| `ti_categories` | id, tenant_id, name, subcategories | Categorias de chamados |

### 7.3 Tabelas Inventario

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `assets` | id, tenant_id, name, asset_tag, category, status, assigned_to, specs | Ativos de TI |
| `asset_maintenances` | id, tenant_id, asset_id, maintenance_type, status, scheduled_date, cost | Manutencoes |
| `software_licenses` | id, tenant_id, name, vendor, license_type, total_quantity, expiry_date | Licencas de software |
| `software_license_keys` | id, tenant_id, license_id, key_value | Chaves de licenca |
| `software_contracts` | id, tenant_id, name, vendor, start_date, end_date, value | Contratos de software |
| `license_assignments` | id, tenant_id, license_id, assigned_to, asset_id | Atribuicoes de licenca |
| `network_diagrams` | id, tenant_id, name, data (JSONB), status | Diagramas de rede |
| `facility_maps` | id, tenant_id, name, data (JSONB), status | Mapas de instalacoes |

### 7.4 Tabelas Conhecimento

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `pops` | id, tenant_id, title, content, category, keywords, status, created_by | Procedimentos operacionais |
| `pop_versions` | id, tenant_id, pop_id, version_number, title, content, change_summary | Historico de versoes |
| `pop_attachments` | id, tenant_id, pop_id, file_name, file_url | Anexos de POPs |
| `pop_feedbacks` | id, tenant_id, pop_id, user_id, rating, is_helpful, comment | Avaliacoes |
| `pop_interactions` | id, tenant_id, pop_id, user_id, interaction_type | Rastreamento de interacoes |

### 7.5 Tabelas Kanban

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `kanban_boards` | id, tenant_id, name, department, is_active | Quadros Kanban |
| `kanban_columns` | id, tenant_id, board_id, name, sort_order, color, wip_limit, is_done_column | Colunas dos quadros |
| `kanban_cards` | id, tenant_id, board_id, column_id, title, priority, assigned_to, due_date, sort_order | Cards |
| `kanban_card_attachments` | id, tenant_id, card_id, file_name, file_url | Anexos de cards |
| `kanban_card_comments` | id, tenant_id, card_id, author_id, content, is_internal | Comentarios |
| `kanban_card_members` | id, tenant_id, card_id, user_id | Membros do card |
| `kanban_card_mentions` | id, tenant_id, card_id, mentioned_user_id, mentioned_by, can_edit | Mencoes |
| `kanban_checklists` | id, tenant_id, card_id, title, sort_order | Checklists |
| `kanban_checklist_items` | id, tenant_id, checklist_id, title, is_completed, sort_order | Itens de checklist |

### 7.6 Tabelas Marketing

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `mkt_influencers` | id, tenant_id, name, category, status, followers_count, engagement_rate | Influenciadores |
| `mkt_events` | id, tenant_id, title, event_type, status, start_date, budget | Eventos |
| `mkt_event_participants` | id, tenant_id, event_id, influencer_id, role, status, fee | Participantes |
| `mkt_social_accounts` | id, tenant_id, platform, account_name, access_token, is_active | Contas sociais |
| `mkt_social_posts` | id, tenant_id, title, platform, post_type, status, scheduled_at | Posts sociais |
| `mkt_suppliers` | id, tenant_id, name, category, status, rating, cnpj | Fornecedores |
| `mkt_ugc_content` | id, tenant_id, title, media_type, approval_status, source_platform | Conteudo UGC |
| `mkt_quotations` | id, tenant_id, title, supplier_id, total_value, status | Cotacoes |
| `mkt_ai_generations` | id, tenant_id, type, prompt, result, model_used, accepted | Geracoes de IA |

### 7.7 Tabelas de Permissoes

| Tabela | Colunas Principais | Descricao |
|--------|-------------------|-----------|
| `ti_access_profiles` | id, tenant_id, name, permissions | Perfis de acesso TI |
| `ti_user_profiles` | id, tenant_id, user_id, profile_id | Associacao usuario-perfil TI |
| `user_module_access` | id, tenant_id, user_id, module, granted_by | Acesso a modulos |
| `tenant_invites` | id, tenant_id, email, role, expires_at, used_at | Convites para o tenant |

---

## 8. Edge Functions

| Funcao | Descricao | Auth |
|--------|-----------|------|
| `ai-analyze-patterns` | Analisa padroes recorrentes em chamados usando IA | JWT |
| `ai-match-pop` | Sugere POPs relevantes para um chamado usando IA | JWT |
| `ai-refine` | Refina textos (descricoes, respostas) usando IA | Publico |
| `ai-secretary` | Secretaria virtual com resumo diario e sugestoes de tarefas | Publico |
| `ai-semantic-search` | Busca semantica em POPs e base de conhecimento | JWT |
| `check-alerts` | Verifica e dispara alertas (SLA, vencimentos, etc.) | JWT |
| `invite-signup` | Processa cadastro via convite de tenant | JWT |
| `mkt-ai-creative` | Gera conteudo criativo para marketing usando IA | Publico |
| `mkt-meta-oauth` | Gerencia fluxo OAuth com Meta (Facebook/Instagram) | Publico |
| `mkt-meta-publish` | Publica posts nas redes Meta | Publico |

---

## 9. Seguranca

### 9.1 Row Level Security (RLS)

Todas as tabelas possuem RLS habilitado. As politicas seguem o padrao:

- **SELECT**: Filtro por `tenant_id = get_user_tenant_id()` + verificacao de role quando necessario
- **INSERT**: Verificacao de `tenant_id` + role minima (geralmente member)
- **UPDATE**: Verificacao de `tenant_id` + role minima ou propriedade do registro
- **DELETE**: Restrito a roles superiores (geralmente director/owner)

### 9.2 Funcoes de Seguranca

| Funcao | Descricao |
|--------|-----------|
| `get_user_tenant_id()` | Retorna o tenant_id do usuario autenticado |
| `is_admin_or_higher(uid)` | Verifica se e admin, manager ou owner |
| `is_supervisor_or_higher(uid)` | Verifica se e manager ou owner |
| `is_diretor(uid)` | Verifica se e owner |
| `has_role(uid, role)` | Verifica se possui uma role especifica |
| `user_belongs_to_board_department(board_id)` | Verifica se usuario pertence ao departamento do board |
| `user_mentioned_in_card(card_id)` | Verifica se usuario foi mencionado em um card |
| `user_is_card_member(card_id)` | Verifica se usuario e membro de um card |

### 9.3 Triggers de Seguranca

- `validate_tenant_insert`: Impede insercao de dados com tenant_id diferente do usuario autenticado
- Audit logs automaticos para rastreamento de alteracoes

---

## 10. Navegacao (Sidebar)

A sidebar e organizada em "mundos" com agrupamento logico:

```
DEMANDAS
├── Nova Solicitacao     (/nova-solicitacao)
├── Meu Helpdesk         (/helpdesk)
└── Kanban               (/kanban)

CONHECIMENTO
└── Base de Conhecimento (/base-conhecimento)

GESTAO
├── TI
│   ├── Dashboard        (/ti)
│   ├── Chamados         (/ti/chamados)
│   ├── Inventario       (/inventario)
│   ├── Licencas         (/ti/licencas)
│   ├── Contratos        (/ti/contratos)
│   ├── Manutencoes      (/ti/manutencoes)
│   ├── POPs             (/ti/pops)
│   └── Configuracoes    (/ti/configuracoes)
└── Marketing
    ├── Dashboard        (/mkt)
    ├── Influenciadores  (/mkt/influenciadores)
    ├── Eventos          (/mkt/eventos)
    ├── Calendario Social(/mkt/social)
    ├── Fornecedores     (/mkt/fornecedores)
    ├── UGC              (/mkt/ugc)
    └── Configuracoes    (/mkt/configuracoes)

CONFIGURACOES
├── Usuarios e Sistema   (/configuracoes/sistema)
└── IA / Lyra            (/configuracoes/lyra)
```

A visibilidade dos itens respeita:
1. Modulos disponiveis no plano do tenant
2. Modulos atribuidos ao usuario (user_module_access)
3. Role do usuario

---

## 11. Dependencias Principais

| Pacote | Versao | Uso |
|--------|--------|-----|
| react | 18.3.1 | Framework UI |
| react-dom | 18.3.1 | Renderizacao DOM |
| react-router-dom | 6.30.1 | Roteamento |
| @tanstack/react-query | 5.83.0 | Estado server-side |
| @supabase/supabase-js | 2.91.0 | Cliente backend |
| tailwindcss-animate | 1.0.7 | Animacoes CSS |
| class-variance-authority | 0.7.1 | Variantes de componentes |
| clsx | 2.1.1 | Classes condicionais |
| tailwind-merge | 2.6.0 | Merge de classes Tailwind |
| @radix-ui/* | Varias | Componentes UI primitivos |
| lucide-react | 0.462.0 | Icones |
| recharts | 2.15.4 | Graficos |
| @dnd-kit/core | 6.3.1 | Drag-and-drop core |
| @dnd-kit/sortable | 10.0.0 | Drag-and-drop sortable |
| react-hook-form | 7.61.1 | Formularios |
| @hookform/resolvers | 3.10.0 | Validacao de formularios |
| zod | 3.25.76 | Validacao de schemas |
| date-fns | 3.6.0 | Manipulacao de datas |
| jspdf | 4.0.0 | Geracao de PDF |
| sonner | 1.7.4 | Notificacoes toast |
| @xyflow/react | 12.10.0 | Diagramas interativos |
| three | 0.169.0 | 3D rendering |
| @react-three/fiber | 8.18.0 | React Three.js |
| @react-three/drei | 9.122.0 | Helpers Three.js |
| html-to-image | 1.11.13 | Captura de tela |
| gifshot | 0.4.5 | Conversao video-GIF |
| cmdk | 1.1.1 | Command palette |
| embla-carousel-react | 8.6.0 | Carousel |
| vaul | 0.9.9 | Drawer mobile |
| input-otp | 1.4.2 | Input OTP |
| react-resizable-panels | 2.1.9 | Paineis redimensionaveis |
| next-themes | 0.3.0 | Temas claro/escuro |
| react-day-picker | 8.10.1 | Seletor de datas |

---

## 12. Hooks Customizados

| Hook | Descricao |
|------|-----------|
| `useAISecretary` | Integra com a secretaria virtual IA (resumos, tarefas) |
| `useContracts` | CRUD de contratos de software |
| `useDashboardPreferences` | Gerencia preferencias do dashboard (widgets, ordem, periodo) |
| `useHelpdesk` | Operacoes de chamados (listar, criar, atualizar) |
| `useHelpdeskMetrics` | Metricas do helpdesk (contagens, SLA, tempos) |
| `useInventory` | CRUD de ativos do inventario |
| `useKanban` | Operacoes do quadro Kanban (boards, colunas, cards) |
| `useKanbanMetrics` | Metricas dos boards Kanban |
| `useLicenses` | CRUD de licencas de software |
| `useMaintenances` | CRUD de manutencoes |
| `useMKTAICreative` | Geracao de conteudo criativo com IA |
| `useMKTEvents` | CRUD de eventos de marketing |
| `useMKTInfluencers` | CRUD de influenciadores |
| `useMKTMetrics` | Metricas de marketing |
| `useMKTQuotations` | CRUD de cotacoes |
| `useMKTSocialAccounts` | Gestao de contas sociais |
| `useMKTSocialPosts` | CRUD de posts sociais |
| `useMKTSuppliers` | CRUD de fornecedores |
| `useMKTUGC` | CRUD de conteudo UGC |
| `useNotifications` | Sistema de notificacoes (listar, marcar lidas) |
| `usePlanLimits` | Verificacao de limites do plano (modulos, features, usuarios) |
| `usePOPAttachments` | Anexos de POPs |
| `usePOPFeedback` | Avaliacoes e feedback de POPs |
| `usePOPMatcher` | Match de POPs com chamados via IA |
| `usePOPVersions` | Versionamento de POPs |
| `usePOPs` | CRUD de procedimentos operacionais |
| `useRequesterMetrics` | Metricas de solicitantes (top requesters) |
| `useSemanticSearch` | Busca semantica com IA |
| `useSLAPolicies` | Gestao de politicas de SLA |
| `useTechnicians` | Lista de tecnicos disponiveis |
| `useTechnicianPerformance` | Metricas de desempenho de tecnicos |
| `useTenantSettings` | Configuracoes do tenant |
| `useTIAccessProfiles` | Perfis de acesso do modulo TI |
| `useTICategories` | Categorias de chamados |
| `useTicketActions` | Acoes em chamados (transferir, resolver, fechar) |
| `useTicketComments` | Comentarios/conversacao de chamados |
| `useTicketFormFields` | Campos dinamicos de formularios |
| `useTicketPatterns` | Padroes de chamados detectados por IA |
| `useUndoRedo` | Desfazer/refazer no editor de POPs |
| `useUserManagement` | Gestao de usuarios (listar, convidar, desativar) |
| `useUserModules` | Modulos acessiveis por usuario |
| `useVisibleModules` | Modulos visiveis na sidebar (combina plano + acesso) |
| `usePlanLimits` | Limites e features do plano do tenant |
| `use-mobile` | Deteccao de dispositivo mobile |
| `use-toast` | Sistema de toast notifications |

---

## 13. Enums do Banco de Dados

| Enum | Valores |
|------|---------|
| `app_role` | owner, admin, manager, member, viewer |
| `ticket_priority` | critical, high, medium, low |
| `ticket_status` | open, in_progress, waiting, resolved, closed |
| `asset_category` | hardware, mobile, peripheral, network, software, other |
| `asset_status` | active, inactive, maintenance, retired, disposed |
| `maintenance_type` | preventive, corrective, upgrade |
| `maintenance_status` | scheduled, in_progress, completed, cancelled |
| `license_type` | subscription, perpetual, oem, freeware, trial |
| `notification_type` | ticket_created, ticket_assigned, ticket_updated, ticket_resolved, ticket_closed, sla_warning, sla_breached, mention, system, task_created |
| `social_platform` | instagram, facebook, tiktok, linkedin, youtube, twitter |
| `social_post_type` | feed, stories, reels, shorts, carousel, live, article, tweet |
| `social_post_status` | draft, scheduled, published, failed |
| `influencer_category` | nano, micro, mid, macro, mega |
| `influencer_status` | prospect, active, inactive, blocked |
| `mkt_event_type` | feira, conferencia, workshop, lancamento, webinar, meetup, outro |
| `mkt_event_status` | planning, confirmed, in_progress, completed, cancelled |
| `event_participant_role` | palestrante, patrocinador, expositor, convidado |
| `event_participant_status` | invited, confirmed, declined, attended |
| `mkt_supplier_category` | grafica, audiovisual, digital, brindes, cenografia, buffet, logistica, outro |
| `mkt_supplier_status` | active, inactive, blocked |
| `mkt_ugc_status` | pending, approved, rejected, archived |
| `mkt_ugc_media_type` | image, video, text, story |
| `mkt_quotation_status` | pending, approved, rejected, cancelled |
| `mkt_ai_generation_type` | caption, hashtag, image_prompt, event_description, post_content |

---

## 14. Fluxos Principais

### 14.1 Fluxo de Abertura de Chamado

1. Usuario acessa `/nova-solicitacao`
2. Seleciona o departamento
3. Preenche formulario com campos dinamicos (configurados em `ticket_form_fields`)
4. Chamado e criado na tabela `tickets` com status `open`
5. SLA e calculado automaticamente baseado na prioridade (`sla_policies`)
6. Notificacao enviada para tecnicos do departamento
7. IA analisa e sugere POPs relevantes (`ai-match-pop`)

### 14.2 Fluxo de Resolucao de Chamado

1. Tecnico visualiza chamado em `/ti/chamados`
2. Assume o chamado (assigned_to)
3. Primeiro response registrado (first_response_at)
4. Conversacao via comentarios (internos e publicos)
5. Vincula POP relevante se disponivel
6. Resolve com notas de resolucao
7. Solicitante avalia satisfacao (1-5 estrelas)
8. Chamado fechado

### 14.3 Fluxo de Convite de Usuario

1. Admin acessa `/configuracoes/sistema`
2. Clica em "Convidar Usuario"
3. Informa email e role
4. Convite criado em `tenant_invites` (valido por 7 dias)
5. Edge Function `invite-signup` processa o cadastro
6. Novo usuario criado com profile vinculado ao tenant
7. Modulos atribuidos via `user_module_access`

---

*Documento gerado automaticamente baseado no estado atual do codigo-fonte e banco de dados do HELPOINT v2.0.*
