-- Portal do Distribuidor, parte 3 (etapa 6): o Conecta Venda. Decisões (docs/proposta-portal-distribuidor.md):
--
--   2026-10-21: o distribuidor faz o pedido NO CATÁLOGO DO CONECTA, aberto pelo app já na tabela dele, escolhendo MF
--               ou INBRAS a cada pedido; o pedido segue sozinho para o Forteplus; o Helpoint LÊ de volta (situação para
--               ele e para o Comercial, mais as sacolas abandonadas "para aumentar a venda").
--   2026-10-25 (1): estoque e preço da Minasflor são LIDOS DO CONECTA, a cada 10 minutos, nas duas contas. As chaves
--               ficam nos segredos das funções (CONECTA_CHAVE_MF, CONECTA_CHAVE_INBRAS); o dono cadastra no fim.
--
-- O robô é a função `conecta-sync` (pg_cron a cada 10 min, service_role). Sem chave, ela não faz nada e diz por quê
-- (`conecta_sincronizacoes`). A API (lida em 2026-10-25): POST https://api.conectavenda.com.br/{tabela}/{ação} com a
-- `chave` no corpo; `produtos/listar`, `catalogos/listar` (tem a tabela de preço e o link de cada catálogo),
-- `pedidos/listar` e `sacolas-abandonadas/listar` (a partir de uma `data`).
--
-- O QUE NÃO SE GUARDA: e-mail, telefone e CPF do comprador que o Conecta manda no pedido e na sacola. O pedido de
-- distribuidor é de empresa; para ligar ao distribuidor basta o CNPJ.

create table if not exists public.conecta_contas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null check (conta in ('MF', 'INBRAS')),
  -- O nome do segredo da função com a chave daquela conta (o valor nunca passa pelo banco).
  segredo text not null,
  ativo boolean not null default true,
  primary key (tenant_id, conta)
);
insert into public.conecta_contas (tenant_id, conta, segredo)
select t.id, c.conta, c.segredo from public.tenants t
  cross join (values ('MF', 'CONECTA_CHAVE_MF'), ('INBRAS', 'CONECTA_CHAVE_INBRAS')) c(conta, segredo)
 where t.slug = 'minasflor'
on conflict do nothing;

create table if not exists public.conecta_produtos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null,
  produto_id text not null,
  referencia text,
  ean text,
  nome text not null,
  grupo text,
  foto text,
  estoque integer,
  -- [{ "tabela": "VIP", "valor": 50.0 }] — o preço de cada tabela, como o Conecta manda.
  precos jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, conta, produto_id)
);

create table if not exists public.conecta_catalogos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null,
  identificacao text not null,
  descricao text,
  tabela_preco text,
  link text not null,
  vence_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, conta, identificacao)
);

create table if not exists public.conecta_pedidos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null,
  id bigint not null,
  situacao text,
  cnpj text,
  razao_social text,
  catalogo text,
  tabela text,
  valor_pedido numeric,
  valor_frete numeric,
  valor_pagamento numeric,
  link text,
  criado_em timestamptz,
  situacao_em timestamptz,
  produtos jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, conta, id)
);
create index if not exists conecta_pedidos_cnpj on public.conecta_pedidos (tenant_id, cnpj, criado_em desc);

create table if not exists public.conecta_sacolas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null,
  id bigint not null,
  situacao text,
  cnpj text,
  razao_social text,
  catalogo text,
  tabela text,
  valor_total numeric,
  link text,
  sacola_em timestamptz,
  produtos jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, conta, id)
);
create index if not exists conecta_sacolas_cnpj on public.conecta_sacolas (tenant_id, cnpj, sacola_em desc);

create table if not exists public.conecta_sincronizacoes (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null,
  ok boolean not null,
  detalhe text,
  em timestamptz not null default now()
);
create index if not exists conecta_sincronizacoes_ultima on public.conecta_sincronizacoes (tenant_id, conta, em desc);

alter table public.conecta_contas enable row level security;
alter table public.conecta_produtos enable row level security;
alter table public.conecta_catalogos enable row level security;
alter table public.conecta_pedidos enable row level security;
alter table public.conecta_sacolas enable row level security;
alter table public.conecta_sincronizacoes enable row level security;

