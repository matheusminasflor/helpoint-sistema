-- REDES SOCIAIS E TRÁFEGO PAGO LANÇADOS À MÃO, POR SEMANA (dono, 2026-11-03: "enquanto você monta de forma que puxa
-- os dados pela API da Meta, cria de forma manual onde posso preencher esses indicadores se eu quiser"). As mesmas abas
-- da planilha GESTAO_MKT_E_TI: "MKT - Redes" (uma linha por conta por semana) e "MKT - Tráfego e Comunidade" (uma linha
-- por semana). A data é SEMPRE o domingo que fecha a semana, como a planilha pede.
-- Ler: quem vê os Indicadores do Marketing e a Diretoria. Lançar: "Lançar redes e tráfego" (reports › lancar) no perfil
-- do Marketing (dono e admin passam sempre).

create table if not exists public.mkt_redes_semana (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  semana date not null check (extract(isodow from semana) = 7),
  conta text not null check (length(btrim(conta)) > 0),
  posts integer check (posts >= 0),
  reels integer check (reels >= 0),
  stories integer check (stories >= 0),
  engajamento numeric(6,2) check (engajamento >= 0),
  novos_seguidores integer check (novos_seguidores >= 0),
  quedas_seguidores integer check (quedas_seguidores >= 0),
  total_seguidores integer check (total_seguidores >= 0),
  visitas_perfil integer check (visitas_perfil >= 0),
  compartilhamentos integer check (compartilhamentos >= 0),
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, semana, conta)
);

create table if not exists public.mkt_trafego_semana (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  semana date not null check (extract(isodow from semana) = 7),
  investimento numeric(12,2) check (investimento >= 0),
  alcance integer check (alcance >= 0),
  visitas_perfil integer check (visitas_perfil >= 0),
  campanhas_ativas integer check (campanhas_ativas >= 0),
  leads_distribuidor integer check (leads_distribuidor >= 0),
  leads_consumidor integer check (leads_consumidor >= 0),
  leads_salao integer check (leads_salao >= 0),
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, semana)
);

alter table public.mkt_redes_semana enable row level security;
alter table public.mkt_trafego_semana enable row level security;
revoke all on public.mkt_redes_semana, public.mkt_trafego_semana from anon;
grant select, insert, update, delete on public.mkt_redes_semana, public.mkt_trafego_semana to authenticated;

create policy mkt_redes_semana_le on public.mkt_redes_semana for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_redes_semana_lanca on public.mkt_redes_semana for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'reports', 'lancar')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'reports', 'lancar')));

create policy mkt_trafego_semana_le on public.mkt_trafego_semana for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_trafego_semana_lanca on public.mkt_trafego_semana for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'reports', 'lancar')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'reports', 'lancar')));
