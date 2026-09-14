-- CRM-4c: o que o Lead Ads precisa e o Marketing não tem. 2026-09-13.
--
-- A página do Facebook **já é conectada** pelo Marketing (`mkt-meta-oauth` →
-- `mkt_social_accounts` + `mkt_social_account_secrets`), e é de lá que sai o
-- token para buscar o lead na Graph API. Duplicar esse token aqui seria ter
-- duas verdades sobre a mesma conta.
--
-- O que falta para o Lead Ads são duas coisas que o Marketing nunca precisou,
-- porque ele só publica e não **recebe**: o segredo do aplicativo, para provar
-- que a chamada veio da Meta, e a chave de verificação que ela pede ao cadastrar
-- o webhook. Ficam aqui, fechadas como as irmãs.
create table if not exists public.tenant_lead_ads_connections (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  app_secret    text,
  verify_token  text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  is_active     boolean not null default true,
  connected_by  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.tenant_lead_ads_connections enable row level security;
revoke all on public.tenant_lead_ads_connections from anon, authenticated;

create trigger handle_tenant_lead_ads_updated_at before update on public.tenant_lead_ads_connections
  for each row execute function public.handle_updated_at();

-- A página que manda o lead diz de quem ele é. O índice em `mkt_social_accounts`
-- é o que deixa a edge function achar a empresa pelo `page_id` do webhook sem
-- varrer tabela.
create index if not exists mkt_social_accounts_page_idx
  on public.mkt_social_accounts (page_id) where page_id is not null;
