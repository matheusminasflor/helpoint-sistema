-- MENSAGEM NO CHAMADO SÓ PARA QUEM PODE (migration 20270122010000; dono, 2026-10-15). Como o Matheus Freitas
-- ("Somente leitura" de Compras) respondendo #89 e #90.
--   1  "Somente leitura" de Compras vê a compra, mas não manda mensagem
--   2  quem pediu manda mensagem
--   3  quem executa a compra manda mensagem
--   4  quem não enxerga o chamado (de outro setor) não manda mensagem
--   5  a função nova não abre para anon
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

create temporary table pedido (ticket uuid) on commit drop;
grant select, insert on pedido to authenticated;
select tests.authenticate_as('ana@msgpode.test');
insert into pedido select public.compras_abrir_pedido('{"title":"Cabo","priority":"low"}'::jsonb,
  '{"product_name":"Cabo","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja","valor_unitario":"10","link":"https://l"}]'::jsonb);
select tests.clear_authentication();

create or replace function pg_temp.escreve(p_quem uuid) returns text language plpgsql as $$
begin
  execute format($q$ insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
                     values (%L::uuid, %L::uuid, %L::uuid, 'Oi') returning id $q$,
                 (select tenant from f), (select ticket from pedido), p_quem);
  return 'escreveu';
end;
$$;

select tests.authenticate_as('leitor@msgpode.test');
select throws_ok($$ select pg_temp.escreve((select leitor from u)) $$, '42501', null, 'somente leitura ve a compra mas nao manda mensagem');
select tests.clear_authentication();

select tests.authenticate_as('ana@msgpode.test');
select lives_ok($$ select pg_temp.escreve((select ana from u)) $$, 'quem pediu manda mensagem');
select tests.clear_authentication();

select tests.authenticate_as('comp@msgpode.test');
select lives_ok($$ select pg_temp.escreve((select comp from u)) $$, 'quem executa a compra manda mensagem');
select tests.clear_authentication();

select tests.authenticate_as('beto@msgpode.test');
select throws_ok($$ select pg_temp.escreve((select beto from u)) $$, '42501', null, 'quem nao enxerga o chamado nao manda mensagem');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.pode_comentar_no_chamado(uuid)', 'execute'), 'a funcao nova nao abre para anon');

select * from finish();
rollback;
