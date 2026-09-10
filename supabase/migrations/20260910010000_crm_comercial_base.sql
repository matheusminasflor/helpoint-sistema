-- Leva CRM-1 (Fase 3, ideia 11): base do CRM do módulo Comercial — 2026-09-10.
--
-- Decisões do dono (2026-09-09): primeira versão = funil + cartão do lead
-- (notas, tarefas, histórico) + catálogo + pedido interno com link de
-- pagamento; dinheiro pelo Stripe (Pix por convite); WhatsApp em leva própria;
-- cinco etapas padrão com nomes editáveis por empresa.
--
-- O que este arquivo cria, em uma frase cada:
--   crm_pipeline_stages   as etapas do funil (por empresa; 5 semeadas)
--   crm_contacts          quem compra (lead/cliente), com dono = vendedor
--   crm_deals             o negócio em andamento: um cartão numa etapa, com valor
--   crm_deal_activities   a linha do tempo do negócio (nota, mudança de etapa, pedido, pagamento)
--   crm_products          o catálogo do que se vende (bling_id reservado para a CRM-2)
--   crm_orders            o pedido: itens, totais, link de pagamento, status
--   crm_order_items       os itens do pedido; o total é calculado pelo banco
--   crm_stripe_events     memória de avisos do Stripe já processados (idempotência)
--
-- Tarefas do negócio usam a tabela `tasks` que já existe
-- (source_type = 'crm_deal', source_id = deal). Nada de tabela nova para isso.
--
-- Quem acessa: quem tem o módulo `comercial` concedido ou é supervisor
-- (`has_comercial_access`, cópia literal de `has_fin_access`). Apagar
-- contato/negócio/pedido é de gerente para cima.
--
-- Fora, de propósito (levas seguintes): Bling (CRM-2), lojinha pública
-- (CRM-3), WhatsApp (CRM-4), Stripe Connect por empresa (hoje uma conta só,
-- chave nos segredos das edge functions — ver ADR-006).

-- ───────────────────────────────────────────────────────────────────────────
-- Acesso
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.has_comercial_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'comercial'
  ) or public.is_supervisor_or_higher(_user_id);
$$;

-- Dinheiro em texto no padrão brasileiro: 4800 → '4.800,00'. O to_char do
-- banco segue o locale do servidor (inglês) e escreveria '4,800.00'.
create or replace function public.fmt_brl(p numeric)
returns text
language sql
immutable
as $$
  select translate(to_char(coalesce(p, 0), 'FM999G999G999G990D00'), ',.', '.,');
$$;

alter type public.notification_type add value if not exists 'crm_new_lead';
alter type public.notification_type add value if not exists 'order_paid';

-- ───────────────────────────────────────────────────────────────────────────
-- Etapas do funil
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  position   integer not null default 0,
  -- open = em andamento; won = fechado com venda; lost = perdido. Um de cada dos dois últimos por empresa.
  kind       text not null default 'open' check (kind in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_pipeline_stages_tenant_idx on public.crm_pipeline_stages (tenant_id, position);
create unique index crm_pipeline_stages_one_won_idx  on public.crm_pipeline_stages (tenant_id) where kind = 'won';
create unique index crm_pipeline_stages_one_lost_idx on public.crm_pipeline_stages (tenant_id) where kind = 'lost';

-- ───────────────────────────────────────────────────────────────────────────
-- Contatos e negócios
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_contacts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null check (length(trim(name)) between 1 and 160),
  email               text,
  phone               text,
  whatsapp            text,
  document            text,          -- CPF ou CNPJ, só dígitos
  company             text,
  city                text,
  state               text,
  notes               text,
  source              text not null default 'manual' check (source in ('manual', 'site', 'whatsapp', 'indicacao', 'outro')),
  owner_id            uuid references public.profiles(id) on delete set null,   -- vendedor responsável = carteira
  customer_profile_id uuid references public.customer_profiles(id) on delete set null, -- ponte com o cliente do SAC, quando for a mesma pessoa
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index crm_contacts_tenant_idx on public.crm_contacts (tenant_id, owner_id);
create index crm_contacts_email_idx  on public.crm_contacts (tenant_id, lower(email));

create table public.crm_deals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  contact_id          uuid not null references public.crm_contacts(id) on delete restrict,
  stage_id            uuid not null references public.crm_pipeline_stages(id) on delete restrict,
  title               text not null check (length(trim(title)) between 1 and 160),
  value               numeric(14,2) not null default 0 check (value >= 0),
  owner_id            uuid references public.profiles(id) on delete set null,
  source              text not null default 'manual' check (source in ('manual', 'site', 'whatsapp', 'indicacao', 'outro')),
  expected_close_date date,
  position            integer not null default 0,        -- ordem dentro da coluna do funil
  won_at              timestamptz,
  lost_at             timestamptz,
  lost_reason         text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index crm_deals_tenant_stage_idx on public.crm_deals (tenant_id, stage_id, position);
create index crm_deals_contact_idx      on public.crm_deals (contact_id);

create table public.crm_deal_activities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  deal_id    uuid not null references public.crm_deals(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,   -- nulo = o sistema
  kind       text not null check (kind in ('note', 'stage_change', 'task', 'order', 'payment', 'system')),
  content    text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index crm_deal_activities_deal_idx on public.crm_deal_activities (deal_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- Catálogo e pedidos
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 160),
  sku         text,
  description text,
  unit        text not null default 'un',
  price       numeric(14,2) not null default 0 check (price >= 0),
  is_active   boolean not null default true,
  bling_id    text,                                   -- CRM-2: id do produto no Bling
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index crm_products_tenant_idx on public.crm_products (tenant_id, is_active);

create table public.crm_orders (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  number                integer not null,                 -- sequencial por empresa (trigger)
  deal_id               uuid references public.crm_deals(id) on delete set null,
  contact_id            uuid not null references public.crm_contacts(id) on delete restrict,
  -- draft = montando; sent = link gerado/enviado; paid = pago; expired = link venceu; cancelled = cancelado
  status                text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'expired', 'cancelled')),
  subtotal              numeric(14,2) not null default 0,
  discount              numeric(14,2) not null default 0 check (discount >= 0),
  total                 numeric(14,2) not null default 0,
  link_kind             text check (link_kind in ('temporary', 'permanent')),
  link_url              text,
  link_expires_at       timestamptz,
  stripe_session_id     text,
  stripe_payment_intent text,
  paid_at               timestamptz,
  bling_order_id        text,                              -- CRM-2
  notes                 text,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, number)
);
create index crm_orders_tenant_status_idx on public.crm_orders (tenant_id, status, created_at desc);
create index crm_orders_deal_idx          on public.crm_orders (deal_id);

