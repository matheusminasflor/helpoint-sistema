#!/usr/bin/env bash
# Instala, no Postgres local, três "extensões de mentira" que as migrations
# pedem por `create extension`: pg_net, supabase_vault e pgmq. São stubs —
# só existem para a migration não falhar e para o SQL que as chama compilar.
# Nenhuma delas faz o trabalho real (HTTP, cofre, fila). Ver README.md.
set -euo pipefail

PGVER="${PGVER:-16}"
EXTDIR="$(pg_config --sharedir)/extension"

as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@"; fi; }

write() { # nome, conteúdo → arquivo em EXTDIR
  as_root tee "$EXTDIR/$1" >/dev/null
}

# ── pg_net: só net.http_post / net.http_get, que devolvem um id e não fazem nada
write pg_net.control <<'EOF'
comment = 'stub local de pg_net (scripts/pgtap-local)'
default_version = '0.0'
relocatable = true
EOF
write pg_net--0.0.sql <<'EOF'
create schema if not exists net;
create sequence if not exists net.request_id_seq;
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select nextval('net.request_id_seq') $$;
create or replace function net.http_get(
  url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select nextval('net.request_id_seq') $$;
EOF

# ── supabase_vault: tabela em claro. NUNCA use isto fora do harness local.
write supabase_vault.control <<'EOF'
comment = 'stub local de supabase_vault (scripts/pgtap-local)'
default_version = '0.0'
relocatable = true
EOF
write supabase_vault--0.0.sql <<'EOF'
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at
    from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description, key_id) values (new_secret, new_name, new_description, new_key_id) returning id
$$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets
     set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
         description = coalesce(new_description, description), key_id = coalesce(new_key_id, key_id), updated_at = now()
   where id = secret_id
$$;
EOF

# ── pgmq: fila em tabela simples, o bastante para send/read/delete/drop/list
write pgmq.control <<'EOF'
comment = 'stub local de pgmq (scripts/pgtap-local)'
default_version = '0.0'
relocatable = true
EOF
write pgmq--0.0.sql <<'EOF'
create schema if not exists pgmq;
create table if not exists pgmq.meta (queue_name text primary key, created_at timestamptz default now());
create table if not exists pgmq.messages (
  msg_id bigserial primary key, queue_name text not null, read_ct int not null default 0,
  enqueued_at timestamptz not null default now(), vt timestamptz not null default now(), message jsonb
);
create or replace function pgmq.create(queue_name text) returns void language sql as $$
  insert into pgmq.meta (queue_name) values (queue_name) on conflict do nothing $$;
create or replace function pgmq.send(queue_name text, msg jsonb, delay integer default 0) returns bigint language sql as $$
  insert into pgmq.messages (queue_name, message, vt) values (queue_name, msg, now() + make_interval(secs => delay)) returning msg_id $$;
create or replace function pgmq.read(queue_name text, vt integer, qty integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb) language sql as $$
  update pgmq.messages m set read_ct = m.read_ct + 1, vt = now() + make_interval(secs => read.vt)
   where m.msg_id in (select msg_id from pgmq.messages where queue_name = read.queue_name and vt <= now() order by msg_id limit qty)
  returning m.msg_id, m.read_ct, m.enqueued_at, m.vt, m.message $$;
create or replace function pgmq.delete(queue_name text, msg_id bigint) returns boolean language sql as $$
  with d as (delete from pgmq.messages m where m.queue_name = delete.queue_name and m.msg_id = delete.msg_id returning 1) select exists (select 1 from d) $$;
create or replace function pgmq.drop_queue(queue_name text) returns boolean language sql as $$
  with d as (delete from pgmq.meta m where m.queue_name = drop_queue.queue_name returning 1),
       e as (delete from pgmq.messages m where m.queue_name = drop_queue.queue_name returning 1)
  select exists (select 1 from d) $$;
create or replace function pgmq.list_queues() returns table (queue_name text, created_at timestamptz) language sql as $$
  select queue_name, created_at from pgmq.meta $$;
EOF

echo "stubs instalados em $EXTDIR: pg_net, supabase_vault, pgmq"
