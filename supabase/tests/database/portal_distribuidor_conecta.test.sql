-- Portal do Distribuidor, parte 3 (migration 20270204030000): o que vem do Conecta Venda.
--
-- O que justifica a suíte: o distribuidor abre o catálogo DA TABELA DELE (a do cliente do Forteplus, sem o
-- "CONDICAO") e vê só os pedidos e carrinhos do CNPJ dele; o preço que aparece é o da tabela dele.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dist3', 'Distribuidora Tres', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, tabela_preco, ativo, origem)
values ((select a from f), 'D-1', 'DISTRIBUIDORA TRES LTDA', '08319138000160', 'VIP CONDICAO', true, 'cadastro');

create temporary table u on commit drop as
select tests.create_customer('dono@d3.test', (select a from f))  as dono,
       tests.create_customer('outro@d3.test', (select a from f)) as outro,
       tests.create_user('comercial@d3.test', (select a from f)) as comercial;
select tests.grant_module((select comercial from u), (select a from f), 'comercial');

with novo as (
  insert into public.dist_distribuidores (tenant_id, razao_social, cnpj, status, com_cliente_codigo, pedido_por)
  select a, 'Distribuidora Tres', '08319138000160', 'liberado', 'D-1', (select dono from u) from f returning id
)
insert into public.dist_membros (tenant_id, distribuidor_id, user_id, email, papel)
select (select a from f), novo.id, (select dono from u), 'dono@d3.test', 'dono' from novo;
grant select on f, u to authenticated;

-- O que o robô teria gravado.
insert into public.conecta_catalogos (tenant_id, conta, identificacao, descricao, tabela_preco, link) values
  ((select a from f), 'MF', 'cat-vip', 'Catálogo VIP', 'VIP', 'https://app.conectavenda.com.br/vip'),
  ((select a from f), 'MF', 'cat-rev', 'Catálogo Revenda', 'REVENDA', 'https://app.conectavenda.com.br/rev'),
  ((select a from f), 'INBRAS', 'cat-vip-i', 'Catálogo VIP INBRAS', 'vip', 'https://app.conectavenda.com.br/vipi');
insert into public.conecta_produtos (tenant_id, conta, produto_id, nome, estoque, precos) values
  ((select a from f), 'MF', '1', 'Shampoo', 12, '[{"tabela": "REVENDA", "valor": 80}, {"tabela": "VIP", "valor": 50}]');
insert into public.conecta_pedidos (tenant_id, conta, id, situacao, cnpj, valor_pagamento, criado_em) values
  ((select a from f), 'MF', 101, 'em_aberto', '08319138000160', 500, now()),
  ((select a from f), 'MF', 102, 'pago', '11222333000181', 900, now());
insert into public.conecta_sacolas (tenant_id, conta, id, cnpj, valor_total, sacola_em) values
  ((select a from f), 'INBRAS', 201, '08319138000160', 300, now());

select tests.authenticate_as('dono@d3.test');
select is((select string_agg(conta || ':' || link, ',' order by conta) from public.dist_catalogos()),
  'INBRAS:https://app.conectavenda.com.br/vipi,MF:https://app.conectavenda.com.br/vip',
  'o catalogo de cada conta e o da tabela dele, sem o CONDICAO');
select is((select string_agg(id::text, ',') from public.dist_meus_pedidos()), '101', 'ele ve so os pedidos do CNPJ dele');
select is((select count(*)::int from public.dist_minhas_sacolas()), 1, 'e o carrinho que nao fechou');
select is((select preco from public.dist_produtos_da_minasflor()), 50::numeric, 'o preco e o da tabela dele');
select is((select count(*)::int from public.conecta_pedidos), 0, 'a tabela de pedidos nao abre direto para ele');

select tests.clear_authentication();
select tests.authenticate_as('outro@d3.test');
select is((select count(*)::int from public.dist_meus_pedidos()), 0, 'quem nao e distribuidor nao ve pedido nenhum');
select throws_ok($$ select * from public.dist_painel_comercial() $$, '42501', null, 'nem o painel do Comercial');

select tests.clear_authentication();
select tests.authenticate_as('comercial@d3.test');
select is((select count(*)::int from public.conecta_pedidos), 2, 'o Comercial ve todos os pedidos do Conecta');
select is((select row(razao_social, tabela, carrinhos_abertos)::text from public.dist_painel_comercial()),
  '("Distribuidora Tres",VIP,300)', 'o painel do Comercial mostra o distribuidor, a tabela e o carrinho aberto');

select * from finish();
rollback;
