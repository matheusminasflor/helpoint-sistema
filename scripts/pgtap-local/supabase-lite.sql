-- O mínimo do Supabase que as migrations deste repositório tocam, para um
-- Postgres 16 comum: papéis, `auth.uid()`/`auth.role()`/`auth.users`,
-- `storage`, a publicação de realtime e as permissões padrão do schema
-- `public`. Roda uma vez, num banco recém-criado, antes das migrations.
--
-- Não é o Supabase: não há GoTrue, PostgREST nem Storage de verdade. É o
-- bastante para as migrations aplicarem e para o pgTAP provar RLS, triggers
-- e funções — que é o que a suíte cobre.

-- ── Papéis (os que o RLS e os grants citam) ───────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;

-- ── extensions: pgcrypto e uuid-ossp onde o Supabase os põe ──────────────
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant execute on all functions in schema extensions to anon, authenticated, service_role;

-- ── auth ──────────────────────────────────────────────────────────────────
create schema if not exists auth;
create table if not exists auth.users (
  id                     uuid primary key,
  instance_id            uuid,
  aud                    varchar(255),
  role                   varchar(255),
  email                  varchar(255),
  encrypted_password     varchar(255),
  email_confirmed_at     timestamptz,
  invited_at             timestamptz,
  confirmation_token     varchar(255),
  confirmation_sent_at   timestamptz,
  recovery_token         varchar(255),
  recovery_sent_at       timestamptz,
  email_change_token_new varchar(255),
  email_change           varchar(255),
  email_change_sent_at   timestamptz,
  last_sign_in_at        timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  is_super_admin         boolean,
  created_at             timestamptz,
  updated_at             timestamptz,
  phone                  text unique,
  banned_until           timestamptz,
  deleted_at             timestamptz,
  is_sso_user            boolean not null default false,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0,
  phone_change           text default '',
  phone_change_token     varchar(255) default '',
  phone_change_sent_at   timestamptz,
  phone_confirmed_at     timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_anonymous           boolean not null default false
);
create unique index if not exists users_email_idx on auth.users (email);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ── storage ───────────────────────────────────────────────────────────────
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
create or replace function storage.filename(name text) returns text language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;
create or replace function storage.extension(name text) returns text language plpgsql immutable as $$
declare _parts text[]; _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end $$;
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

-- ── realtime ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── public: as permissões padrão que o Supabase dá aos três papéis ────────
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ── pg_cron: precisa de shared_preload_libraries (run.sh cuida) ───────────
create extension if not exists pg_cron;
grant usage on schema cron to authenticated, service_role;

-- ── Registro das migrations, como o CLI faz ───────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