-- A Minasflor lê tudo (o Comercial e a Diretoria; a TI acompanha a sincronização). Escreve só o robô (service_role,
-- que passa por cima de RLS). O distribuidor lê pelas funções abaixo, só o dele.
create policy conecta_produtos_select on public.conecta_produtos for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id));
create policy conecta_catalogos_select on public.conecta_catalogos for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id) or (tenant_id = public.get_user_tenant_id() and public.dist_pode_ver()));
create policy conecta_pedidos_select on public.conecta_pedidos for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id));
create policy conecta_sacolas_select on public.conecta_sacolas for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id));
create policy conecta_sincronizacoes_select on public.conecta_sincronizacoes for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id) or (tenant_id = public.get_user_tenant_id() and public.dist_pode_ver()));

-- ── O que o distribuidor vê ─────────────────────────────────────────────────────────────────────────────────────
-- A tabela de preço dele: a do cliente do Forteplus ligado (`com_clientes.tabela_preco`), sem o sufixo CONDICAO
-- (`tabela_base`). O catálogo do Conecta de cada conta com essa tabela, o que vence mais tarde.
create or replace function public.dist_minha_tabela()
returns text language sql stable security definer set search_path = public as $$
  select c.tabela_base from public.dist_distribuidores d
    join public.com_clientes c on c.tenant_id = d.tenant_id and c.codigo = d.com_cliente_codigo
   where d.id = public.dist_ativo()
$$;

create or replace function public.dist_catalogos()
returns table (conta text, descricao text, link text, tabela_preco text)
language sql stable security definer set search_path = public as $$
  select distinct on (k.conta) k.conta, k.descricao, k.link, k.tabela_preco
    from public.conecta_catalogos k
    join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = k.tenant_id
   where upper(btrim(k.tabela_preco)) = upper(btrim(public.dist_minha_tabela()))
     and (k.vence_em is null or k.vence_em > now())
   order by k.conta, k.vence_em desc nulls first
$$;

-- Os pedidos dele no Conecta (pelo CNPJ) e os carrinhos que ele montou e não fechou.
create or replace function public.dist_meus_pedidos()
returns table (conta text, id bigint, situacao text, valor_pagamento numeric, link text, criado_em timestamptz,
               situacao_em timestamptz, produtos jsonb)
language sql stable security definer set search_path = public as $$
  select p.conta, p.id, p.situacao, p.valor_pagamento, p.link, p.criado_em, p.situacao_em, p.produtos
    from public.conecta_pedidos p
    join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = p.tenant_id and d.cnpj = p.cnpj
   order by p.criado_em desc
   limit 50
$$;

create or replace function public.dist_minhas_sacolas()
returns table (conta text, id bigint, valor_total numeric, link text, sacola_em timestamptz, produtos jsonb)
language sql stable security definer set search_path = public as $$
  select s.conta, s.id, s.valor_total, s.link, s.sacola_em, s.produtos
    from public.conecta_sacolas s
    join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = s.tenant_id and d.cnpj = s.cnpj
   where s.sacola_em > now() - interval '30 days'
   order by s.sacola_em desc
   limit 10
$$;

-- O catálogo da Minasflor com o preço da tabela dele e se tem estoque (o "produto sem estoque some" é do Conecta;
-- aqui ele vê o que está disponível em cada conta).
create or replace function public.dist_produtos_da_minasflor()
returns table (conta text, referencia text, nome text, grupo text, foto text, estoque integer, preco numeric)
language sql stable security definer set search_path = public as $$
  select p.conta, p.referencia, p.nome, p.grupo, p.foto, p.estoque,
         (select (x ->> 'valor')::numeric from jsonb_array_elements(p.precos) x
           where upper(btrim(x ->> 'tabela')) = upper(btrim(public.dist_minha_tabela())) limit 1)
    from public.conecta_produtos p
    join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = p.tenant_id
   order by p.nome, p.conta
$$;

