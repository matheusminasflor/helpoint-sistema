-- Leva CRM-2b: nota fiscal pelo Bling. 2026-09-12.
-- Decisão do dono (ADR-008): cobrar, emitir nota e entregar são três escolhas
-- separadas. Esta é a da nota: a empresa conecta a própria conta do Bling
-- ("Conectar com Bling", OAuth) e o fluxo "pedido pago" manda o pedido para
-- lá — e, se ela quiser, gera e transmite a NF-e. Quem emite pela Yampi ou
-- por outro sistema simplesmente não conecta.
--
-- O que este arquivo cria, em uma frase cada:
--   tenant_bling_connections   os tokens do Bling de cada empresa (só service_role) e as escolhas dela
--   crm_bling_status()         o que a tela vê: conectado?, empresa, validade, escolhas — nunca o token
--   crm_orders.bling_*/nfe_*   o rastro do pedido no Bling e da nota (id, chave, DANFE, situação)
--   crm_contacts.bling_contact_id   o contato correspondente no Bling (aprendido no primeiro pedido)
-- O passo de fluxo `bling_order` entra em 20260917020000 (gerado por scripts/gen-migration-bling.mjs).

create table public.tenant_bling_connections (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  company_name  text,
  -- escolhas da empresa: forma_pagamento_id (int, do Bling), forma_pagamento_nome, gerar_nfe (bool), enviar_nfe (bool)
  settings      jsonb not null default '{}'::jsonb,
  connected_by  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger tenant_bling_connections_updated_at before update on public.tenant_bling_connections for each row execute function public.handle_updated_at();

-- Mesmo cuidado de tenant_payment_credentials: REVOKE explícito (toda tabela nova nasce com ALL
-- para anon/authenticated neste banco) + RLS sem policy. Só as edge functions leem.
grant all on public.tenant_bling_connections to service_role;
revoke all on public.tenant_bling_connections from public, anon, authenticated;
alter table public.tenant_bling_connections enable row level security;

-- O que a tela vê. Nunca o token. Zero linhas = não conectado.
create or replace function public.crm_bling_status()
returns table (company_name text, expires_at timestamptz, settings jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.company_name, c.expires_at, c.settings, c.updated_at
    from public.tenant_bling_connections c
   where c.tenant_id = public.get_user_tenant_id()
     and public.has_comercial_access(auth.uid());
$$;
revoke execute on function public.crm_bling_status() from public, anon;
grant execute on function public.crm_bling_status() to authenticated;

-- O rastro no pedido: o passo do fluxo grava aqui; a tela do pedido mostra a nota e o DANFE.
-- (`crm_orders.bling_order_id` e `crm_products.bling_id` já existem desde a CRM-1, 20260910010000.)
alter table public.crm_orders
  add column bling_nfe_id   text,
  add column nfe_key        text,
  add column danfe_url      text,
  add column nfe_status     text check (nfe_status in ('order_created', 'nfe_generated', 'nfe_sent', 'error')),
  add column bling_error    text;

alter table public.crm_contacts add column bling_contact_id text;
