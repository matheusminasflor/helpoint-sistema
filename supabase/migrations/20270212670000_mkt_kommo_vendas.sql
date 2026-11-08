-- AS VENDAS DO KOMMO COM NOME (dono, 2026-11-07, proposta v5 https://claude.ai/artifact/BdbduFL8B9PraSeBTmffMU, etapa 1 do
-- roteiro https://claude.ai/artifact/EJCnWZQp3GSwYXQzFUwf3g): "quem é esse lead? Qual é o nome?". Cada venda ganha ou
-- perdida, com o nome do contato, o segmento (funil em que está), o valor, o dia em que fechou, o motivo da perda e o link
-- do lead no Kommo. A tela tira daqui a lista e as pendências (ganha sem valor, ganha sem segmento, perdida sem motivo).
-- O robô `mkt-kommo-coletar` troca tudo a partir da data a cada leitura, como os dias.
create table public.mkt_kommo_vendas (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lead_id bigint not null,
  nome text not null,
  funil text not null check (funil in ('salao', 'distribuidor', 'consumidor', 'sem_triagem')),
  situacao text not null check (situacao in ('ganha', 'perdida')),
  valor numeric(14,2) not null default 0,
  fechou date not null,
  motivo text,
  link text not null,
  primary key (tenant_id, lead_id)
);
create index mkt_kommo_vendas_fechou on public.mkt_kommo_vendas (tenant_id, fechou);

alter table public.mkt_kommo_vendas enable row level security;
revoke all on public.mkt_kommo_vendas from public, anon, authenticated;
grant select on public.mkt_kommo_vendas to authenticated;
create policy mkt_kommo_vendas_le on public.mkt_kommo_vendas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));

create function public.mkt_kommo_gravar_vendas(p_tenant uuid, p_desde date, p_vendas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mkt_kommo_vendas where tenant_id = p_tenant and fechou >= p_desde;
  insert into public.mkt_kommo_vendas (tenant_id, lead_id, nome, funil, situacao, valor, fechou, motivo, link)
  select p_tenant, v.lead_id, v.nome, v.funil, v.situacao, v.valor, v.fechou, v.motivo, v.link
    from jsonb_to_recordset(p_vendas) as v(lead_id bigint, nome text, funil text, situacao text, valor numeric, fechou date, motivo text, link text)
   where v.fechou >= p_desde
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, funil = excluded.funil, situacao = excluded.situacao, valor = excluded.valor,
        fechou = excluded.fechou, motivo = excluded.motivo, link = excluded.link;
end;
$$;
revoke all on function public.mkt_kommo_gravar_vendas(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.mkt_kommo_gravar_vendas(uuid, date, jsonb) to service_role;
