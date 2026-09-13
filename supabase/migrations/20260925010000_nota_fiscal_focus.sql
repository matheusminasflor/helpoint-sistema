-- Leva ENC-3: o encaixe "emitir nota" com a Focus NFe. 2026-09-13 (ADR-009).
--
-- É o padrão do caminho nativo: quem não roda num ERP emite por aqui. A empresa
-- sobe o certificado A1 **uma vez** no painel da Focus e cola o token aqui; o
-- Helpoint manda o pedido e recebe número, chave, DANFE e XML. Emitir direto na
-- SEFAZ foi recusado no ADR-009 (certificado, regra por estado, contingência).
--
-- Quem já tem Bling continua emitindo por lá: o encaixe tem provedor por
-- empresa, como o da etiqueta — `tenants.settings.crm.nfe_provider`.
--
-- O que este arquivo cria:
--   tenant_focusnfe_connections  o token da empresa na Focus (só service_role)
--   crm_nfe_status()             o que a tela vê: provedor, se está ligado,
--                                ambiente, CNPJ, série — nunca o token
--   crm_set_config()             grava uma chave de `settings.crm` sem corrida
--   crm_orders.nfe_*             o rastro da nota, agora de qualquer provedor
--   crm_products fiscais         NCM, CFOP, origem e CST — a nota é recusada sem
--   crm_contacts.state_registration   inscrição estadual (vazio = não contribuinte)

-- ── 1. A conexão da empresa com a Focus ─────────────────────────────────────
create table public.tenant_focusnfe_connections (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  token            text not null,
  -- 'homologacao' fala com o ambiente de teste deles: nota sem valor fiscal.
  ambiente         text not null default 'homologacao' check (ambiente in ('homologacao', 'producao')),
  cnpj_emitente    text not null,
  serie            integer not null default 1,
  natureza_operacao text not null default 'Venda de mercadoria',
  cfop_padrao      text not null default '5102',
  connected_by     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger tenant_focusnfe_connections_updated_at before update on public.tenant_focusnfe_connections
  for each row execute function public.handle_updated_at();

-- Mesmo cuidado das outras tabelas de segredo: REVOKE explícito além do RLS sem
-- policy (neste banco toda tabela nova nasce com ALL para anon/authenticated).
grant all on public.tenant_focusnfe_connections to service_role;
revoke all on public.tenant_focusnfe_connections from public, anon, authenticated;
alter table public.tenant_focusnfe_connections enable row level security;

-- ── 2. O que a tela vê. Nunca o token. ──────────────────────────────────────
create or replace function public.crm_nfe_status()
returns table (
  provider text, focus_ligado boolean, token_last4 text, ambiente text,
  cnpj_emitente text, serie integer, natureza_operacao text, cfop_padrao text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.settings #>> '{crm,nfe_provider}', 'nenhum'),
         c.tenant_id is not null,
         right(c.token, 4),
         c.ambiente,
         c.cnpj_emitente,
         c.serie,
         c.natureza_operacao,
         c.cfop_padrao,
         c.updated_at
    from public.tenants t
    left join public.tenant_focusnfe_connections c on c.tenant_id = t.id
   where t.id = public.get_user_tenant_id()
     and public.has_crm_access(auth.uid());
$$;
revoke execute on function public.crm_nfe_status() from public, anon;
grant execute on function public.crm_nfe_status() to authenticated;

-- ── 3. Uma chave de configuração do CRM por vez, sem corrida ────────────────
-- Mesmo desenho de `exp_set_config`: ler e reescrever o jsonb inteiro perde a
-- escrita de quem salvar outra coisa ao mesmo tempo.
create or replace function public.crm_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if v_tenant is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'só dono ou administrador muda a configuração do CRM' using errcode = '42501';
  end if;
  if p_key not in ('nfe_provider') then
    raise exception 'configuração desconhecida: %', p_key using errcode = '22023';
  end if;

  update public.tenants
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object(
                         'crm',
                         coalesce(settings -> 'crm', '{}'::jsonb) || jsonb_build_object(p_key, p_value)
                       )
   where id = v_tenant;

  if not found then
    raise exception 'a configuração não foi gravada' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.crm_set_config(text, jsonb) from public, anon;
grant execute on function public.crm_set_config(text, jsonb) to authenticated;

-- ── 4. O rastro da nota deixa de ser só do Bling ────────────────────────────
-- `bling_error` guardava o erro da nota, não do Bling: com dois provedores o
-- nome enganava. Vira `nfe_error`.
alter table public.crm_orders rename column bling_error to nfe_error;

alter table public.crm_orders
  add column nfe_provider text check (nfe_provider in ('focusnfe', 'bling')),
  add column nfe_ref      text,          -- a referência que a Focus usa para achar a nota
  add column nfe_number   text,
  add column nfe_xml_url  text;

-- A Focus tem estados próprios; os do Bling continuam valendo.
alter table public.crm_orders drop constraint crm_orders_nfe_status_check;
alter table public.crm_orders
  add constraint crm_orders_nfe_status_check
  check (nfe_status in ('order_created', 'nfe_generated', 'nfe_sent', 'processing', 'authorized', 'cancelled', 'error'));

create unique index crm_orders_nfe_ref_idx on public.crm_orders (tenant_id, nfe_ref) where nfe_ref is not null;

-- ── 5. O que a SEFAZ exige e o cadastro ainda não tinha ─────────────────────
alter table public.crm_products
  add column ncm_code    text,
  add column cfop        text,
  add column icms_origem smallint not null default 0 check (icms_origem between 0 and 8),
  add column icms_cst    text;

comment on column public.crm_products.ncm_code is
  'NCM do produto, 8 dígitos. A SEFAZ recusa a nota sem ele (ENC-3).';

alter table public.crm_contacts add column state_registration text;
comment on column public.crm_contacts.state_registration is
  'Inscrição estadual do cliente. Vazio = não contribuinte (indicador 9 na NF-e).';
