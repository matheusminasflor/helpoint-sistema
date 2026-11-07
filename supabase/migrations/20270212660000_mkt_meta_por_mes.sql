-- O MÊS EXATO DA META (dono, 2026-11-07, proposta v4 https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr: "Mês passado"
-- do dia 1 ao último). A semana conta no mês do domingo e por isso "outubro" perdia 26 a 31/10. O alcance não se soma
-- (a mesma pessoa em dois dias conta uma vez), então o mês não sai das semanas nem dos dias: o coletor `mkt-meta-coletar`
-- pede à Meta o mês inteiro, como faz com a semana, e grava aqui. A tela usa estas linhas quando o período é um mês
-- inteiro e as semanas nos outros casos. Mesmas colunas e permissões das semanas; só o coletor grava.
create table public.mkt_redes_mes (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  conta text not null check (length(btrim(conta)) > 0),
  posts integer, reels integer, stories integer, engajamento numeric(6,2),
  novos_seguidores integer, quedas_seguidores integer, total_seguidores integer, visitas_perfil integer,
  alcance integer, visualizacoes integer, publicacoes jsonb,
  investimento numeric(12,2), alcance_pago integer, visitas_pagas integer, campanhas_ativas integer, campanhas jsonb,
  coletado_em timestamptz not null default now(),
  primary key (tenant_id, mes, conta)
);

create table public.mkt_trafego_mes (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  investimento numeric(12,2), alcance integer, visitas_perfil integer, campanhas_ativas integer,
  coletado_em timestamptz not null default now(),
  primary key (tenant_id, mes)
);

alter table public.mkt_redes_mes enable row level security;
alter table public.mkt_trafego_mes enable row level security;
revoke all on public.mkt_redes_mes, public.mkt_trafego_mes from public, anon, authenticated;
grant select on public.mkt_redes_mes, public.mkt_trafego_mes to authenticated;

create policy mkt_redes_mes_le on public.mkt_redes_mes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_trafego_mes_le on public.mkt_trafego_mes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
