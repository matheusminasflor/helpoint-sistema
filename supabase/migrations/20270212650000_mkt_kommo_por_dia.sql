-- KOMMO POR DIA, COM VENDAS GANHAS E PERDIDAS (dono, 2026-11-07, proposta v4 https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr):
-- "quantos leads chegaram, quantas vendas ganhas e perdidas e seus segmentos". Decisões: ganha/perdida conta no dia em
-- que fechou; os números ficam por dia, para "Mês passado" ser do dia 1 ao último. O robô `mkt-kommo-coletar` reconta
-- tudo desde o começo do ano a cada leitura e troca as linhas (o lead triado depois muda de funil).
-- As colunas de leads de `mkt_trafego_semana` deixam de ser usadas pela tela; ficam com o histórico.
create table public.mkt_kommo_dia (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  dia date not null,
  funil text not null check (funil in ('salao', 'distribuidor', 'consumidor', 'sem_triagem')),
  chegaram integer not null default 0 check (chegaram >= 0),
  ganhas integer not null default 0 check (ganhas >= 0),
  perdidas integer not null default 0 check (perdidas >= 0),
  valor_ganho numeric(14,2) not null default 0,
  primary key (tenant_id, dia, funil)
);

-- Os motivos das vendas perdidas, no dia em que perderam. Sem motivo anotado no Kommo, motivo nulo.
create table public.mkt_kommo_perdas (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  dia date not null,
  funil text not null check (funil in ('salao', 'distribuidor', 'consumidor', 'sem_triagem')),
  motivo text,
  quantos integer not null check (quantos > 0)
);
create index mkt_kommo_perdas_dia on public.mkt_kommo_perdas (tenant_id, dia);

alter table public.mkt_kommo_dia enable row level security;
alter table public.mkt_kommo_perdas enable row level security;
revoke all on public.mkt_kommo_dia, public.mkt_kommo_perdas from anon;
revoke insert, update, delete on public.mkt_kommo_dia, public.mkt_kommo_perdas from authenticated;
grant select on public.mkt_kommo_dia, public.mkt_kommo_perdas to authenticated;

-- Quem lê é quem lê os Indicadores do Marketing (como `mkt_trafego_semana`).
create policy mkt_kommo_dia_le on public.mkt_kommo_dia for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_kommo_perdas_le on public.mkt_kommo_perdas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));

-- Troca tudo a partir de `p_desde` numa transação só: a tela nunca vê o meio da troca.
create function public.mkt_kommo_gravar(p_tenant uuid, p_desde date, p_dias jsonb, p_perdas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mkt_kommo_dia where tenant_id = p_tenant and dia >= p_desde;
  delete from public.mkt_kommo_perdas where tenant_id = p_tenant and dia >= p_desde;
  insert into public.mkt_kommo_dia (tenant_id, dia, funil, chegaram, ganhas, perdidas, valor_ganho)
  select p_tenant, d.dia, d.funil, d.chegaram, d.ganhas, d.perdidas, d.valor_ganho
    from jsonb_to_recordset(p_dias) as d(dia date, funil text, chegaram int, ganhas int, perdidas int, valor_ganho numeric)
   where d.dia >= p_desde;
  insert into public.mkt_kommo_perdas (tenant_id, dia, funil, motivo, quantos)
  select p_tenant, p.dia, p.funil, p.motivo, p.quantos
    from jsonb_to_recordset(p_perdas) as p(dia date, funil text, motivo text, quantos int)
   where p.dia >= p_desde;
end;
$$;
revoke all on function public.mkt_kommo_gravar(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.mkt_kommo_gravar(uuid, date, jsonb, jsonb) to service_role;
