-- MENSAGEM NA COMPRA SÓ PARA QUEM PODE (migration 20270122010000; dono, 2026-10-15). Como o Matheus Freitas
-- ("Somente leitura" de Compras) respondendo #89 e #90. Era a mensagem no chamado da compra; desde 20270206010000 a
-- compra é um pedido e a mensagem é `pedido_escrever` — a regra do dono continua a mesma.
--   1  "Somente leitura" de Compras vê a compra, mas não manda mensagem
--   2  quem pediu manda mensagem
--   3  quem executa a compra manda mensagem
--   4  quem não enxerga o pedido (de outro setor) não manda mensagem
--   5  a porta não abre para anon
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-msg-pode', 'Msg Pode') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@msgpode.test', (select tenant from f)) as ana,
       tests.create_user('leitor@msgpode.test', (select tenant from f)) as leitor,
       tests.create_user('comp@msgpode.test', (select tenant from f)) as comp,
       tests.create_user('beto@msgpode.test', (select tenant from f)) as beto;
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'compras', p, perm::jsonb from f,
  (values ('Leitor', '{"solicitacoes": {"view": true}}'), ('Comprador', '{"solicitacoes": {"view": true, "execute": true}}')) x(p, perm);
select tests.grant_module((select leitor from u), (select tenant from f), 'compras');
select tests.grant_profile((select leitor from u), (select tenant from f), 'compras', 'Leitor');
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Comprador');
grant select on f, u to authenticated;

create temporary table pedido (solicitacao uuid) on commit drop;
grant select, insert on pedido to authenticated;
select tests.authenticate_as('ana@msgpode.test');
insert into pedido select public.compras_abrir_pedido('{"title":"Cabo","priority":"low"}'::jsonb,
  '{"product_name":"Cabo","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja","valor_unitario":"10","link":"https://l"}]'::jsonb);
select tests.clear_authentication();

select tests.authenticate_as('leitor@msgpode.test');
select throws_ok($$ select public.pedido_escrever((select solicitacao from pedido), 'Oi') $$, '42501', null,
  'somente leitura ve a compra mas nao manda mensagem');
select tests.clear_authentication();

select tests.authenticate_as('ana@msgpode.test');
select lives_ok($$ select public.pedido_escrever((select solicitacao from pedido), 'Oi') $$, 'quem pediu manda mensagem');
select tests.clear_authentication();

select tests.authenticate_as('comp@msgpode.test');
select lives_ok($$ select public.pedido_escrever((select solicitacao from pedido), 'Oi') $$, 'quem executa a compra manda mensagem');
select tests.clear_authentication();

-- Quem não vê o pedido nem fica sabendo que ele existe: "não encontrado".
select tests.authenticate_as('beto@msgpode.test');
select throws_ok($$ select public.pedido_escrever((select solicitacao from pedido), 'Oi') $$, 'P0002', null,
  'quem nao enxerga o pedido nao manda mensagem');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.pedido_escrever(uuid, text)', 'execute'), 'a porta nao abre para anon');

select * from finish();
rollback;