create table public.crm_order_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  order_id    uuid not null references public.crm_orders(id) on delete cascade,
  product_id  uuid references public.crm_products(id) on delete set null,
  description text not null,
  quantity    numeric(12,3) not null default 1 check (quantity > 0),
  unit_price  numeric(14,2) not null default 0 check (unit_price >= 0),
  total       numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  position    integer not null default 0
);
create index crm_order_items_order_idx on public.crm_order_items (order_id, position);

-- Aviso do Stripe já processado: o webhook pode chegar duas vezes ou fora de ordem.
create table public.crm_stripe_events (
  event_id    text primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  order_id    uuid references public.crm_orders(id) on delete set null,
  type        text not null,
  received_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- Triggers de casa: tenant_id, updated_at, auditoria
-- ───────────────────────────────────────────────────────────────────────────
create trigger inject_tenant_id_crm_pipeline_stages before insert on public.crm_pipeline_stages for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_contacts        before insert on public.crm_contacts        for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_deals           before insert on public.crm_deals           for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_deal_activities before insert on public.crm_deal_activities for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_products        before insert on public.crm_products        for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_orders          before insert on public.crm_orders          for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_order_items     before insert on public.crm_order_items     for each row execute function public.inject_tenant_id();

create trigger handle_crm_pipeline_stages_updated_at before update on public.crm_pipeline_stages for each row execute function public.handle_updated_at();
create trigger handle_crm_contacts_updated_at        before update on public.crm_contacts        for each row execute function public.handle_updated_at();
create trigger handle_crm_deals_updated_at           before update on public.crm_deals           for each row execute function public.handle_updated_at();
create trigger handle_crm_products_updated_at        before update on public.crm_products        for each row execute function public.handle_updated_at();
create trigger handle_crm_orders_updated_at          before update on public.crm_orders          for each row execute function public.handle_updated_at();

create trigger audit_crm_contacts_trigger after insert or update or delete on public.crm_contacts for each row execute function public.audit_trigger_fn();
create trigger audit_crm_deals_trigger    after insert or update or delete on public.crm_deals    for each row execute function public.audit_trigger_fn();
create trigger audit_crm_orders_trigger   after insert or update or delete on public.crm_orders   for each row execute function public.audit_trigger_fn();

-- ───────────────────────────────────────────────────────────────────────────
-- Regras que vivem no banco
-- ───────────────────────────────────────────────────────────────────────────

-- Número do pedido: sequencial por empresa.
-- ponytail: max()+1 pode colidir se dois vendedores fecharem no mesmo instante;
-- o UNIQUE (tenant_id, number) transforma a colisão em erro visível, não em
-- número repetido. Sequência por tenant entra quando isso acontecer de verdade.
create or replace function public.crm_orders_set_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
      from public.crm_orders where tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;
-- NOT NULL é conferido depois dos triggers BEFORE: o front não manda `number`.
create trigger trg_crm_orders_set_number
  before insert on public.crm_orders
  for each row execute function public.crm_orders_set_number();

-- Totais do pedido: somados pelo banco a cada item que entra, muda ou sai.
create or replace function public.crm_recompute_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.crm_orders o
     set subtotal = s.subtotal,
         total    = greatest(s.subtotal - o.discount, 0)
    from (select coalesce(sum(total), 0) as subtotal from public.crm_order_items where order_id = v_order) s
   where o.id = v_order;
  return coalesce(new, old);
end;
$$;
create trigger trg_crm_order_items_totals
  after insert or update or delete on public.crm_order_items
  for each row execute function public.crm_recompute_order_totals();

-- Desconto mudou → total acompanha.
create or replace function public.crm_orders_apply_discount()
returns trigger
language plpgsql
as $$
begin
  new.total := greatest(new.subtotal - new.discount, 0);
  return new;
end;
$$;
create trigger trg_crm_orders_apply_discount
  before update of discount, subtotal on public.crm_orders
  for each row execute function public.crm_orders_apply_discount();

-- Negócio mudou de etapa → linha do tempo, e won_at/lost_at conforme o tipo da etapa.
create or replace function public.crm_deals_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to   record;
begin
  select name into v_from from public.crm_pipeline_stages where id = old.stage_id;
  select name, kind into v_to from public.crm_pipeline_stages where id = new.stage_id;

  if v_to.kind = 'won' then
    new.won_at := coalesce(new.won_at, now());
    new.lost_at := null;
  elsif v_to.kind = 'lost' then
    new.lost_at := coalesce(new.lost_at, now());
    new.won_at := null;
  else
    new.won_at := null;
    new.lost_at := null;
  end if;

  insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
  values (new.tenant_id, new.id, auth.uid(), 'stage_change',
          'De "' || coalesce(v_from, '?') || '" para "' || v_to.name || '"',
          jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
  return new;
end;
$$;
create trigger trg_crm_deals_on_stage_change
  before update of stage_id on public.crm_deals
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function public.crm_deals_on_stage_change();

-- Pedido pago → negócio vai para a etapa "ganho", linha do tempo, e o vendedor é avisado.
create or replace function public.crm_orders_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_won   uuid;
  v_deal  public.crm_deals;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;
  new.paid_at := coalesce(new.paid_at, now());

  if new.deal_id is not null then
    select * into v_deal from public.crm_deals where id = new.deal_id;
    select id into v_won from public.crm_pipeline_stages where tenant_id = new.tenant_id and kind = 'won';

    insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
    values (new.tenant_id, new.deal_id, null, 'payment',
            'Pedido #' || new.number || ' pago — R$ ' || public.fmt_brl(new.total),
            jsonb_build_object('order_id', new.id));

    if v_won is not null and v_deal.stage_id is distinct from v_won then
      update public.crm_deals set stage_id = v_won where id = new.deal_id;
    end if;

    perform public.notify_users(
      new.tenant_id,
      array[coalesce(v_deal.owner_id, new.created_by)],
      'order_paid', 'crm_deal', new.deal_id,
      'Pedido #' || new.number || ' foi pago',
      coalesce(v_deal.title, 'Negócio') || ' — R$ ' || public.fmt_brl(new.total)
    );
  end if;
  return new;
end;
$$;
create trigger trg_crm_orders_on_paid
  before update of status on public.crm_orders
  for each row execute function public.crm_orders_on_paid();

-- ───────────────────────────────────────────────────────────────────────────
-- Etapas padrão: tenant novo (trigger) e os que já existem (backfill)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_crm_stages(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.crm_pipeline_stages where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.crm_pipeline_stages (tenant_id, name, position, kind) values
    (p_tenant_id, 'Novo',               1, 'open'),
    (p_tenant_id, 'Em contato',         2, 'open'),
    (p_tenant_id, 'Orçamento enviado',  3, 'open'),
    (p_tenant_id, 'Negociação',         4, 'open'),
    (p_tenant_id, 'Ganho',              5, 'won'),
    (p_tenant_id, 'Perdido',            6, 'lost');
end;
$$;
revoke all on function public.seed_crm_stages(uuid) from public, anon, authenticated;

create or replace function public.seed_crm_stages_on_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_crm_stages(new.id);
  return new;
end;
$$;
create trigger trg_seed_crm_stages
  after insert on public.tenants
  for each row execute function public.seed_crm_stages_on_tenant();

do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.seed_crm_stages(t.id);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: quem tem o módulo Comercial (ou é supervisor) lê e escreve na própria
-- empresa; apagar é de gerente para cima. crm_stripe_events é só do webhook.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['crm_pipeline_stages', 'crm_contacts', 'crm_deals', 'crm_deal_activities', 'crm_products', 'crm_orders', 'crm_order_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "Comercial reads %1$s" on public.%1$I for select to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()))$p$, t);
    execute format($p$create policy "Comercial inserts %1$s" on public.%1$I for insert to authenticated
      with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()))$p$, t);
    execute format($p$create policy "Comercial updates %1$s" on public.%1$I for update to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()))
      with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()))$p$, t);
    execute format($p$create policy "Managers delete %1$s" on public.%1$I for delete to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))$p$, t);
  end loop;
end $$;

-- Exceção: tirar um item de um pedido em montagem é trabalho do vendedor, não
-- de gerente (o CI pegou: o DELETE do vendedor afetava 0 linhas, em silêncio).
drop policy "Managers delete crm_order_items" on public.crm_order_items;
create policy "Comercial deletes crm_order_items" on public.crm_order_items for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));

alter table public.crm_stripe_events enable row level security;
