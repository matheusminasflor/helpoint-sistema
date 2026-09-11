-- Leva CRM-1b: segmentos por empresa, assistente de configuração, tabelas de
-- preço e portões por etapa. 2026-09-10. Base: docs/proposta-fluxo-comercial.md
-- (decisões 3 e 4 do dono; perguntas 1–3 do assistente).
--
-- Princípio: nada é semeado como se fosse regra. A empresa monta segmentos,
-- funis e tabelas no assistente; o funil de exemplo só nasce se ela pular.
--
-- O que este arquivo cria, em uma frase cada:
--   crm_price_tables           tabela de preço: nome, % sobre o preço base, uma padrão por empresa
--   crm_price_table_items      exceção: o preço de UM produto naquela tabela
--   crm_product_price(p, t)    o preço do produto na tabela (exceção, senão base × (1 + %))
--   crm_products_with_price(t) o catálogo já com o preço da tabela — uma consulta para a tela do pedido
--   crm_segments               segmento de cliente: nome, funil padrão, tabela padrão
--   crm_contacts.segment_id    o segmento do contato; price_table_id = exceção do contato
--   crm_orders.price_table_id  a tabela com que o pedido foi montado (trigger resolve se vier vazia)
--   crm_resolve_price_table(c) contato → segmento → padrão da empresa
--   crm_pipeline_stages.required_fields  o portão: o que precisa estar preenchido para entrar na etapa
--   crm_deals_check_stage_gate trigger que recusa a entrada com a lista do que falta, em português
--   crm_setup(...)             o assistente: tabelas → segmentos → um funil por segmento
--   (sai) trg_seed_crm_stages  tenant novo não ganha mais "Funil de vendas" sozinho
--
-- Quem escreve: gerente para cima (é configuração, como campos e automações);
-- quem tem o módulo lê. Guards de empresa em todo apontamento entre tabelas,
-- no molde do que já existe entre etapa e funil.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tabelas de preço
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_price_tables (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  -- Porcentagem sobre o preço base do produto: 0 = o próprio preço base; 20 = +20 %; -10 = −10 %.
  percent    numeric(8,3) not null default 0 check (percent > -100 and percent <= 1000),
  is_default boolean not null default false,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_price_tables_tenant_idx on public.crm_price_tables (tenant_id, position);
create unique index crm_price_tables_one_default_idx on public.crm_price_tables (tenant_id) where is_default;
create unique index crm_price_tables_name_idx on public.crm_price_tables (tenant_id, lower(name));

create table public.crm_price_table_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  price_table_id uuid not null references public.crm_price_tables(id) on delete cascade,
  product_id     uuid not null references public.crm_products(id) on delete cascade,
  price          numeric(14,2) not null check (price >= 0),
  unique (price_table_id, product_id)
);
create index crm_price_table_items_table_idx on public.crm_price_table_items (price_table_id);

create trigger inject_tenant_id_crm_price_tables      before insert on public.crm_price_tables      for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_crm_price_table_items before insert on public.crm_price_table_items for each row execute function public.inject_tenant_id();
create trigger handle_crm_price_tables_updated_at     before update on public.crm_price_tables      for each row execute function public.handle_updated_at();
create trigger audit_crm_price_tables_trigger after insert or update or delete on public.crm_price_tables for each row execute function public.audit_trigger_fn();

-- Exceção aponta para tabela e produto da mesma empresa.
create or replace function public.crm_price_table_item_check_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.crm_price_tables where id = new.price_table_id and tenant_id = new.tenant_id)
     or not exists (select 1 from public.crm_products where id = new.product_id and tenant_id = new.tenant_id) then
    raise exception 'tabela de preço e produto de empresas diferentes';
  end if;
  return new;
end;
$$;
create trigger trg_crm_price_table_item_check_tenant
  before insert or update of price_table_id, product_id, tenant_id on public.crm_price_table_items
  for each row execute function public.crm_price_table_item_check_tenant();

-- O preço de um produto numa tabela: exceção, senão base × (1 + %). Tabela nula = preço base.
create or replace function public.crm_product_price(p_product uuid, p_table uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select i.price from public.crm_price_table_items i where i.price_table_id = p_table and i.product_id = p_product),
    (select round(p.price * (1 + coalesce(t.percent, 0) / 100), 2)
       from public.crm_products p
       left join public.crm_price_tables t on t.id = p_table
      where p.id = p_product)
  );