-- ── O que o Comercial vê de cada distribuidor (proposta: "o Comercial vê o estoque de cada distribuidor: o que ele
-- tem e o que precisa repor — para vender melhor"; e o pedido e o carrinho "para aumentar a venda") ────────────────
-- O distribuidor em si: o Comercial e a Diretoria passam a ler (a TI já lia; policies de SELECT somam com OR).
create policy dist_distribuidores_select_minasflor on public.dist_distribuidores for select to authenticated
  using (public.dist_minasflor_acompanha(tenant_id));

-- ponytail: o Comercial vê todos os distribuidores, sem o recorte "só a minha carteira" das vendedoras — eram ~70
-- clientes nas tabelas Atacadista e Revenda em 2026-10-21. Se passar a importar, recortar por `com_clientes.carteira`.
create or replace function public.dist_painel_comercial()
returns table (id uuid, razao_social text, cidade text, uf text, com_cliente_codigo text, tabela text,
               saloes int, clientes int, testando int, vendas_30_dias numeric, ultima_venda date,
               ultimo_pedido_em timestamptz, ultimo_pedido_situacao text, carrinhos_abertos numeric, produtos_acabando int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.dist_minasflor_acompanha(v_tenant) then
    raise exception 'Só o Comercial e a Diretoria acompanham os distribuidores.' using errcode = '42501';
  end if;
  return query
  select d.id, d.razao_social, d.cidade, d.uf, d.com_cliente_codigo, c.tabela_base,
         (select count(*)::int from public.dist_saloes s where s.distribuidor_id = d.id and s.etapa <> 'perdido'),
         (select count(*)::int from public.dist_saloes s where s.distribuidor_id = d.id and s.etapa = 'cliente'),
         (select count(*)::int from public.dist_saloes s where s.distribuidor_id = d.id and s.etapa = 'testando'),
         (select coalesce(sum(v.total), 0) from public.dist_vendas v where v.distribuidor_id = d.id and v.data > v_hoje - 30),
         (select max(v.data) from public.dist_vendas v where v.distribuidor_id = d.id),
         p.criado_em, p.situacao,
         (select sum(k.valor_total) from public.conecta_sacolas k
           where k.tenant_id = d.tenant_id and k.cnpj = d.cnpj and k.sacola_em > now() - interval '30 days'
             and not exists (select 1 from public.conecta_pedidos q where q.tenant_id = k.tenant_id and q.cnpj = k.cnpj
                              and q.criado_em > k.sacola_em)),
         (select count(*)::int from public.dist_estoque(d.id) e
           where e.vendeu_60_dias > 0 and e.saldo <= greatest(1, ceil(e.vendeu_60_dias / 4)))
    from public.dist_distribuidores d
    left join public.com_clientes c on c.tenant_id = d.tenant_id and c.codigo = d.com_cliente_codigo
    left join lateral (select q.criado_em, q.situacao from public.conecta_pedidos q
                        where q.tenant_id = d.tenant_id and q.cnpj = d.cnpj order by q.criado_em desc nulls last limit 1) p on true
   where d.tenant_id = v_tenant and d.status = 'liberado'
   order by d.razao_social;
end;
$$;

-- ── O robô a cada 10 minutos ────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-sync-10min') then
    perform cron.unschedule('conecta-sync-10min');
  end if;
end $$;
select cron.schedule(
  'conecta-sync-10min',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/conecta-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- ── Lição 14 ────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.dist_minha_tabela() from public, anon;
revoke all on function public.dist_catalogos() from public, anon;
revoke all on function public.dist_meus_pedidos() from public, anon;
revoke all on function public.dist_minhas_sacolas() from public, anon;
revoke all on function public.dist_produtos_da_minasflor() from public, anon;
revoke all on function public.dist_painel_comercial() from public, anon;
grant execute on function public.dist_minha_tabela() to authenticated;
grant execute on function public.dist_catalogos() to authenticated;
grant execute on function public.dist_meus_pedidos() to authenticated;
grant execute on function public.dist_minhas_sacolas() to authenticated;
grant execute on function public.dist_produtos_da_minasflor() to authenticated;
grant execute on function public.dist_painel_comercial() to authenticated;
