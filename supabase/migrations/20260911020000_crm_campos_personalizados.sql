-- Leva E2 (ADR-007): campos personalizados em contato e negócio. 2026-09-11.
--
-- Referência de produto: o Twenty guarda a definição do campo como dado
-- (`fieldMetadata`: tipo, rótulo, opções com cor e posição) — mas materializa
-- cada campo com ALTER TABLE por empresa, o que aqui quebraria RLS, PostgREST
-- e tipos gerados (docs/pesquisa-twenty-crm.md, seção 3). Então: o catálogo
-- de definições é tabela; o valor vive numa coluna `custom jsonb` do contato
-- e do negócio, validada por trigger contra o catálogo.
--
-- O que este arquivo cria, em uma frase cada:
--   crm_custom_fields         a definição: empresa, entidade, chave, rótulo, tipo, opções, ordem
--   crm_contacts.custom       {chave: valor} do contato
--   crm_deals.custom          {chave: valor} do negócio
--   crm_validate_custom()     trigger: chave existe no catálogo e o valor bate com o tipo
--
-- Regras:
--   - A chave é imutável (é o nome pelo qual importação, automação e filtro
--     a citam); o rótulo muda à vontade.
--   - Desativar um campo o esconde dos formulários e não apaga valor
--     gravado; chave desconhecida é erro.
--   - `required` vale só no formulário. ponytail: importação e automação
--     gravam parcial; o teto é "obrigatório não vale para escrita do sistema".
--   - Quem define campos é gerente para cima (é configuração, como as
--     automações); quem tem o módulo lê.

create table public.crm_custom_fields (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  entity     text not null check (entity in ('contact', 'deal')),
  key        text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label      text not null check (length(trim(label)) between 1 and 60),
  type       text not null check (type in ('text', 'number', 'date', 'select', 'boolean')),
  -- select: [{value, label, color?}] ; os outros tipos: []
  options    jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  required   boolean not null default false,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity, key)
);
create index crm_custom_fields_lookup_idx on public.crm_custom_fields (tenant_id, entity, position);

create trigger inject_tenant_id_crm_custom_fields before insert on public.crm_custom_fields for each row execute function public.inject_tenant_id();
create trigger handle_crm_custom_fields_updated_at before update on public.crm_custom_fields for each row execute function public.handle_updated_at();
create trigger audit_crm_custom_fields_trigger after insert or update or delete on public.crm_custom_fields for each row execute function public.audit_trigger_fn();

-- A chave não muda: valores gravados e automações a citam pelo nome.
create or replace function public.crm_custom_fields_key_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.key <> old.key then
    raise exception 'a chave do campo personalizado não muda (crie outro campo)';
  end if;
  if new.entity <> old.entity then
    raise exception 'o campo personalizado não muda de cadastro';
  end if;
  return new;
end;
$$;
create trigger trg_crm_custom_fields_key_immutable
  before update of key, entity on public.crm_custom_fields
  for each row execute function public.crm_custom_fields_key_immutable();

alter table public.crm_custom_fields enable row level security;
create policy "Comercial reads crm_custom_fields" on public.crm_custom_fields for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Managers insert crm_custom_fields" on public.crm_custom_fields for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers update crm_custom_fields" on public.crm_custom_fields for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers delete crm_custom_fields" on public.crm_custom_fields for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- O valor
-- ───────────────────────────────────────────────────────────────────────────
alter table public.crm_contacts add column custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object');
alter table public.crm_deals    add column custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object');
create index crm_contacts_custom_idx on public.crm_contacts using gin (custom);
create index crm_deals_custom_idx    on public.crm_deals    using gin (custom);

-- Valida {chave: valor} contra o catálogo da empresa. `null` limpa o campo.
create or replace function public.crm_validate_custom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text := tg_argv[0];
  k        text;
  v        jsonb;
  f        record;
  v_date   date;
begin
  for k, v in select * from jsonb_each(new.custom) loop
    select type, options into f
      from public.crm_custom_fields
     where tenant_id = new.tenant_id and entity = v_entity and key = k;
    if f.type is null then
      raise exception 'campo personalizado desconhecido: %', k;
    end if;
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;

    case f.type
      when 'text' then
        if jsonb_typeof(v) <> 'string' then
          raise exception 'campo "%" espera texto', k;
        end if;
      when 'number' then
        if jsonb_typeof(v) <> 'number' then
          raise exception 'campo "%" espera número', k;
        end if;
      when 'boolean' then
        if jsonb_typeof(v) <> 'boolean' then
          raise exception 'campo "%" espera sim/não', k;
        end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'campo "%" espera data AAAA-MM-DD', k;
        end if;
        begin
          v_date := (v #>> '{}')::date;
        exception when others then
          raise exception 'campo "%" tem data inválida', k;
        end;
      when 'select' then
        if jsonb_typeof(v) <> 'string'
           or not exists (select 1 from jsonb_array_elements(f.options) o where o->>'value' = v #>> '{}') then
          raise exception 'campo "%" só aceita uma das opções', k;
        end if;
    end case;
  end loop;

  new.custom := jsonb_strip_nulls(new.custom);
  return new;
end;
$$;

create trigger trg_crm_validate_custom_contact
  before insert or update of custom on public.crm_contacts
  for each row execute function public.crm_validate_custom('contact');
create trigger trg_crm_validate_custom_deal
  before insert or update of custom on public.crm_deals
  for each row execute function public.crm_validate_custom('deal');
