-- Leva CRM-2a: pagamento por empresa. 2026-09-12.
-- Decisão do dono (ADR-008, complemento de 2026-09-12): cada empresa cola as
-- próprias chaves em Configurações do Comercial → "Pagamento"; Yampi e Stripe
-- podem estar ligados ao mesmo tempo, com um padrão; o pedido pode trocar. A
-- chave global STRIPE_SECRET_KEY nos segredos do servidor deixa de valer.
--
-- Molde: `tenant_ai_credentials` (migration 20260829014821) — tabela que só o
-- service_role lê, chave nunca volta para a tela, "Testar" antes de salvar.
--
-- O que este arquivo cria, em uma frase cada:
--   tenant_payment_credentials  as chaves de cada provedor, por empresa (só service_role)
--   crm_payment_providers()     o que a tela vê: provedor, padrão, alias, últimos 4 — nunca a chave
--   crm_orders.payment_provider + provider_link_id/order_id/coupon_id   com que provedor o link saiu
--   crm_products.yampi_sku_id   o SKU da Yampi que corresponde ao produto (aprendido no primeiro link)
--   crm_payment_events          avisos já processados, de qualquer provedor (substitui crm_stripe_events)

create table public.tenant_payment_credentials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  provider       text not null check (provider in ('stripe', 'yampi')),
  is_default     boolean not null default false,
  alias          text,                 -- yampi: alias da loja (vai na URL da API)
  key_last4      text,
  secret_key     text not null,        -- stripe: chave secreta; yampi: User-Secret-Key
  secret_key_2   text,                 -- yampi: User-Token
  webhook_secret text,                 -- stripe: segredo do endpoint; yampi: secret_key devolvido ao registrar o webhook
  webhook_id     text,                 -- yampi: id do webhook registrado por nós
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, provider)
);
create unique index tenant_payment_credentials_one_default_idx on public.tenant_payment_credentials (tenant_id) where is_default;
create trigger tenant_payment_credentials_updated_at before update on public.tenant_payment_credentials for each row execute function public.handle_updated_at();

-- ATENÇÃO: a chave só é lida pelas edge functions (service_role). Neste banco
-- toda tabela nova nasce com ALL para anon/authenticated (default privileges do
-- schema public) — "sem policy" segura a linha, mas o REVOKE abaixo é o que faz
-- o SELECT direto falhar com 42501 em vez de devolver vazio, e é o que protege
-- a chave se um dia alguém criar uma policy de SELECT aqui (auditoria de
-- 2026-09-12). O mesmo vale para `tenant_ai_credentials`, do mesmo molde.
grant all on public.tenant_payment_credentials to service_role;
revoke all on public.tenant_payment_credentials from public, anon, authenticated;
revoke all on public.tenant_ai_credentials from public, anon, authenticated;
alter table public.tenant_payment_credentials enable row level security;

-- Uma tabela padrão... uma credencial padrão por empresa, numa escrita só.
create or replace function public.tenant_payment_credentials_single_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.tenant_payment_credentials set is_default = false
     where tenant_id = new.tenant_id and is_default and id <> new.id;
  end if;
  return new;
end;
$$;
create trigger trg_tenant_payment_credentials_single_default
  before insert or update of is_default on public.tenant_payment_credentials
  for each row execute function public.tenant_payment_credentials_single_default();

-- O que a tela vê. Nunca a chave. Só quem está logado e tem o Comercial.
create or replace function public.crm_payment_providers()
returns table (provider text, is_default boolean, alias text, key_last4 text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.provider, c.is_default, c.alias, c.key_last4, c.updated_at
    from public.tenant_payment_credentials c
   where c.tenant_id = public.get_user_tenant_id()
     and public.has_comercial_access(auth.uid())
   order by c.is_default desc, c.provider;
$$;
revoke execute on function public.crm_payment_providers() from public, anon;
grant execute on function public.crm_payment_providers() to authenticated;

-- O pedido registra por onde o link saiu (e os ids do provedor, para o webhook achar o pedido).
alter table public.crm_orders
  add column payment_provider   text check (payment_provider in ('stripe', 'yampi', 'manual')),
  add column provider_link_id   text,
  add column provider_order_id  text,
  add column provider_coupon_id text;
create index crm_orders_provider_coupon_idx on public.crm_orders (tenant_id, provider_coupon_id) where provider_coupon_id is not null;

-- Produto ↔ SKU da Yampi: aprendido pelo código `sku` no primeiro link e guardado.
alter table public.crm_products add column yampi_sku_id text;

-- Avisos já processados, de qualquer provedor. Idempotência do webhook.
create table public.crm_payment_events (
  provider    text not null,
  event_id    text not null,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  order_id    uuid references public.crm_orders(id) on delete set null,
  type        text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
insert into public.crm_payment_events (provider, event_id, tenant_id, order_id, type, received_at)
select 'stripe', event_id, tenant_id, order_id, type, received_at from public.crm_stripe_events;
drop table public.crm_stripe_events;
grant all on public.crm_payment_events to service_role;
revoke all on public.crm_payment_events from public, anon, authenticated;
alter table public.crm_payment_events enable row level security;