$$;

-- O catálogo com o preço da tabela — para a tela do pedido, numa consulta só.
create or replace function public.crm_products_with_price(p_table uuid default null)
returns table (id uuid, name text, sku text, unit text, base_price numeric, price numeric, is_exception boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.name, p.sku, p.unit, p.price as base_price,
         public.crm_product_price(p.id, p_table) as price,
         exists (select 1 from public.crm_price_table_items i where i.price_table_id = p_table and i.product_id = p.id) as is_exception
    from public.crm_products p
   where p.tenant_id = public.get_user_tenant_id() and p.is_active
   order by p.name;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Segmentos
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_segments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  pipeline_id    uuid references public.crm_pipelines(id) on delete set null,     -- o negócio deste segmento nasce aqui
  price_table_id uuid references public.crm_price_tables(id) on delete set null,  -- o pedido deste segmento usa esta tabela
  position       integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index crm_segments_tenant_idx on public.crm_segments (tenant_id, position);
create unique index crm_segments_name_idx on public.crm_segments (tenant_id, lower(name));

create trigger inject_tenant_id_crm_segments  before insert on public.crm_segments for each row execute function public.inject_tenant_id();
create trigger handle_crm_segments_updated_at before update on public.crm_segments for each row execute function public.handle_updated_at();
create trigger audit_crm_segments_trigger after insert or update or delete on public.crm_segments for each row execute function public.audit_trigger_fn();

create or replace function public.crm_segment_check_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pipeline_id is not null
     and not exists (select 1 from public.crm_pipelines where id = new.pipeline_id and tenant_id = new.tenant_id) then
    raise exception 'segmento e funil de empresas diferentes';
  end if;
  if new.price_table_id is not null
     and not exists (select 1 from public.crm_price_tables where id = new.price_table_id and tenant_id = new.tenant_id) then
    raise exception 'segmento e tabela de preço de empresas diferentes';
  end if;
  return new;
end;
$$;
create trigger trg_crm_segment_check_tenant
  before insert or update of pipeline_id, price_table_id, tenant_id on public.crm_segments
  for each row execute function public.crm_segment_check_tenant();

-- O contato ganha segmento e, se precisar, uma tabela só dele (o distribuidor com tabela especial).
alter table public.crm_contacts
  add column segment_id     uuid references public.crm_segments(id) on delete set null,
  add column price_table_id uuid references public.crm_price_tables(id) on delete set null;
create index crm_contacts_segment_idx on public.crm_contacts (tenant_id, segment_id);

create or replace function public.crm_contact_check_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.segment_id is not null
     and not exists (select 1 from public.crm_segments where id = new.segment_id and tenant_id = new.tenant_id) then
    raise exception 'contato e segmento de empresas diferentes';
  end if;
  if new.price_table_id is not null
     and not exists (select 1 from public.crm_price_tables where id = new.price_table_id and tenant_id = new.tenant_id) then
    raise exception 'contato e tabela de preço de empresas diferentes';
  end if;
  return new;
end;
$$;
create trigger trg_crm_contact_check_tenant_refs
  before insert or update of segment_id, price_table_id, tenant_id on public.crm_contacts
  for each row execute function public.crm_contact_check_tenant_refs();

-- O pedido registra com que tabela foi montado.
alter table public.crm_orders add column price_table_id uuid references public.crm_price_tables(id) on delete set null;

-- Que tabela vale para um contato: a dele → a do segmento → a padrão da empresa → nenhuma (preço base).
create or replace function public.crm_resolve_price_table(p_contact uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    c.price_table_id,
    (select s.price_table_id from public.crm_segments s where s.id = c.segment_id),
    (select t.id from public.crm_price_tables t where t.tenant_id = c.tenant_id and t.is_default and t.is_active)
  )
  from public.crm_contacts c where c.id = p_contact;
$$;

create or replace function public.crm_orders_default_price_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_table_id is null then
    new.price_table_id := public.crm_resolve_price_table(new.contact_id);
  elsif not exists (select 1 from public.crm_price_tables where id = new.price_table_id and tenant_id = new.tenant_id) then
    raise exception 'pedido e tabela de preço de empresas diferentes';
  end if;
  return new;
end;
$$;
create trigger trg_crm_orders_default_price_table
  before insert on public.crm_orders
  for each row execute function public.crm_orders_default_price_table();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Portões por etapa
-- ───────────────────────────────────────────────────────────────────────────
-- Cada chave nomeia um campo: `contact.document`, `deal.value`,
-- `custom.contact.<chave>`, `custom.deal.<chave>`. A lista fixa é o que a
-- tela oferece; campo personalizado entra pela chave do catálogo (E2).
create or replace function public.crm_gate_keys_valid(p_keys text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(
    k ~ '^(contact\.(document|email|phone|whatsapp|company|city|state)|deal\.(value|expected_close_date)|custom\.(contact|deal)\.[a-z][a-z0-9_]{0,39})$'
  ), true) from unnest(p_keys) k;
$$;

alter table public.crm_pipeline_stages
  add column required_fields text[] not null default '{}'
    check (public.crm_gate_keys_valid(required_fields));

-- Nome do campo para a mensagem: fixo para os nativos, rótulo do catálogo para os personalizados.
create or replace function public.crm_gate_label(p_key text, p_tenant uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v text;
begin
  case p_key
    when 'contact.document' then return 'CPF/CNPJ';
    when 'contact.email'    then return 'e-mail';
    when 'contact.phone'    then return 'telefone';
    when 'contact.whatsapp' then return 'WhatsApp';
    when 'contact.company'  then return 'empresa';
    when 'contact.city'     then return 'cidade';
    when 'contact.state'    then return 'estado';
    when 'deal.value'       then return 'valor do negócio';
    when 'deal.expected_close_date' then return 'previsão de fechamento';
    else
      select label into v from public.crm_custom_fields
       where tenant_id = p_tenant and entity = split_part(p_key, '.', 2) and key = split_part(p_key, '.', 3);
      return coalesce(v, p_key);
  end case;
end;
$$;

-- Entrar numa etapa com portão: o que falta vira uma mensagem só. Escrita do
-- sistema (outro trigger ou um fluxo de automação) passa — regra 8 do
-- CLAUDE.md: o pedido pago leva ao "ganho" mesmo com portão lá, e o fluxo que
-- move etapa responde pelo que configurou.
create or replace function public.crm_deals_check_stage_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage   public.crm_pipeline_stages;
  v_contact public.crm_contacts;
  v_missing text[] := '{}';
  k         text;
  v_ok      boolean;
begin
  if pg_trigger_depth() > 1 or coalesce(current_setting('helpoint.automation', true), '0') = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.stage_id = old.stage_id then
    return new;
  end if;

  select * into v_stage from public.crm_pipeline_stages where id = new.stage_id;
  if v_stage.id is null or cardinality(v_stage.required_fields) = 0 then
    return new;
  end if;
  select * into v_contact from public.crm_contacts where id = new.contact_id;

  foreach k in array v_stage.required_fields loop
    v_ok := case k
      when 'contact.document' then nullif(v_contact.document, '') is not null
      when 'contact.email'    then nullif(v_contact.email, '') is not null
      when 'contact.phone'    then nullif(v_contact.phone, '') is not null
      when 'contact.whatsapp' then nullif(v_contact.whatsapp, '') is not null
      when 'contact.company'  then nullif(v_contact.company, '') is not null
      when 'contact.city'     then nullif(v_contact.city, '') is not null
      when 'contact.state'    then nullif(v_contact.state, '') is not null
      when 'deal.value'       then coalesce(new.value, 0) > 0
      when 'deal.expected_close_date' then new.expected_close_date is not null
      else case split_part(k, '.', 2)
        when 'contact' then nullif(v_contact.custom ->> split_part(k, '.', 3), '') is not null
        else nullif(new.custom ->> split_part(k, '.', 3), '') is not null
      end
    end;
    if not coalesce(v_ok, false) then
      v_missing := v_missing || public.crm_gate_label(k, new.tenant_id);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'para entrar em "%" falta preencher: %', v_stage.name, array_to_string(v_missing, ', ');
  end if;
  return new;
end;
$$;
create trigger trg_crm_deals_check_stage_gate
  before insert or update of stage_id on public.crm_deals
  for each row execute function public.crm_deals_check_stage_gate();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Semente e assistente
-- ───────────────────────────────────────────────────────────────────────────
-- Tenant novo não ganha mais um funil pronto: quem monta é o assistente.
-- Os que já existem ficam como estão.
drop trigger if exists trg_seed_crm_stages on public.tenants;
drop function if exists public.seed_crm_stages_on_tenant();

-- As seis etapas do modelo, em qualquer funil (o assistente e a semente usam a mesma).
create or replace function public.crm_seed_pipeline_stages(p_tenant_id uuid, p_pipeline uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, position, kind, color) values
    (p_tenant_id, p_pipeline, 'Novo',               1, 'open', 'blue'),
    (p_tenant_id, p_pipeline, 'Em contato',         2, 'open', 'teal'),
    (p_tenant_id, p_pipeline, 'Orçamento enviado',  3, 'open', 'violet'),
    (p_tenant_id, p_pipeline, 'Negociação',         4, 'open', 'amber'),
    (p_tenant_id, p_pipeline, 'Ganho',              5, 'won',  'green'),
    (p_tenant_id, p_pipeline, 'Perdido',            6, 'lost', 'red');
$$;
revoke all on function public.crm_seed_pipeline_stages(uuid, uuid) from public, anon, authenticated;

create or replace function public.seed_crm_stages(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_pipeline uuid;
begin
  if exists (select 1 from public.crm_pipelines where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.crm_pipelines (tenant_id, name, position, is_default)
  values (p_tenant_id, 'Funil de vendas', 1, true)
  returning id into v_pipeline;
  perform public.crm_seed_pipeline_stages(p_tenant_id, v_pipeline);
end;
$$;

-- O assistente. Entrada:
--   p_price_tables: [{"name": "Salão", "percent": 15, "is_default": false}, ...]
--   p_segments:     [{"name": "Salão", "price_table": "Salão", "requires_document": true}, ...]
-- Sem segmento = a empresa pulou: nasce o funil de exemplo. `requires_document`
-- vira portão de CPF/CNPJ em toda etapa do funil do segmento menos a primeira
-- (o lead entra sem documento; para avançar, precisa dele).
create or replace function public.crm_setup(p_segments jsonb default '[]'::jsonb, p_price_tables jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid := public.get_user_tenant_id();
  v_i        integer := 0;
  v_table    jsonb;
  v_seg      jsonb;
  v_table_id uuid;
  v_pipeline uuid;
  v_has_default boolean := false;
  v_n_tables integer := 0;
  v_n_segments integer := 0;
begin
  if v_tenant is null or not public.is_manager_or_higher(auth.uid()) then
    raise exception 'só gerente, admin ou dono configura o Comercial';
  end if;
  if exists (select 1 from public.crm_pipelines where tenant_id = v_tenant) then
    raise exception 'o Comercial desta empresa já está configurado — use as Configurações';
  end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_typeof(p_price_tables) <> 'array' then
    raise exception 'entrada inválida';
  end if;

  for v_table in select * from jsonb_array_elements(p_price_tables) loop
    v_i := v_i + 1;
    if nullif(trim(coalesce(v_table->>'name', '')), '') is null then
      raise exception 'toda tabela de preço precisa de nome';
    end if;
    if exists (select 1 from public.crm_price_tables where tenant_id = v_tenant and lower(name) = lower(trim(v_table->>'name'))) then
      raise exception 'já existe uma tabela de preço chamada "%"', trim(v_table->>'name');
    end if;
    insert into public.crm_price_tables (tenant_id, name, percent, is_default, position)
    values (v_tenant, trim(v_table->>'name'), coalesce((v_table->>'percent')::numeric, 0),
            coalesce((v_table->>'is_default')::boolean, false) and not v_has_default, v_i);
    v_has_default := v_has_default or coalesce((v_table->>'is_default')::boolean, false);
    v_n_tables := v_n_tables + 1;
  end loop;
  -- Sem "padrão" marcada: a primeira é a padrão.
  if v_n_tables > 0 and not v_has_default then
    update public.crm_price_tables set is_default = true
     where tenant_id = v_tenant and position = 1;
  end if;

  if jsonb_array_length(p_segments) = 0 then
    perform public.seed_crm_stages(v_tenant);
    return jsonb_build_object('pipelines', 1, 'segments', 0, 'price_tables', v_n_tables);
  end if;

  v_i := 0;
  for v_seg in select * from jsonb_array_elements(p_segments) loop
    v_i := v_i + 1;
    if nullif(trim(coalesce(v_seg->>'name', '')), '') is null then
      raise exception 'todo segmento precisa de nome';
    end if;
    select id into v_table_id from public.crm_price_tables
     where tenant_id = v_tenant and lower(name) = lower(trim(coalesce(v_seg->>'price_table', '')));

    insert into public.crm_pipelines (tenant_id, name, position, is_default)
    values (v_tenant, trim(v_seg->>'name'), v_i, v_i = 1)
    returning id into v_pipeline;
    perform public.crm_seed_pipeline_stages(v_tenant, v_pipeline);

    if coalesce((v_seg->>'requires_document')::boolean, false) then
      update public.crm_pipeline_stages
         set required_fields = array['contact.document']
       where pipeline_id = v_pipeline and position > 1;
    end if;

    insert into public.crm_segments (tenant_id, name, pipeline_id, price_table_id, position)
    values (v_tenant, trim(v_seg->>'name'), v_pipeline, v_table_id, v_i);
    v_n_segments := v_n_segments + 1;
  end loop;

  return jsonb_build_object('pipelines', v_n_segments, 'segments', v_n_segments, 'price_tables', v_n_tables);
end;
$$;
grant execute on function public.crm_setup(jsonb, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Origens que faltavam (redes sociais)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.crm_contacts drop constraint crm_contacts_source_check;
alter table public.crm_contacts add constraint crm_contacts_source_check
  check (source in ('manual', 'site', 'whatsapp', 'instagram', 'facebook', 'indicacao', 'importacao', 'outro'));
alter table public.crm_deals drop constraint crm_deals_source_check;
alter table public.crm_deals add constraint crm_deals_source_check
  check (source in ('manual', 'site', 'whatsapp', 'instagram', 'facebook', 'indicacao', 'importacao', 'outro'));

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Achados da auditoria (2026-09-10)
-- ───────────────────────────────────────────────────────────────────────────
-- Funil e etapa são configuração: escreve gerente para cima (as policies da E1
-- deixavam qualquer um do Comercial — e o vendedor apagava o próprio portão).
drop policy if exists "Comercial inserts crm_pipelines" on public.crm_pipelines;
drop policy if exists "Comercial updates crm_pipelines" on public.crm_pipelines;
create policy "Managers insert crm_pipelines" on public.crm_pipelines for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers update crm_pipelines" on public.crm_pipelines for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
drop policy if exists "Comercial inserts crm_pipeline_stages" on public.crm_pipeline_stages;
drop policy if exists "Comercial updates crm_pipeline_stages" on public.crm_pipeline_stages;
create policy "Managers insert crm_pipeline_stages" on public.crm_pipeline_stages for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers update crm_pipeline_stages" on public.crm_pipeline_stages for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

-- O rótulo é do trigger; chamada direta lia rótulo de campo de outra empresa.
revoke all on function public.crm_gate_label(text, uuid) from public, anon, authenticated;

-- Uma tabela padrão por empresa, numa escrita só: marcar a nova desmarca a anterior.
create or replace function public.crm_price_tables_single_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.crm_price_tables set is_default = false
     where tenant_id = new.tenant_id and is_default and id <> new.id;
  end if;
  return new;
end;
$$;
create trigger trg_crm_price_tables_single_default
  before insert or update of is_default on public.crm_price_tables
  for each row execute function public.crm_price_tables_single_default();

-- O pedido não muda para tabela de outra empresa nem por UPDATE.
drop trigger if exists trg_crm_orders_default_price_table on public.crm_orders;
create trigger trg_crm_orders_default_price_table
  before insert or update of price_table_id on public.crm_orders
  for each row execute function public.crm_orders_default_price_table();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: lê quem tem o módulo; escreve gerente para cima
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_price_tables', 'crm_price_table_items', 'crm_segments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "Comercial reads %1$s" on public.%1$I for select to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()))$p$, t);
    execute format($p$create policy "Managers insert %1$s" on public.%1$I for insert to authenticated
      with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))$p$, t);
    execute format($p$create policy "Managers update %1$s" on public.%1$I for update to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
      with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))$p$, t);
    execute format($p$create policy "Managers delete %1$s" on public.%1$I for delete to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))$p$, t);
  end loop;
end $$;
